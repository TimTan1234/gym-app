-- CreateEnum
CREATE TYPE "Flow" AS ENUM ('SPOTTING', 'LIGHT', 'MEDIUM', 'HEAVY');

-- CreateEnum
CREATE TYPE "Mood" AS ENUM ('VERY_LOW', 'LOW', 'NEUTRAL', 'GOOD', 'GREAT');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "customSymptoms" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "cycleLength" INTEGER NOT NULL DEFAULT 28,
ADD COLUMN     "cycleTracking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "periodLength" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "showFertileWindow" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Period" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,

    CONSTRAINT "Period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "flow" "Flow",
    "symptoms" JSONB NOT NULL DEFAULT '[]',
    "mood" "Mood",
    "pain" INTEGER,
    "energy" INTEGER,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CycleDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Period_userId_startDate_key" ON "Period"("userId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "CycleDay_userId_localDate_key" ON "CycleDay"("userId", "localDate");

-- AddForeignKey
ALTER TABLE "Period" ADD CONSTRAINT "Period_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleDay" ADD CONSTRAINT "CycleDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

