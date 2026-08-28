
export function analyzeLock(pw) {
  if (!pw) return { bits: 0, label: "—", pct: 0, crackTime: "" };

  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33;

  const bits = Math.round(pw.length * Math.log2(pool || 1));
  const seconds = Math.pow(2, bits) / 2 / 1e9; // ~1e9 guesses/sec (offline GPU estimate)
  const label =
    bits >= 100 ? "Very strong" : bits >= 60 ? "Strong" : bits >= 36 ? "Fair" : bits >= 28 ? "Weak" : "Very weak";
  const pct = Math.max(6, Math.min(100, Math.round(bits))); // bar fill (cap at 100 bits)

  return { bits, label, pct, crackTime: humanTime(seconds) };
}

function humanTime(s) {
  if (s < 1) return "cracked instantly";
  const units = [["year", 31536000], ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]];
  for (const [name, secs] of units) {
    if (s >= secs) {
      const v = Math.round(s / secs);
      return `~${v.toLocaleString()} ${name}${v > 1 ? "s" : ""} to crack`;
    }
  }
  return "cracked instantly";
}
