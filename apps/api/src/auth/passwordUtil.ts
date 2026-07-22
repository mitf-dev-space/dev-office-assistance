import { randomBytes } from "node:crypto";

const CHARSET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?_-";

export function generateTemporaryPassword(length = 12): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CHARSET[bytes[i]! % CHARSET.length];
  }
  return out;
}

export function validateNewPassword(password: string): string | null {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters";
  }
  return null;
}
