// Text codec of the export file (TS §10.1): base64(gzip(UTF-8(text))) with the platform's
// `CompressionStream`, available in every target browser, in workers and in Node.

/** Bytes per `String.fromCharCode` call, below the argument limits of all engines. */
const CHUNK = 0x8000;

/** `text` as UTF-8, compressed with gzip, as base64 without line breaks. */
export async function gzipBase64(text: string): Promise<string> {
  const bytes = await pipe(new TextEncoder().encode(text), new CompressionStream('gzip'));
  return bytesToBase64(bytes);
}

/**
 * Reverses `gzipBase64`. White space in `base64` is ignored (pasted text may wrap). Rejects when the
 * text is no base64, no gzip or no UTF-8.
 */
export async function gunzipBase64(base64: string): Promise<string> {
  const bytes = await pipe(base64ToBytes(base64), new DecompressionStream('gzip'));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Throws for characters outside the base64 alphabet and for a wrong length. */
export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const compact = base64.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 !== 0) {
    throw new TypeError('base64ToBytes: no base64');
  }
  const binary = atob(compact);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  transform: TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>,
): Promise<Uint8Array> {
  const input = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller): void {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const reader = input.pipeThrough(transform).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    chunks.push(read.value);
    length += read.value.length;
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
