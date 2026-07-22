// Client-side encryption using the Web Crypto API (AES-GCM).
// Encrypted payloads are packed into a compact base64 string that
// embeds the salt + iv + ciphertext so a single QR code carries
// everything needed to decrypt later (given the password).

const ENC_PREFIX = 'ENC1:'; // marks a payload as encrypted

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password, salt) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptText(plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plaintext)
    )
  );
  // pack salt + iv + ciphertext into one base64 blob
  const packed = new Uint8Array(salt.length + iv.length + cipher.length);
  packed.set(salt, 0);
  packed.set(iv, salt.length);
  packed.set(cipher, salt.length + iv.length);
  return ENC_PREFIX + toB64(packed);
}

export async function decryptText(payload, password) {
  const raw = payload.startsWith(ENC_PREFIX) ? payload.slice(ENC_PREFIX.length) : payload;
  const packed = fromB64(raw);
  const salt = packed.slice(0, 16);
  const iv = packed.slice(16, 28);
  const cipher = packed.slice(28);
  const key = await deriveKey(password, salt);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipher
  );
  return dec.decode(plain);
}

export function isEncrypted(text) {
  return typeof text === 'string' && text.startsWith(ENC_PREFIX);
}
