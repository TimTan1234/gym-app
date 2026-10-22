-- CreateEnum
CREATE TYPE "DiabetesType" AS ENUM ('PREDIABETES', 'TYPE2');

-- CreateEnum
CREATE TYPE "GlucoseUnit" AS ENUM ('MMOL_L', 'MG_DL');

-- CreateEnum
CREATE TYPE "GlucoseContext" AS ENUM ('FASTING', 'BEFORE_MEAL', 'AFTER_MEAL', 'BEDTIME', 'BEFORE_EXERCISE', 'OTHER');

-- AlterTable
ALTER TABLE "MealItem" ADD COLUMN     "gi" INTEGER;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "diabetesMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "diabetesType" "DiabetesType",
ADD COLUMN     "glucoseFastingMax" DOUBLE PRECISION NOT NULL DEFAULT 7.0,
ADD COLUMN     "glucoseFastingMin" DOUBLE PRECISION NOT NULL DEFAULT 4.4,
ADD COLUMN     "glucosePostMealMax" DOUBLE PRECISION NOT NULL DEFAULT 8.5,
ADD COLUMN     "glucoseUnit" "GlucoseUnit" NOT NULL DEFAULT 'MMOL_L',
ADD COLUMN     "hypoRiskMeds" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SavedFood" ADD COLUMN     "gi" INTEGER;

-- CreateTable
CREATE TABLE "GlucoseReading" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "localDate" TEXT NOT NULL,
    "mmol" DOUBLE PRECISION NOT NULL,
    "context" "GlucoseContext" NOT NULL,
    "mealId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlucoseReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GlucoseReading_userId_localDate_idx" ON "GlucoseReading"("userId", "localDate");

-- CreateIndex
CREATE INDEX "GlucoseReading_mealId_idx" ON "GlucoseReading"("mealId");

-- AddForeignKey
ALTER TABLE "GlucoseReading" ADD CONSTRAINT "GlucoseReading_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlucoseReading" ADD CONSTRAINT "GlucoseReading_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

