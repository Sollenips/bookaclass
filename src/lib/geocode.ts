// Address -> coordinates using OpenStreetMap Nominatim (free, no API key).
// Usage policy: at most 1 request per second, so every lookup goes through a queue.

export type GeoPoint = { latitude: number; longitude: number };

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const MIN_GAP_MS = 1100;

let lastCall = 0;
let queue: Promise<unknown> = Promise.resolve();

function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCall = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

async function lookup(query: string, houseNumber?: string): Promise<GeoPoint | null> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '5',
    addressdetails: '1',
    countrycodes: 'gr',
    'accept-language': 'en',
  });
  const res = await fetch(`${ENDPOINT}?${params.toString()}`);
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat?: string; lon?: string; address?: { house_number?: string } }>;
  const first = Array.isArray(data) ? data.find((result) =>
    Boolean(result.address?.house_number)
    && (!houseNumber || result.address?.house_number === houseNumber)
  ) : undefined;
  if (!first) return null;
  const latitude = parseFloat(first.lat ?? '');
  const longitude = parseFloat(first.lon ?? '');
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

/** Returns coordinates for an address, or null if it cannot be found. Never throws. */
export async function geocodeAddress(address: string, area?: string): Promise<GeoPoint | null> {
  const base = address.trim();
  if (!base) return null;

  const [streetLine, ...addressParts] = base.split(',').map((part) => part.trim());
  // A postcode at the end of the locality is not the building number.
  const locality = addressParts.map((part) => part.replace(/\s*\b\d{3}\s?\d{2}\s*$/, '').trim())
    .filter(Boolean).join(', ') || area?.trim();
  const streets = streetLine.split(/\s*&\s*|\s+\u03ba\u03b1\u03b9\s+/iu).map((part) => part.trim()).filter(Boolean);
  for (const street of streets) {
    const unabbreviated = street.replace(/^(?:\p{L}\.\s*)+/u, '');
    for (const variant of new Set([street, unabbreviated])) {
      if (!variant) continue;
      const hasLocality = locality && variant.toLowerCase().includes(locality.toLowerCase());
      const query = locality && !hasLocality ? `${variant}, ${locality}, Attica` : `${variant}, Attica`;
      try {
        const houseNumber = variant.match(/\b(\d{1,4})(?=\s*[,;]?\s*$)/)?.[1];
        const point = await throttled(() => lookup(query, houseNumber));
        if (point) return point;
      } catch {
        // The next address variant may still resolve.
      }
    }
  }
  return null;
}
