import { connection } from "next/server";
import { db } from "@/lib/db";

/** Liveness + database check for container health probes. */
export async function GET() {
  await connection(); // never prerender: this must run per request
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "Database unreachable" }, { status: 503 });
  }
}
