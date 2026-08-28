
export const MAX_URL_LEN = 200;
export const VOCAB_SIZE = 130; 
export const PADDING_IDX = 0;
export const UNKNOWN_IDX = 1;


export function normalizeUrl(url) {
  let u = String(url).trim();
  u = u.replace(/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//, ''); // drop scheme http:// https:// ftp:// ...
  u = u.replace(/^www\./i, ''); // drop a single leading www.
  return u;
}

// Python: code = ord(ch); return code - 30 if 32 <= code <= 127 else UNKNOWN_IDX
export function charToIndex(ch) {
  const code = ch.codePointAt(0);
  return code >= 32 && code <= 127 ? code - 30 : UNKNOWN_IDX;
}

// Python: idx = [char_to_index(c) for c in url[:max_len]]; pad to max_len with PADDING_IDX
export function urlToIdx(url, maxLen = MAX_URL_LEN) {
  const norm = normalizeUrl(url);

  const chars = Array.from(norm).slice(0, maxLen);
  const idx = new Array(maxLen).fill(PADDING_IDX);
  for (let i = 0; i < chars.length; i++) idx[i] = charToIndex(chars[i]);
  return idx;
}

export function encodeForModel(url, maxLen = MAX_URL_LEN) {
  return Float32Array.from(urlToIdx(url, maxLen));
}
