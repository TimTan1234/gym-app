-- CreateEnum
CREATE TYPE "BodyFatSource" AS ENUM ('MEASURED', 'PHOTO_ESTIMATE');

-- AlterEnum
ALTER TYPE "AiKind" ADD VALUE 'BODY';

-- AlterTable
ALTER TABLE "BodyMetric" ADD COLUMN     "bodyFatSource" "BodyFatSource";

