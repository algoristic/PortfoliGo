/** SHA-256 of `text` as UTF-8, 64 lowercase hex characters (Web Crypto, in workers and in Node). */
export async function sha256Hex(text: string): Promise<string> {
  // eslint-disable-next-line no-restricted-globals -- Web Crypto hashes the export; no randomness.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
