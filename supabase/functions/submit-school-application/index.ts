import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://bookaclass.gr",
  "https://www.bookaclass.gr",
]);

const bucket = "school-photos";
const maxImageSize = 5 * 1024 * 1024;
const maxRequestSize = 17 * 1024 * 1024;

function respond(message: string, status: number, origin: string | null) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };

  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "content-type, apikey, authorization";
  }

  return new Response(JSON.stringify({ message }), { status, headers });
}

function validImage(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") return bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png") {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    return signature.every((n, i) => bytes[i] === n);
  }
  if (type === "image/webp") {
    return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (!origin || !allowedOrigins.has(origin)) return respond("Origin not allowed", 403, origin);
  if (req.method === "OPTIONS") return respond("OK", 200, origin);
  if (req.method !== "POST") return respond("Method not allowed", 405, origin);

  const declaredSize = Number(req.headers.get("content-length") || "0");
  if (declaredSize > maxRequestSize) return respond("Request too large", 413, origin);

  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !url || !serviceKey) {
    console.error("Missing server configuration");
    return respond("Service unavailable", 503, origin);
  }

  let form: FormData;
  try {
    const body = await req.arrayBuffer();
    if (body.byteLength > maxRequestSize) return respond("Request too large", 413, origin);
    const requestCopy = new Request(req.url, {
      method: "POST",
      headers: { "Content-Type": req.headers.get("content-type") || "" },
      body,
    });
    form = await requestCopy.formData();
  } catch {
    return respond("Invalid form", 400, origin);
  }

  const value = (name: string) => String(form.get(name) ?? "").trim();
  const token = value("cf-turnstile-response") || value("turnstile_token");
  if (!token || token.length > 4096) return respond("Security check required", 403, origin);
  if (value("website")) return respond("Application received", 200, origin);

  let verified = false;
  try {
    const check = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
      signal: AbortSignal.timeout(8000),
    });
    if (!check.ok) return respond("Security service unavailable", 503, origin);
    const result = await check.json();
    verified = result.success === true && allowedOrigins.has(`https://${result.hostname}`);
  } catch {
    return respond("Security service unavailable", 503, origin);
  }
  if (!verified) return respond("Security verification failed", 403, origin);

  const email = value("email").toLowerCase();
  const name = value("studio_name") || value("school_name") || value("name");
  const category = value("category");
  const area = value("area");
  const address = value("address");
  const phone = value("phone");
  const manager = value("school_manager");
  const description = value("studio_description") || value("description");
  const accessibility = value("accessibility");
  const scheduleText = value("weekly_schedule");
  const latitudeText = value("latitude");
  const longitudeText = value("longitude");
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);

  if (!name || !category || !area || !address || !phone || !manager ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return respond("Please complete all required fields", 400, origin);
  }
  if (value("privacy_acknowledged") !== "yes") return respond("Privacy consent required", 400, origin);
  if (!latitudeText || !longitudeText ||
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return respond("Select the school location on the map", 400, origin);
  }

  const fields = [email, name, category, area, address, phone, manager, description, accessibility, scheduleText];
  if (fields.some((field) => field.length > 12000)) return respond("Field too long", 400, origin);

  let schedule: unknown;
  try {
    schedule = JSON.parse(scheduleText);
    if (!Array.isArray(schedule) || schedule.length > 50) throw new Error("Invalid schedule");
  } catch {
    return respond("Invalid weekly schedule", 400, origin);
  }

  const imageFields = [
    { names: ["cover_image", "image"], column: "image_url" },
    { names: ["studio_photo_1", "photo_1"], column: "photo_url_1" },
    { names: ["studio_photo_2", "photo_2"], column: "photo_url_2" },
  ];
  const prepared: Array<{ column: string; bytes: Uint8Array; type: string; extension: string }> = [];
  const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

  for (const entry of imageFields) {
    const file = entry.names.map((field) => form.get(field)).find((item) => item instanceof File) as File | undefined;
    if (!file || file.size === 0) continue;
    if (file.size > maxImageSize || !extensions[file.type]) {
      return respond("Images must be JPG, PNG or WebP, up to 5 MB", 400, origin);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validImage(bytes, file.type)) return respond("Invalid image content", 400, origin);
    prepared.push({ column: entry.column, bytes, type: file.type, extension: extensions[file.type] });
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const applicationId = crypto.randomUUID();
  const uploadedPaths: string[] = [];
  const photos: Record<string, string> = {};

  try {
    for (const photo of prepared) {
      const path = `${applicationId}/${photo.column}.${photo.extension}`;
      const { error } = await supabase.storage.from(bucket).upload(path, photo.bytes, {
        contentType: photo.type,
        upsert: false,
      });
      if (error) throw error;
      uploadedPaths.push(path);
      photos[photo.column] = path;
    }

    const { error } = await supabase.from("pre_registrations").insert({
      email,
      role: "store",
      name,
      category,
      area,
      address,
      latitude,
      longitude,
      phone,
      school_manager: manager,
      description,
      accessibility_info: accessibility,
      disability_access: value("wheelchair_access") === "yes",
      weekly_schedule: JSON.stringify(schedule),
      privacy_acknowledged_at: new Date().toISOString(),
      email_status: "pending",
      ...photos,
    });

    if (error) {
      if (error.code === "23505") return respond("This email is already registered", 409, origin);
      throw error;
    }
    return respond("Application submitted successfully", 201, origin);
  } catch (error) {
    console.error("Application failed:", error);
    if (uploadedPaths.length > 0) await supabase.storage.from(bucket).remove(uploadedPaths);
    return respond("Unable to save application", 500, origin);
  }
});
