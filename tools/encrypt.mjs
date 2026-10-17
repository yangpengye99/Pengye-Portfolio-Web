// AES-GCM encrypt stdin with a key derived from $LOCK_PASSWORD (PBKDF2-SHA256).
// Prints {v, iter, salt, iv, ct} as JSON; assets/js/lock.js reverses it in the browser.
import { webcrypto as crypto } from 'node:crypto';

const ITER = 400000;
const password = process.env.LOCK_PASSWORD;
if (!password) { console.error('LOCK_PASSWORD is not set'); process.exit(1); }

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const text = Buffer.concat(chunks);

const enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
  base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, text));
const b64 = (u) => Buffer.from(u).toString('base64');
process.stdout.write(JSON.stringify({ v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) }));
