"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import type { ActionResult } from "./profile";

export async function deleteProgressPhoto(id: string): Promise<ActionResult> {
  const user = await requireUser();
  await db.progressPhoto.deleteMany({ where: { id, userId: user.id } });
  refresh();
  return { ok: true };
}
