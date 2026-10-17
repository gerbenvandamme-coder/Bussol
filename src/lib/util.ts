export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

/** Kies zwart of wit als tekstkleur op een #rrggbb-achtergrond. */
export function readableOn(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#0f172a' : '#ffffff';
}

/** Doorzichtige tint van een (CSS-variabele)kleur. */
export const tint = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;

function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Aantal dagen tot een YYYY-MM-DD-datum (negatief = voorbij). */
export function daysUntil(day: string): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((parseDay(day).getTime() - today) / 86_400_000);
}

export function formatDay(day: string): string {
  return parseDay(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Geeft enkel http(s)-links terug; alles anders (bv. javascript:) wordt geweigerd. */
export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Verkleint een afbeelding tot een vierkante JPEG-data-URL (klein genoeg om in de database te bewaren). */
export async function fileToAvatar(file: File, size = 192): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image processing is not supported in this browser.');
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}