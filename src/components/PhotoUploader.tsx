import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const MAX_PHOTOS = 5;
const MAX_SIZE_MB = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface PhotoEntry {
  file: File;
  previewUrl: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  path?: string;
  error?: string;
}

export type { PhotoEntry };

/**
 * Garment reference photo picker.
 * Uploads happen after booking creation (needs booking id), so selected files
 * are held here until onBookingCreated hands back a booking id + tracking token.
 */
export function PhotoUploader({
  photos,
  onChange,
}: {
  photos: PhotoEntry[];
  onChange: (photos: PhotoEntry[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function addFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    const next = [...photos];
    for (const f of Array.from(files)) {
      if (next.length >= MAX_PHOTOS) {
        setError(`You can attach up to ${MAX_PHOTOS} photos.`);
        break;
      }
      if (!ALLOWED_TYPES.includes(f.type)) {
        setError('Only JPG, PNG, or WebP images are allowed.');
        continue;
      }
      if (f.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`Each photo must be under ${MAX_SIZE_MB} MB.`);
        continue;
      }
      next.push({ file: f, previewUrl: URL.createObjectURL(f), status: 'pending' });
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = '';
  }

  function removeAt(index: number) {
    const next = [...photos];
    const removed = next.splice(index, 1);
    removed.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    onChange(next);
  }

  return (
    <div>
      <label className="label-field">Garment reference photos (optional)</label>
      <p className="mb-2 text-xs text-charcoal-400">
        Up to {MAX_PHOTOS} photos, JPG/PNG/WebP, max {MAX_SIZE_MB} MB each. Helps the tailoring partner understand the work needed.
      </p>
      <div className="flex flex-wrap gap-3">
        {photos.map((p, i) => (
          <div key={p.previewUrl} className="relative">
            <img src={p.previewUrl} alt="Garment preview" className="h-20 w-20 rounded-lg object-cover" />
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-charcoal-800 text-ivory-50 shadow-md hover:bg-terracotta-500"
              aria-label="Remove photo"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {p.status === 'error' && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-red-900/60" title={p.error}>
                <AlertCircle className="h-5 w-5 text-white" />
              </div>
            )}
            {p.status === 'uploading' && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-charcoal-900/60">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </div>
            )}
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-20 w-20 flex-col items-center justify-center rounded-lg border-2 border-dashed border-ivory-300 text-charcoal-400 transition-colors hover:border-forest-500 hover:text-forest-600"
          >
            <ImagePlus className="h-5 w-5" />
            <span className="mt-1 text-[10px]">Add photo</span>
          </button>
        )}
      </div>
      {error && <p className="mt-2 flex items-center gap-1 text-xs text-terracotta-600"><AlertCircle className="h-3 w-3" /> {error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
    </div>
  );
}

/**
 * Uploads pending photos for a freshly created booking.
 * Returns the number of successfully uploaded photos.
 */
export async function uploadBookingPhotos(
  bookingId: string,
  trackingToken: string | undefined,
  photos: PhotoEntry[],
): Promise<number> {
  const pending = photos.filter((p) => p.status === 'pending');
  if (pending.length === 0) return 0;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Ask the server for signed upload URLs (server re-validates type/size/limits)
  const { data: sessionData } = await supabase.auth.getSession();
  const jwt = sessionData.session?.access_token || supabaseAnonKey;

  const res = await fetch(`${supabaseUrl}/functions/v1/booking-photo-access`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      action: 'upload',
      booking_id: bookingId,
      tracking_token: trackingToken,
      files: pending.map((p) => ({ name: p.file.name, size: p.file.size, type: p.file.type })),
    }),
  });
  if (!res.ok) throw new Error('Could not start photo upload.');
  const uploadData = await res.json() as {
    uploads?: { ok: boolean; name?: string; path?: string; token?: string; url?: string; detail?: string }[];
  };
  if (!uploadData.uploads) throw new Error('Could not start photo upload.');

  const succeeded: PhotoEntry[] = [];
  const paths: string[] = [];

  await Promise.all(uploadData.uploads.map(async (u) => {
    const idx = pending.findIndex((p) => p.file.name === u.name);
    if (idx === -1) return;
    const entry = pending[idx];
    if (!u.ok || !u.path) {
      entry.status = 'error';
      entry.error = u.detail;
      return;
    }
    // Signed upload: PUT the raw file
    if (!u.url) {
      entry.status = 'error';
      entry.error = 'Upload URL missing.';
      return;
    }
    const put = await fetch(u.url, {
      method: 'PUT',
      headers: { 'x-upsert': 'false' },
      body: entry.file,
    });
    if (!put.ok) {
      entry.status = 'error';
      entry.error = 'Upload failed. Please retry.';
      return;
    }
    entry.status = 'done';
    entry.path = u.path;
    paths.push(u.path);
    succeeded.push(entry);
  }));

  // Register uploaded files in the database (server validates again)
  if (paths.length > 0) {
    await fetch(`${supabaseUrl}/functions/v1/booking-photo-access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        action: 'confirm',
        booking_id: bookingId,
        tracking_token: trackingToken,
        paths,
      }),
    });
  }

  return paths.length;
}
