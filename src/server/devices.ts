"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { LINK_CODE_MINUTES, newLinkCode, sha256 } from "@/lib/devices";
import type { ActionResult } from "./profile";

/** A fresh code for linking a phone; any older unused code of this user stops working. */
export async function createLinkCode(): Promise<{ code: string; expiresAt: string }> {
  const user = await requireUser();
  const code = newLinkCode();
  const expiresAt = new Date(Date.now() + LINK_CODE_MINUTES * 60_000);
  await db.$transaction([
    db.deviceLinkCode.deleteMany({ where: { userId: user.id } }),
    db.deviceLinkCode.create({ data: { codeHash: sha256(code), userId: user.id, expiresAt } }),
  ]);
  return { code, expiresAt: expiresAt.toISOString() };
}

/** Unlinks a phone: its token stops working at once. The data it already sent stays. */
export async function revokeDevice(id: string): Promise<ActionResult> {
  const user = await requireUser();
  await db.linkedDevice.deleteMany({ where: { id, userId: user.id } });
  refresh();
  return { ok: true };
}
