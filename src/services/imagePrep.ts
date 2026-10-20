import type { ErrorCode } from '../../shared/types';

/**
 * Prepares a user file for upload.
 *
 * Phone photos are often 3-10 MB. Sending them raw is slow, gets rejected by
 * hosting limits (Vercel: 4.5 MB body) and makes Gemini slower. We downscale
 * images to a readable size and re-encode as JPEG, usually 300-800 KB.
 */

const MAX_DIMENSION = 2000; // longest side in px; plenty for printed text
const JPEG_QUALITY = 0.85;
/** Server limit is ~3 MB binary (4M base64 chars). Stay under it. */
export const MAX_UPLOAD_BYTES = 2_900_000;
export const MAX_PICK_BYTES_IMAGE = 30_000_000;

export interface PreparedFile {
  base64: string;
  mimeType: string;
  bytes: number;
}

export class PrepError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode) {
    super(code);
    this.code = code;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' applies the EXIF rotation, so phone photos are not sideways.
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

async function compressImage(file: File): Promise<Blob | null> {
  const img = await decodeImage(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff'; // PNG transparency -> white, so text stays readable
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img.source, 0, 0, w, h);

    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  } finally {
    img.close();
  }
}

export async function prepareFile(file: File): Promise<PreparedFile> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_UPLOAD_BYTES) throw new PrepError('TOO_LARGE');
    return { base64: await blobToBase64(file), mimeType: 'application/pdf', bytes: file.size };
  }

  if (!file.type.startsWith('image/')) throw new PrepError('BAD_TYPE');

  let compressed: Blob | null = null;
  try {
    compressed = await compressImage(file);
  } catch {
    compressed = null; // e.g. HEIC in a browser that cannot decode it
  }

  if (compressed && compressed.size > 0) {
    // Tiny originals can be smaller than the re-encoded JPEG: keep whichever is smaller.
    const useOriginal = file.size < compressed.size && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    const blob = useOriginal ? file : compressed;
    if (blob.size > MAX_UPLOAD_BYTES) throw new PrepError('TOO_LARGE');
    return {
      base64: await blobToBase64(blob),
      mimeType: useOriginal ? file.type : 'image/jpeg',
      bytes: blob.size,
    };
  }

  // Could not decode in the browser: send the original if it is small enough.
  if (file.size <= MAX_UPLOAD_BYTES) {
    return { base64: await blobToBase64(file), mimeType: file.type || 'image/jpeg', bytes: file.size };
  }
  throw new PrepError('UNSUPPORTED_IMAGE');
}
