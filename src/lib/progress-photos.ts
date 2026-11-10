// Progress photos: what the server accepts. Photos arrive resized on the device (src/lib/image.ts),
// a few hundred kB; the limit leaves room without letting the table fill with full-size originals.

export const PHOTO_MAX_DIM = 1280;
export const PHOTO_MAX_BYTES = 1_000_000;

/** JPEG files start FF D8 FF. */
export const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/** Kept for the signed-in user only; never in a shared or browser cache. */
export const PHOTO_HEADERS = { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" } as const;
