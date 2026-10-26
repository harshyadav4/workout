/**
 * GET /api/demo/videos/0201-3ZflifB.gif  →  the library's demo, from our origin.
 *
 * The library's GIFs and stills live on raw.githubusercontent.com, which can
 * take minutes per file on some mobile networks — long enough that the sheet
 * is closed and the request aborted before anything arrives. Serving them from
 * here lets the CDN keep one copy close to the user, and lets the service
 * worker keep them on the phone for a gym with no signal (public/sw.js).
 *
 * Not an open proxy: only the library's own file shapes are fetched, from the
 * one host they live on.
 */
export const runtime = "nodejs";

const UPSTREAM = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/";
const TIMEOUT_MS = 30000;
// The library's own naming: a 4-digit id, a short hash, one of two folders.
const ALLOWED = /^(videos\/\d{4}-[A-Za-z0-9]+\.gif|images\/\d{4}-[A-Za-z0-9]+\.jpg)$/;

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path.join("/");
  if (!ALLOWED.test(path)) {
    return new Response("Not found", { status: 404 });
  }

  let upstream: Response;
  try {
    // force-cache keeps the bytes in Next's data cache, so each file crosses
    // the slow link once per server, not once per visitor.
    upstream = await fetch(UPSTREAM + path, {
      cache: "force-cache",
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch {
    return new Response("Upstream timed out", { status: 504 });
  }

  if (!upstream.ok) {
    return new Response("Not found", { status: upstream.status === 404 ? 404 : 502 });
  }

  return new Response(await upstream.arrayBuffer(), {
    headers: {
      "content-type": path.endsWith(".gif") ? "image/gif" : "image/jpeg",
      // A library file never changes under its hashed name.
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}
