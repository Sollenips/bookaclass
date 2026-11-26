// Supabase Edge Function: notify-school-application
//
// Called by a Supabase Database Webhook whenever a row in `pre_registrations` is
// inserted or updated. For every new "List Your School" application it emails all the
// submitted details to MAIL_TO (info@bookaclass.gr) through the Papaki SMTP server, then
// records the result (sent / failed) on the application row.
//
// The application is always saved first by the website; this function runs afterwards,
// so a failed email can never lose an application.
//
// Secrets (set in Supabase -> Edge Functions -> Secrets, never in code):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_TO, WEBHOOK_SECRET
//   MAIL_FROM (optional, defaults to SMTP_USER)
// Supabase provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY automatically.

import { SMTPClient } from "https://deno.land/x/denomailer@1.4.0/mod.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

type Row = {
  id: string;
  email: string;
  role: string | null;
  name: string | null;
  phone: string | null;
  area: string | null;
  category: string | null;
  address: string | null;
  description: string | null;
  school_manager: string | null;
  disability_access: boolean | null;
  accessibility_info: string | null;
  rate_info: string | null;
  weekly_schedule: string | null;
  image_url: string | null;
  photo_url_1: string | null;
  photo_url_2: string | null;
  privacy_acknowledged_at: string | null;
  created_at: string | null;
  email_status: string | null;
  email_attempts: number | null;
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

function isSafeUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function formatDate(iso: string | null): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return iso ?? "";
  return (
    date.toLocaleString("en-GB", {
      timeZone: "Europe/Athens",
      dateStyle: "medium",
      timeStyle: "short",
    }) + " (Athens time)"
  );
}

function buildEmail(row: Row): { subject: string; text: string; html: string } {
  const schoolName = truncate(cleanLine(row.name ?? ""), 60) || "(no name)";
  const subject = encodeHeader(`New school application: ${schoolName}`);

  const fields: Array<[string, string]> = [
    ["School name", row.name ?? ""],
    ["Category", row.category ?? ""],
    ["Area", row.area ?? ""],
    ["Address", row.address ?? ""],
    ["Phone", row.phone ?? ""],
    ["Email", row.email ?? ""],
    ["School manager", row.school_manager ?? ""],
    ["Description", row.description ?? ""],
    ["Wheelchair access", row.disability_access ? "Yes" : "No"],
    ["Accessibility & comfort", row.accessibility_info ?? ""],
    ["Weekly class schedule", row.weekly_schedule ?? ""],
    ["Prices & costs", row.rate_info ?? ""],
  ];
  const links: Array<[string, string | null]> = [
    ["Cover image", row.image_url],
    ["School photo 1", row.photo_url_1],
    ["School photo 2", row.photo_url_2],
  ];
  const submitted = formatDate(row.created_at);
  const privacy = row.privacy_acknowledged_at
    ? `Yes (${formatDate(row.privacy_acknowledged_at)})`
    : "Not recorded";

  // ----- plain text version
  const textLines: string[] = ["NEW SCHOOL APPLICATION", ""];
  for (const [label, value] of fields) {
    const shown = value.trim() ? value.trim() : "-";
    textLines.push(
      shown.includes("\n") ? `${label}:\n${shown.replace(/^/gm, "  ")}` : `${label}: ${shown}`,
    );
  }
  for (const [label, url] of links) textLines.push(`${label}: ${isSafeUrl(url) ? url : "-"}`);
  textLines.push(`Privacy policy accepted: ${privacy}`);
  textLines.push(`Submitted: ${submitted}`);
  textLines.push(`Application ID: ${row.id}`, "", "Reply to this email to contact the school directly.");
  const text = textLines.join("\n");

  // ----- HTML version (every submitted value is escaped)
  const td = "padding:8px 10px;border-bottom:1px solid #e7e5e4;vertical-align:top;font-size:14px;";
  const rowsHtml = [
    ...fields.map(([label, value]) => {
      const shown = value.trim() ? escapeHtml(value.trim()) : "&mdash;";
      return `<tr><td style="${td}font-weight:600;width:190px;color:#57534e;">${escapeHtml(label)}</td><td style="${td}white-space:pre-wrap;">${shown}</td></tr>`;
    }),
    ...links.map(([label, url]) => {
      const shown = isSafeUrl(url)
        ? `<a href="${escapeHtml(url)}" style="color:#0f766e;">${escapeHtml(url)}</a>`
        : "&mdash;";
      return `<tr><td style="${td}font-weight:600;width:190px;color:#57534e;">${escapeHtml(label)}</td><td style="${td}word-break:break-all;">${shown}</td></tr>`;
    }),
    `<tr><td style="${td}font-weight:600;width:190px;color:#57534e;">Privacy policy accepted</td><td style="${td}">${escapeHtml(privacy)}</td></tr>`,
    `<tr><td style="${td}font-weight:600;width:190px;color:#57534e;">Submitted</td><td style="${td}">${escapeHtml(submitted)}</td></tr>`,
  ].join("");

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#292524;">` +
    `<h2 style="color:#0f766e;margin:0 0 6px;">New school application</h2>` +
    `<p style="margin:0 0 16px;color:#78716c;font-size:14px;">Received through the &ldquo;List Your School&rdquo; form on Book@Class.</p>` +
    `<table style="border-collapse:collapse;width:100%;border:1px solid #e7e5e4;">${rowsHtml}</table>` +
    `<p style="margin:16px 0 0;color:#78716c;font-size:12px;">Application ID: ${escapeHtml(row.id)}<br>Reply to this email to contact the school directly.</p>` +
    `</div>`;

  return { subject, text, html };
}

// ---------- database access (plain REST calls, no extra libraries) ----------

function dbUrl(): string {
  return Deno.env.get("SUPABASE_URL") ?? "";
}
function dbKey(): string {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

/** Updates one application row. If `onlyIfStatus` is given, the update only happens when
 *  the row still has that status (this is how we "claim" an application so it is never
 *  emailed twice). Returns the updated rows. */
async function patchApplication(
  id: string,
  fields: Record<string, unknown>,
  onlyIfStatus?: string,
): Promise<Row[]> {
  if (!UUID_RE.test(id)) throw new Error("Invalid application id");
  const filter = onlyIfStatus ? `&email_status=eq.${encodeURIComponent(onlyIfStatus)}` : "";
  const res = await fetch(`${dbUrl()}/rest/v1/pre_registrations?id=eq.${id}${filter}`, {
    method: "PATCH",
    headers: {
      apikey: dbKey(),
      Authorization: `Bearer ${dbKey()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Database update failed (HTTP ${res.status})`);
  return (await res.json()) as Row[];
}

// ---------- sending ----------

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function sendEmail(row: Row): Promise<void> {
  const host = Deno.env.get("SMTP_HOST");
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");
  const to = Deno.env.get("MAIL_TO");
  const port = Number(Deno.env.get("SMTP_PORT") ?? "465");
  if (!host || !user || !pass || !to || !Number.isFinite(port)) {
    throw new Error("Email settings are missing in Supabase secrets (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_TO).");
  }
  const from = Deno.env.get("MAIL_FROM") ?? user;
  const { subject, text, html } = buildEmail(row);
  const replyTo = EMAIL_RE.test(row.email ?? "") ? row.email : undefined;

  // Port 465 = connection is encrypted from the start (Supabase blocks ports 25 and 587).
  const client = new SMTPClient({
    connection: {
      hostname: host,
      port,
      tls: port === 465,
      auth: { username: user, password: pass },
    },
  });
  try {
    await withTimeout(
      client.send({
        from: `Book@Class <${from}>`,
        to,
        ...(replyTo ? { replyTo } : {}),
        subject,
        content: text,
        html,
      }),
      25_000,
      "The email server did not answer within 25 seconds.",
    );
  } finally {
    try {
      await client.close();
    } catch {
      // ignore errors while closing
    }
  }
}

async function deliver(row: Row): Promise<string> {
  // 1) Claim the application: pending -> sending (only one run can win this)
  const attempts = (row.email_attempts ?? 0) + 1;
  const claimed = await patchApplication(
    row.id,
    { email_status: "sending", email_attempts: attempts, email_error: null },
    "pending",
  );
  if (claimed.length === 0) return "already-handled";

  // 2) Send, using the freshest copy of the row
  try {
    await sendEmail(claimed[0]);
    await patchApplication(row.id, {
      email_status: "sent",
      email_sent_at: new Date().toISOString(),
      email_error: null,
    });
    return "sent";
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error);
    const pass = Deno.env.get("SMTP_PASS");
    if (pass) message = message.split(pass).join("***");
    await patchApplication(row.id, {
      email_status: "failed",
      email_error: truncate(message, 500),
    });
    return "failed";
  }
}

/** Decides whether this webhook call is a new application that needs an email. */
function shouldSend(payload: WebhookPayload): boolean {
  const row = payload.record;
  if (payload.table !== "pre_registrations" || !row) return false;
  if (row.role !== "store" || row.email_status !== "pending") return false;
  if (payload.type === "INSERT") return true;
  // Resend: someone changed the status back to 'pending'
  return payload.type === "UPDATE" && payload.old_record?.email_status !== "pending";
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

  // Reply right away and finish the email in the background, so the webhook never times out.
  const work = deliver(payload.record as Row).catch((error) => {
    console.error("notify-school-application failed:", error);
  });
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) {
    EdgeRuntime.waitUntil(work);
    return json({ accepted: true });
  }
  return json({ result: await work });
});
