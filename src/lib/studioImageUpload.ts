import { safeHttps } from '@/lib/schoolPublish';
import { supabase } from '@/lib/supabase';

const BUCKET = 'studio-images';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type ImageValidationError = 'invalidType' | 'tooLarge';

export function validateStudioImage(file: File): ImageValidationError | null {
  if (!(file.type in EXTENSIONS)) return 'invalidType';
  if (file.size > MAX_IMAGE_BYTES) return 'tooLarge';
  return null;
}

export async function uploadStudioImage(file: File): Promise<string> {
  const path = `${crypto.randomUUID()}.${EXTENSIONS[file.type]}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export function schoolApplicationPhotoUrl(value: string | null | undefined): string | null {
  const photo = value?.trim();
  if (!photo) return null;
  const publicUrl = safeHttps(photo);
  if (publicUrl) return publicUrl;

  // Older applications kept an object path in the public school-photos bucket.
  if (!/^[0-9a-f-]{36}\/(?:image_url|photo_url_[12])\.(?:jpe?g|png|webp)$/i.test(photo)) return null;
  return supabase.storage.from('school-photos').getPublicUrl(photo).data.publicUrl;
}
