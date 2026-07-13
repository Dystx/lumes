export type RequestBodyReadResult =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" | "read_failed" };

/**
 * Read a request body without allowing an unbounded JSON payload to reach a
 * parser. The content-length check is only an early rejection; the stream
 * limit is authoritative because chunked requests may omit the header.
 */
export async function readRequestBodyWithinLimit(
  request: Request,
  maxBytes: number,
): Promise<RequestBodyReadResult> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, reason: "too_large" };
  }

  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "read_failed" };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, text: new TextDecoder().decode(bytes) };
}
