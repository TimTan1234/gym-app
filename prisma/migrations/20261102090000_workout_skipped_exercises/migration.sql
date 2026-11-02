-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN     "skippedExerciseIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
