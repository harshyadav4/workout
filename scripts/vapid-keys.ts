/**
 * A VAPID key pair for Web Push (`npm run vapid`).
 *
 * VAPID is how the push service knows the sender: a P-256 key pair whose
 * public half the browser gets at subscribe time and whose private half
 * signs every send. Same bytes and encoding as `web-push generate-vapid-keys`,
 * made with Node's crypto so the app needs no extra dependency.
 *
 * Public key  → NEXT_PUBLIC_VAPID_PUBLIC_KEY (Vercel, .env) and the function
 *               secret VAPID_PUBLIC_KEY.
 * Private key → the function secret VAPID_PRIVATE_KEY only. Never in the app.
 */
import { createECDH } from "node:crypto";

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();

const base64url = (buffer: Buffer) => buffer.toString("base64url");

console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${base64url(ecdh.getPublicKey())}`);
console.log(`VAPID_PRIVATE_KEY=${base64url(ecdh.getPrivateKey())}`);
