const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), v => v.toString(16).padStart(2, '0')).join('');
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
export async function digest(value: string) { return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
export function equal(a: string, b: string) {
  let different = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) different |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return different === 0;
}
export async function hashPassword(password: string, salt = randomToken(), iterations = 100000) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, key, 256);
  return `pbkdf2-sha256$${iterations}$${salt}$${hex(bits)}`;
}
export async function verifyPassword(password: string, stored: string) {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256' || Number(parts[1]) !== 100000) return false;
  return equal(await hashPassword(password, parts[2], Number(parts[1])), stored);
}
