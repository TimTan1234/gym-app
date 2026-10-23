-- CreateEnum
CREATE TYPE "ProcurementSource" AS ENUM ('IMAGE', 'MARKDOWN', 'DOCX', 'PDF', 'TEXT', 'MIXED', 'AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "ProcurementStatus" AS ENUM ('ACTIVE', 'DONE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GroceryCategory" AS ENUM ('PRODUCE', 'MEAT_SEAFOOD', 'DAIRY_EGGS', 'GRAINS_BREAD', 'PANTRY', 'FROZEN', 'DRINKS', 'SNACKS', 'OTHER');

-- AlterEnum
ALTER TYPE "AiKind" ADD VALUE 'PROCUREMENT';

-- CreateTable
CREATE TABLE "ProcurementPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" "ProcurementSource" NOT NULL,
    "status" "ProcurementStatus" NOT NULL DEFAULT 'ACTIVE',
    "days" INTEGER NOT NULL DEFAULT 7,
    "people" INTEGER NOT NULL DEFAULT 1,
    "startDate" TEXT,
    "budget" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "category" "GroceryCategory" NOT NULL DEFAULT 'OTHER',
    "estPrice" DOUBLE PRECISION,
    "actualPrice" DOUBLE PRECISION,
    "store" TEXT,
    "note" TEXT,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "consumedGrams" DOUBLE PRECISION,
    "kcal" DOUBLE PRECISION,
    "proteinG" DOUBLE PRECISION,
    "carbsG" DOUBLE PRECISION,
    "fatG" DOUBLE PRECISION,
    "fiberG" DOUBLE PRECISION,
    "sugarG" DOUBLE PRECISION,
    "addedSugarG" DOUBLE PRECISION,
    "sodiumMg" DOUBLE PRECISION,
    "gi" INTEGER,
    "savedFoodId" TEXT,

    CONSTRAINT "ProcurementItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementMeal" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "mealType" "MealType" NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProcurementMeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcurementPlan_userId_status_idx" ON "ProcurementPlan"("userId", "status");

-- CreateIndex
CREATE INDEX "ProcurementItem_planId_idx" ON "ProcurementItem"("planId");

-- CreateIndex
CREATE INDEX "ProcurementMeal_planId_idx" ON "ProcurementMeal"("planId");

-- AddForeignKey
ALTER TABLE "ProcurementPlan" ADD CONSTRAINT "ProcurementPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementItem" ADD CONSTRAINT "ProcurementItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ProcurementPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementMeal" ADD CONSTRAINT "ProcurementMeal_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ProcurementPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

