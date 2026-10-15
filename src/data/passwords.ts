// Password hashing with WebCrypto (browser + Node): salted PBKDF2-SHA256. Only {hash, salt} is ever stored.
// ponytail: the backend takes this over (and adds rate limiting); same output shape so stored accounts keep working.
export const PBKDF2_ROUNDS = 600_000;

const b64 = (bytes: ArrayBuffer | Uint8Array) => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, rounds: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: rounds }, key, 256);
}

export async function hashPassword(password: string, rounds = PBKDF2_ROUNDS): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: `${rounds}:${b64(await derive(password, salt, rounds))}`, salt: b64(salt) };
}

/** Constant-time compare of the derived key. Rounds are stored with the hash ("600000:base64"). */
export async function verifyPassword(password: string, stored: { passwordHash: string; passwordSalt: string }): Promise<boolean> {
  const [roundsText, expected] = stored.passwordHash.split(":");
  const rounds = Number(roundsText);
  if (!expected || !Number.isInteger(rounds) || rounds < 1) return false;
  const actual = b64(await derive(password, unb64(stored.passwordSalt), rounds));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

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
