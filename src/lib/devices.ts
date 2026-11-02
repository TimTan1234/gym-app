import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { db } from "@/lib/db";

/** How long a link code shown in Settings stays usable. */
export const LINK_CODE_MINUTES = 10;
// No 0/O, 1/I/L: the code is read off one screen and typed into another.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** An 8-character code, shown as ABCD-EFGH. */
export function newLinkCode(): string {
  return Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

/** What the person typed, as stored: upper case, dashes and spaces dropped. */
export const normalizeLinkCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const newDeviceToken = () => randomBytes(32).toString("base64url");

/** The linked phone behind a request's `Authorization: Bearer` token, or null. */
export async function deviceFromRequest(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  return db.linkedDevice.findUnique({
    where: { tokenHash: sha256(token) },
    select: { id: true, userId: true, user: { select: { profile: { select: { timezone: true } } } } },
  });
}
