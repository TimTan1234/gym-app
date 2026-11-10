-- CreateIndex
CREATE INDEX "MealItem_mealId_idx" ON "MealItem"("mealId");

-- CreateIndex
CREATE INDEX "PersonalRecord_setId_idx" ON "PersonalRecord"("setId");

-- CreateIndex
CREATE INDEX "PlanExercise_planDayId_idx" ON "PlanExercise"("planDayId");

-- CreateIndex
CREATE INDEX "WorkoutSession_planDayId_idx" ON "WorkoutSession"("planDayId");

