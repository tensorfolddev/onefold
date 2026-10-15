// The password strength meter. Hashing happens on the server only (Argon2id, src/server/auth/passwords.ts).

const SCORE_LABELS = ["Too weak", "Weak", "Okay", "Strong", "Very strong"] as const;
/** 0–4, for the strength meter. Length matters most; mixing kinds of characters helps. */
export function passwordStrength(pw: string) {
  if (!pw) return { score: 0, label: SCORE_LABELS[0] };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  let score = pw.length >= 8 ? 1 : 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (kinds >= 3) score++;
  if (/^(.)\1+$/.test(pw) || /^(password|12345678|qwertyui)/i.test(pw)) score = 0;
  score = Math.min(4, score);
  return { score, label: SCORE_LABELS[score] };
}
