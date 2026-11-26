// Supabase Edge Function: notify-waitlist
//
// Called by a Supabase Database Webhook whenever a row is INSERTED into `waitlist_entries`
// (someone joined the waiting list of a full class). It emails the details of the request to
//   1) the school (the contact email saved on the school), and
//   2) the Book@Class administrator (MAIL_TO, e.g. info@bookaclass.gr)
// through the same Papaki SMTP server as `notify-school-application`, then records the result
// (sent / failed) on the waiting list row.
//
// The entry is always saved first by the website; this function runs afterwards, so a failed
// email can never lose a waiting list request.
//
// Secrets (the SAME ones as notify-school-application, nothing new is needed):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_TO, WEBHOOK_SECRET, MAIL_FROM (optional)
// Supabase provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY automatically.

import { SMTPClient } from "https://deno.land/x/denomailer@1.4.0/mod.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

type Row = {
  id: string;
  class_id: string;
  store_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  privacy_accepted_at: string | null;
  created_at: string | null;
  email_status: string | null;
  email_attempts: number | null;
};

type Details = {
  classTitle: string;
  schedule: string;
  schoolName: string;
  schoolEmail: string;
};

type WebhookPayload = {
  type: string;
  table: string;
  record: Row | null;
  old_record: Row | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

// ---------- small helpers (pure functions) ----------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One safe line of text: no line breaks or control characters (protects email headers). */
function cleanLine(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

function truncate(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length > max ? chars.slice(0, max).join("") + "..." : value;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Makes a header value safe for any characters (e.g. Greek) using RFC 2047 encoded words. */
function encodeHeader(value: string): string {
  const clean = cleanLine(value);
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;
  const enc = new TextEncoder();
  const words: string[] = [];
  let chunk = "";
  const flush = () => {
    if (chunk) {
      words.push(`=?UTF-8?B?${toBase64(enc.encode(chunk))}?=`);
      chunk = "";
    }
  };
  for (const ch of clean) {
    if (enc.encode(chunk + ch).length > 30) flush();
    chunk += ch;
  }
  flush();
  return words.join(" ");
}

function formatDate(iso: string | null, locale: string): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return iso ?? "";
  return date.toLocaleString(locale, {
    timeZone: "Europe/Athens",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type Mail = { subject: string; text: string; html: string };

/** A simple two-column table + plain text version. Every value is escaped for HTML. */
function buildMail(
  subject: string,
  heading: string,
  intro: string,
  fields: Array<[string, string]>,
  footer: string,
): Mail {
  const td = "padding:8px 10px;border-bottom:1px solid #e7e5e4;vertical-align:top;font-size:14px;";
  const rowsHtml = fields
    .map(([label, value]) => {
      const shown = value.trim() ? escapeHtml(value.trim()) : "&mdash;";
      return `<tr><td style="${td}font-weight:600;width:190px;color:#57534e;">${escapeHtml(label)}</td><td style="${td}white-space:pre-wrap;">${shown}</td></tr>`;
    })
    .join("");
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#292524;">` +
    `<h2 style="color:#0f766e;margin:0 0 6px;">${escapeHtml(heading)}</h2>` +
    `<p style="margin:0 0 16px;color:#57534e;font-size:14px;">${escapeHtml(intro)}</p>` +
    `<table style="border-collapse:collapse;width:100%;border:1px solid #e7e5e4;">${rowsHtml}</table>` +
    `<p style="margin:16px 0 0;color:#78716c;font-size:12px;">${escapeHtml(footer)}</p>` +
    `</div>`;
  const text = [
    heading.toUpperCase(),
    "",
    intro,
    "",
    ...fields.map(([label, value]) => `${label}: ${value.trim() ? value.trim() : "-"}`),
    "",
    footer,
  ].join("\n");
  return { subject: encodeHeader(subject), text, html };
}

function buildSchoolMail(row: Row, d: Details): Mail {
  const when = formatDate(row.created_at, "el-GR");
  const consent = row.privacy_accepted_at ? formatDate(row.privacy_accepted_at, "el-GR") : "Δεν καταγράφηκε";
  return buildMail(
    `Νέο αίτημα λίστας αναμονής: ${truncate(cleanLine(d.classTitle), 60)}`,
    "Νέο αίτημα στη λίστα αναμονής",
    `Κάποιος ζήτησε να μπει στη λίστα αναμονής για το μάθημα «${cleanLine(d.classTitle)}» της σχολής «${cleanLine(d.schoolName)}», το οποίο είναι προς το παρόν πλήρες. Επικοινωνήστε μαζί του αν ελευθερωθεί θέση.`,
    [
      ["Όνομα", row.name ?? ""],
      ["Email", row.email ?? ""],
      ["Τηλέφωνο", row.phone ?? ""],
      ["Μάθημα", d.classTitle],
      ["Πρόγραμμα", d.schedule],
      ["Ημερομηνία αιτήματος", when],
      ["Αποδοχή πολιτικής απορρήτου", consent],
    ],
    "Μπορείτε να απαντήσετε σε αυτό το email για να επικοινωνήσετε απευθείας με τον ενδιαφερόμενο. Αποστολή από το Book@Class.",
  );
}

function buildAdminMail(row: Row, d: Details): Mail {
  const when = formatDate(row.created_at, "en-GB") + " (Athens time)";
  const consent = row.privacy_accepted_at
    ? `Yes (${formatDate(row.privacy_accepted_at, "en-GB")})`
    : "Not recorded";
  return buildMail(
    `New waiting list request: ${truncate(cleanLine(d.classTitle), 60)} - ${truncate(cleanLine(d.schoolName), 40)}`,
    "New waiting list request",
    `Someone asked to join the waiting list of a full class. The school has been emailed too.`,
    [
      ["Name", row.name ?? ""],
      ["Email", row.email ?? ""],
      ["Phone", row.phone ?? ""],
      ["School", d.schoolName],
      ["School email", d.schoolEmail],
      ["Class", d.classTitle],
      ["Class schedule", d.schedule],
      ["Requested", when],
      ["Privacy policy accepted", consent],
      ["Entry ID", row.id],
    ],
    "Reply to this email to contact the person directly. You can manage the list in the Admin Dashboard (Waiting list tab).",
  );
}

// ---------- database access (plain REST calls, no extra libraries) ----------

function dbUrl(): string {
  return Deno.env.get("SUPABASE_URL") ?? "";
}
function dbKey(): string {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
function dbHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: dbKey(), Authorization: `Bearer ${dbKey()}`, ...extra };
}

/** Updates one waiting list row. If `onlyIfStatus` is given, the update only happens when the
 *  row still has that email status (this "claims" the entry so it is never emailed twice). */
async function patchEntry(
  id: string,
  fields: Record<string, unknown>,
  onlyIfStatus?: string,
): Promise<Row[]> {
  if (!UUID_RE.test(id)) throw new Error("Invalid waiting list id");
  const filter = onlyIfStatus ? `&email_status=eq.${encodeURIComponent(onlyIfStatus)}` : "";
  const res = await fetch(`${dbUrl()}/rest/v1/waitlist_entries?id=eq.${id}${filter}`, {
    method: "PATCH",
    headers: dbHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Database update failed (HTTP ${res.status})`);
  return (await res.json()) as Row[];
}

/** Reads the class (and its school) from the real class record. */
async function loadDetails(classId: string): Promise<Details> {
  if (!UUID_RE.test(classId)) throw new Error("Invalid class id");
  const res = await fetch(
    `${dbUrl()}/rest/v1/classes?id=eq.${classId}&select=title,weekly_schedule,store:stores(name,email)`,
    { headers: dbHeaders() },
  );
  if (!res.ok) throw new Error(`Could not read the class (HTTP ${res.status})`);
  const rows = (await res.json()) as Array<{
    title: string | null;
    weekly_schedule: string | null;
    store: { name: string | null; email: string | null } | null;
  }>;
  const c = rows[0];
  if (!c) throw new Error("Class not found");
  return {
    classTitle: c.title ?? "",
    schedule: c.weekly_schedule ?? "",
    schoolName: c.store?.name ?? "",
    schoolEmail: (c.store?.email ?? "").trim(),
  };
}

// ---------- sending ----------

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Sends both emails. Returns a list of problems (empty = everything was sent). */
async function sendEmails(row: Row, details: Details): Promise<string[]> {
  const host = Deno.env.get("SMTP_HOST");
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");
  const adminTo = Deno.env.get("MAIL_TO");
  const port = Number(Deno.env.get("SMTP_PORT") ?? "465");
  if (!host || !user || !pass || !adminTo || !Number.isFinite(port)) {
    throw new Error("Email settings are missing in Supabase secrets (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_TO).");
  }
  const from = Deno.env.get("MAIL_FROM") ?? user;
  const replyTo = EMAIL_RE.test(row.email ?? "") ? (row.email as string) : undefined;
  const problems: string[] = [];

  // Port 465 = connection is encrypted from the start (Supabase blocks ports 25 and 587).
  const client = new SMTPClient({
    connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } },
  });

  const send = async (label: string, to: string, mail: Mail) => {
    try {
      await withTimeout(
        client.send({
          from: `Book@Class <${from}>`,
          to,
          ...(replyTo ? { replyTo } : {}),
          subject: mail.subject,
          content: mail.text,
          html: mail.html,
        }),
        25_000,
        "The email server did not answer within 25 seconds.",
      );
    } catch (error) {
      problems.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  try {
    if (EMAIL_RE.test(details.schoolEmail)) {
      await send("school", details.schoolEmail, buildSchoolMail(row, details));
    } else {
      problems.push("school: the school has no valid email address saved");
    }
    await send("administrator", adminTo, buildAdminMail(row, details));
  } finally {
    try {
      await client.close();
    } catch {
      // ignore errors while closing
    }
  }
  return problems;
}

async function deliver(row: Row): Promise<string> {
  // 1) Claim the entry: pending -> sending (only one run can win this)
  const attempts = (row.email_attempts ?? 0) + 1;
  const claimed = await patchEntry(
    row.id,
    { email_status: "sending", email_attempts: attempts, email_error: null },
    "pending",
  );
  if (claimed.length === 0) return "already-handled";

  // 2) Send both emails, using the real class record for the details
  let problems: string[];
  try {
    const details = await loadDetails(claimed[0].class_id);
    problems = await sendEmails(claimed[0], details);
  } catch (error) {
    problems = [error instanceof Error ? error.message : String(error)];
  }

  const pass = Deno.env.get("SMTP_PASS");
  let message = problems.join(" | ");
  if (pass) message = message.split(pass).join("***");

  if (problems.length === 0) {
    await patchEntry(row.id, { email_status: "sent", email_sent_at: new Date().toISOString(), email_error: null });
    return "sent";
  }
  await patchEntry(row.id, { email_status: "failed", email_error: truncate(message, 500) });
  return "failed";
}

/** Only brand-new waiting list entries need an email. */
function shouldSend(payload: WebhookPayload): boolean {
  const row = payload.record;
  if (payload.table !== "waitlist_entries" || !row) return false;
  return payload.type === "INSERT" && row.email_status === "pending";
}

// ---------- web entry point ----------

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!secret) {
    console.error("WEBHOOK_SECRET is not set");
    return json({ error: "Not configured" }, 500);
  }
  if (!safeEqual(req.headers.get("x-webhook-secret") ?? "", secret)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!shouldSend(payload)) return json({ ignored: true });

  // Reply right away and finish the emails in the background, so the webhook never times out.
  const work = deliver(payload.record as Row).catch((error) => {
    console.error("notify-waitlist failed:", error);
  });
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) {
    EdgeRuntime.waitUntil(work);
    return json({ accepted: true });
  }
  return json({ result: await work });
});
