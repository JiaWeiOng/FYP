
import "./cryptoPolyfill"; // secure crypto.getRandomValues (native RNG)
import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from "@noble/ciphers/utils.js";

const MARK = "#STG1:"; // fragment marker that flags one of our hidden-message QRs

// Argon2id cost parameters (memory in KiB → 32 MB, 2 passes).
const ARGON2 = { iterations: 2, memory: 32 * 1024, parallelism: 1, hashLength: 32, mode: "argon2id" };

export function normalizeUrl(u) {
  const t = String(u).trim();
  return /^https?:\/\//i.test(t) ? t : "https://" + t;
}

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

// password + salt(hex) → 32-byte ChaCha20 key via Argon2id.
async function deriveKey(password, saltHex) {
  const argon2 = require("react-native-argon2").default;
  const { rawHash } = await argon2(password, saltHex, ARGON2);
  return hexToBytes(rawHash);
}

// Build the decoy QR string from a hidden URL + decoy URL + password.
export async function hideUrl(decoyUrl, hiddenUrl, password) {
  const decoy = normalizeUrl(decoyUrl);
  const saltHex = bytesToHex(randomBytes(16)); // per-code salt → per-code key
  const nonce = randomBytes(12);               // per-code nonce
  const key = await deriveKey(password, saltHex);
  const ct = chacha20poly1305(key, nonce).encrypt(utf8ToBytes(normalizeUrl(hiddenUrl)));
  return `${decoy}${MARK}${saltHex}.${bytesToHex(nonce)}.${bytesToHex(ct)}`;
}

// Is this scanned text one of our hidden-message QRs?
export function isStegoQr(text) {
  return typeof text === "string" && text.includes(MARK);
}

// What a NORMAL camera would open (everything before the marker) — the decoy.
export function decoyOf(text) {
  const i = String(text).indexOf(MARK);
  return i === -1 ? String(text) : String(text).slice(0, i);
}

// Reveal the real hidden URL (needs the password). Poly1305 authenticates the
// ciphertext, so a wrong password OR a tampered code both fail the same way.
export async function revealUrl(text, password) {
  if (!isStegoQr(text)) throw new Error("This is not a hidden-message QR.");
  const frag = String(text).slice(String(text).indexOf(MARK) + MARK.length);
  const [saltHex, nonceHex, ctHex] = frag.split(".");
  if (!saltHex || !nonceHex || !ctHex) throw new Error("Wrong password or corrupted code.");
  try {
    const key = await deriveKey(password, saltHex);
    const pt = chacha20poly1305(key, hexToBytes(nonceHex)).decrypt(hexToBytes(ctHex));
    return bytesToUtf8(pt);
  } catch {
    throw new Error("Wrong password or corrupted code.");
  }
}
