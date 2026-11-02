import { z } from "zod";
import { db } from "@/lib/db";
import { newDeviceToken, normalizeLinkCode, sha256 } from "@/lib/devices";

const LinkSchema = z.object({
  code: z.string().min(4).max(20),
  /** The phone's model, shown in Settings next to Revoke. */
  name: z.string().trim().min(1).max(60),
});

/**
 * The Android app trades the code shown in Settings for its own long-lived token.
 * The code works once and only for a few minutes.
 */
export async function POST(request: Request) {
  const body = LinkSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const codeHash = sha256(normalizeLinkCode(body.data.code));
  // Delete as it's read: a code can link one phone, however many tries arrive at once.
  const code = await db.deviceLinkCode.delete({ where: { codeHash } }).catch(() => null);
  if (!code || code.expiresAt < new Date()) return Response.json({ error: "invalid_code" }, { status: 400 });

  const token = newDeviceToken();
  await db.linkedDevice.create({ data: { userId: code.userId, name: body.data.name, tokenHash: sha256(token) } });
  const user = await db.user.findUnique({ where: { id: code.userId }, select: { name: true } });
  return Response.json({ token, name: user?.name ?? "" });
}
