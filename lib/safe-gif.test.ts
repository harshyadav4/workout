// Run with: npm run check
import assert from "node:assert/strict";

import { MediaError, checkUrl, isGif, isPrivateAddress } from "@/lib/safe-gif";

const rejects = (url: string) => assert.throws(() => checkUrl(url), MediaError, url);

assert.equal(checkUrl("https://media.example.com/a/plank.gif").hostname, "media.example.com");
rejects("http://example.com/a.gif");
rejects("ftp://example.com/a.gif");
rejects("https://localhost/a.gif");
rejects("https://127.0.0.1/a.gif");
rejects("https://10.0.0.5/a.gif");
rejects("https://169.254.169.254/latest/meta-data");
rejects("https://192.168.1.10/a.gif");
rejects("https://[::1]/a.gif");
rejects("https://user:pass@example.com/a.gif");
rejects("https://example.com:8443/a.gif");
rejects("not a url");

assert.equal(isPrivateAddress("8.8.8.8"), false);
assert.equal(isPrivateAddress("172.20.1.1"), true);
assert.equal(isPrivateAddress("172.32.1.1"), false);
assert.equal(isPrivateAddress("100.100.1.1"), true, "CGNAT");
assert.equal(isPrivateAddress("::ffff:127.0.0.1"), true, "v4-mapped loopback");
assert.equal(isPrivateAddress("fd00::1"), true);
assert.equal(isPrivateAddress("2606:4700::1111"), false);

const bytes = (text: string) => new Uint8Array([...text].map((ch) => ch.charCodeAt(0)));
assert.equal(isGif(bytes("GIF89a....")), true);
assert.equal(isGif(bytes("GIF87a....")), true);
assert.equal(isGif(bytes("\x89PNG\r\n")), false, "a PNG named .gif is still a PNG");
assert.equal(isGif(bytes("<html>")), false);

console.log("safe gif checks passed");
