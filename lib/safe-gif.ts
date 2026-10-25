/**
 * The rules for fetching a GIF someone else named, kept pure so they are
 * tested. The route in app/api/media/route.ts applies them.
 *
 * A server that fetches any URL it is handed can be pointed at the inside of
 * its own network (169.254.169.254, localhost, 10.x). So: https only, no IP
 * literals in private ranges, the resolved address checked again before the
 * request, redirects followed by hand and re-checked, a size cap, and the
 * bytes themselves must say GIF.
 */

export const MAX_GIF_BYTES = 5 * 1024 * 1024;

export class MediaError extends Error {}

/** Throws unless the URL is an https URL on a public-looking host. */
export function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MediaError("Not a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new MediaError("Only https links are fetched.");
  }
  if (url.username || url.password) {
    throw new MediaError("Links with credentials are not fetched.");
  }
  if (url.port && url.port !== "443") {
    throw new MediaError("Only the standard https port is allowed.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new MediaError("That host is not public.");
  }
  if (isIpLiteral(host) && isPrivateAddress(host)) {
    throw new MediaError("That address is not public.");
  }
  return url;
}

function isIpLiteral(host: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

/** True for loopback, private, link-local, CGNAT, multicast and reserved ranges. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").toLowerCase();
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.replace(/^::ffff:/, ""));
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (ip.includes(":")) {
    return (
      ip === "::" ||
      ip === "::1" ||
      ip.startsWith("fc") ||
      ip.startsWith("fd") ||
      ip.startsWith("fe8") ||
      ip.startsWith("fe9") ||
      ip.startsWith("fea") ||
      ip.startsWith("feb") ||
      ip.startsWith("ff")
    );
  }
  return true;
}

/** GIF87a or GIF89a in the first six bytes. The content-type header is not trusted. */
export function isGif(bytes: Uint8Array): boolean {
  if (bytes.length < 6) {
    return false;
  }
  const head = String.fromCharCode(...bytes.slice(0, 6));
  return head === "GIF87a" || head === "GIF89a";
}
