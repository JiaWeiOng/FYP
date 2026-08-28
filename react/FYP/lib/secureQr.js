
import "./cryptoPolyfill"; // MUST be before crypto-js — provides crypto.getRandomValues
import CryptoJS from "crypto-js";

const PREFIX = "SQR1:"; // marks a Secure QR payload (so the scanner can recognise it)

// Encrypt a message with a password -> a QR-ready string.
export function lockMessage(message, password) {
  const ciphertext = CryptoJS.AES.encrypt(message, password).toString(); // OpenSSL salted base64
  return PREFIX + ciphertext;
}

// Is a scanned string one of our Secure QR payloads?
export function isSecureQr(text) {
  return typeof text === "string" && text.startsWith(PREFIX);
}

// Decrypt a payload. Throws if it's not a Secure QR, or the password is wrong / data corrupt.
export function unlockMessage(payload, password) {
  if (!isSecureQr(payload)) throw new Error("This is not a Secure QR code.");
  const ciphertext = payload.slice(PREFIX.length);

  let text = "";
  try {
    text = CryptoJS.AES.decrypt(ciphertext, password).toString(CryptoJS.enc.Utf8);
  } catch {
    // A wrong key can produce invalid UTF-8 bytes -> decode throws.
    throw new Error("Wrong password or corrupted code.");
  }
  if (!text) throw new Error("Wrong password or corrupted code.");
  return text;
}

export { PREFIX };
