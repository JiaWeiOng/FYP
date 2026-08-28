
export function passwordPolicyError(pw: string): string | null {
  if (pw.length < 6) return "Password must be at least 6 characters.";
  if (!/[a-z]/.test(pw)) return "Password must include at least 1 lowercase letter.";
  if (!/[A-Z]/.test(pw)) return "Password must include at least 1 uppercase letter.";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Password must include at least 1 special character (e.g. ! @ # $).";
  return null;
}
