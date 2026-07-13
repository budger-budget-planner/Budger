import { randomUUID } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// File storage backend: Supabase Storage, accessed via the official JS SDK.
// The bucket ('budger-media' by default) is public, so uploaded files get a
// permanent public URL — no signed URLs or server-side proxying needed.
//
// Required env vars:
//   SUPABASE_URL                — project URL, e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   — service role key (server-side only, bypasses
//                                 bucket RLS policies for writes/deletes)
//   SUPABASE_BUCKET             — bucket name (defaults to "budger-media")
export class ObjectNotFoundError extends Error {
  constructor() {
    super('Object not found');
    this.name = 'ObjectNotFoundError';
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

let cachedClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use file storage.',
    );
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return cachedClient;
}

function getBucketName(): string {
  return process.env.SUPABASE_BUCKET || 'budger-media';
}

/** Guesses a file extension from a MIME type, defaulting to "bin". */
function extensionFromContentType(contentType: string): string {
  const subtype = contentType.split('/')[1]?.split(';')[0]?.trim().toLowerCase();
  if (!subtype) return 'bin';
  return subtype === 'jpeg' ? 'jpg' : subtype;
}

export class ObjectStorageService {
  constructor() {}

  /**
   * Upload a buffer directly to the Supabase Storage bucket.
   * Returns the permanent public URL for the stored file.
   */
  async uploadObjectEntity(buffer: Buffer, contentType: string): Promise<string> {
    const supabase = getSupabaseClient();
    const bucket = getBucketName();
    const ext = extensionFromContentType(contentType);
    const objectName = `uploads/${randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(objectName, buffer, { contentType, upsert: false });

    if (error) {
      throw new Error(`Supabase upload failed: ${error.message}`);
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(objectName);
    return data.publicUrl;
  }

  /**
   * Delete a previously-uploaded object given its public URL.
   * No-ops (rather than throwing) for URLs that don't belong to our bucket —
   * e.g. legacy base64 data URLs — since callers may pass either.
   */
  async deleteObjectEntity(publicUrl: string): Promise<void> {
    const bucket = getBucketName();
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return; // not one of our objects — nothing to do

    const objectName = publicUrl.slice(idx + marker.length);
    const supabase = getSupabaseClient();
    const { error } = await supabase.storage.from(bucket).remove([objectName]);
    if (error) {
      throw new Error(`Supabase delete failed: ${error.message}`);
    }
  }
}
