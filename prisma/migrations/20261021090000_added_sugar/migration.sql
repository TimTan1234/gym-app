-- AlterTable
ALTER TABLE "Meal" ADD COLUMN     "addedSugarG" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MealItem" ADD COLUMN     "addedSugarG" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SavedFood" ADD COLUMN     "addedSugarG" DOUBLE PRECISION NOT NULL DEFAULT 0;


-- Rows logged before added sugar was tracked: take their total sugar as an
-- upper bound, so old days don't suddenly read as sugar-free.
UPDATE "Meal" SET "addedSugarG" = "sugarG";
UPDATE "MealItem" SET "addedSugarG" = "sugarG";
UPDATE "SavedFood" SET "addedSugarG" = "sugarG";
