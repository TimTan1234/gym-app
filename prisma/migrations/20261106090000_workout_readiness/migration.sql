-- CreateEnum
CREATE TYPE "Readiness" AS ENUM ('TIRED', 'NORMAL', 'GREAT');

-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN     "readiness" "Readiness";

