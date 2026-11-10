-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('WEIGH_IN', 'WORKOUT');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "weighInReminder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weighInTime" TEXT NOT NULL DEFAULT '07:30',
ADD COLUMN     "workoutDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "workoutReminder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "workoutTime" TEXT NOT NULL DEFAULT '18:00';

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderSent" (
    "userId" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "localDate" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderSent_pkey" PRIMARY KEY ("userId","kind","localDate")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderSent" ADD CONSTRAINT "ReminderSent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

