// Optional for legacy records. Only explicit observations are saved; never infer
// a waking time from the next feed.
export function normalizeWakeAt(kind: string, at: string, value: unknown, now = Date.now()): string | null {
  if (kind !== 'milk' || value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 40) throw new Error('INVALID_WAKE_TIME');
  const wake = new Date(value);
  if (!Number.isFinite(+wake) || +wake < +new Date(at) || +wake > now) throw new Error('INVALID_WAKE_TIME');
  return wake.toISOString();
}
