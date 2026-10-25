/**
 * POST /api/media  { url }  →  { path }
 *
 * Fetches one public .gif for an exercise the library does not have, checks it,
 * and stores it in Supabase Storage under the caller's own folder. The browser
 * cannot do this itself: most hosts send no CORS headers, so the bytes never
 * reach page JavaScript.
 *
 * Every rule about what may be fetched lives in lib/safe-gif.ts. This file adds
 * the two things only a server can do: resolve and pin the address it connects
 * to, and act as the signed-in user (their JWT, so Storage RLS still applies —
 * there is no service key here).
 */
import { createHash } from "node:crypto";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import https from "node:https";

import { createClient } from "@supabase/supabase-js";

import { MAX_GIF_BYTES, MediaError, checkUrl, isGif, isPrivateAddress } from "@/lib/safe-gif";

export const runtime = "nodejs";

const BUCKET = "exercise-media";
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

/**
 * The address check runs inside the connection's own DNS lookup, so the IP that
 * was checked is the IP that is dialled. Checking first and fetching second
 * would let a host answer "public" once and "private" the next time.
 */
function safeLookup(
  hostname: string,
  options: { all?: boolean },
  callback: (error: Error | null, address: string | LookupAddress[], family?: number) => void
) {
  dnsLookup(hostname, { all: true }, (error, addresses) => {
    if (error) {
      callback(error, "", 4);
      return;
    }
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((entry) => isPrivateAddress(entry.address))) {
      callback(new MediaError("That host resolves to a private address."), "", 4);
      return;
    }
    if (options.all) {
      callback(null, list);
    } else {
      callback(null, list[0].address, list[0].family);
    }
  });
}

function download(url: URL, redirectsLeft: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        lookup: safeLookup as never,
        timeout: TIMEOUT_MS,
        headers: { "user-agent": "Arise media fetch", accept: "image/gif" }
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          if (redirectsLeft === 0) {
            reject(new MediaError("Too many redirects."));
            return;
          }
          try {
            // Every hop is checked again: a public URL may redirect inward.
            const next = checkUrl(new URL(response.headers.location, url).toString());
            resolve(download(next, redirectsLeft - 1));
          } catch (error) {
            reject(error);
          }
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(new MediaError(`The link answered ${status}.`));
          return;
        }
        const declared = Number(response.headers["content-length"] ?? 0);
        if (declared > MAX_GIF_BYTES) {
          response.destroy();
          reject(new MediaError("The GIF is larger than 5 MB."));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_GIF_BYTES) {
            response.destroy();
            reject(new MediaError("The GIF is larger than 5 MB."));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
        response.on("error", reject);
      }
    );
    request.on("timeout", () => request.destroy(new MediaError("The link took too long.")));
    request.on("error", reject);
  });
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!supabaseUrl || !anonKey) {
    return Response.json({ error: "Supabase is not configured." }, { status: 500 });
  }
  if (!token) {
    return Response.json({ error: "Sign in first." }, { status: 401 });
  }

  // Acting as the user: their token on every call, so Storage RLS decides.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) {
    return Response.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send JSON: { url }." }, { status: 400 });
  }

  try {
    const url = checkUrl(typeof body.url === "string" ? body.url : "");
    const bytes = await download(url, MAX_REDIRECTS);
    if (!isGif(bytes)) {
      throw new MediaError("That link is not a GIF.");
    }
    // Content-addressed: the same GIF twice is one object, and re-importing a
    // plan does not pile up copies.
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
    const path = `${auth.user.id}/${hash}.gif`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/gif", upsert: true, cacheControl: "31536000" });
    if (error) {
      return Response.json({ error: `Storage: ${error.message}` }, { status: 502 });
    }
    return Response.json({ path });
  } catch (error) {
    const message = error instanceof MediaError ? error.message : "Could not fetch that GIF.";
    return Response.json({ error: message }, { status: 422 });
  }
}
