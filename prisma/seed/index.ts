import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { EXERCISES } from "./exercises";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  let created = 0;
  let updated = 0;
  for (const ex of EXERCISES) {
    // Global exercises have userId = null, which can't be used in a compound
    // unique upsert, so look up by slug first.
    const existing = await db.exercise.findFirst({ where: { slug: ex.slug, userId: null } });
    if (existing) {
      await db.exercise.update({ where: { id: existing.id }, data: ex });
      updated++;
    } else {
      await db.exercise.create({ data: ex });
      created++;
    }
  }
  console.log(`Exercises: ${created} created, ${updated} updated (${EXERCISES.length} total)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
