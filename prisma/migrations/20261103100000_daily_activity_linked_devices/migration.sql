-- CreateTable
CREATE TABLE "DailyActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "steps" INTEGER,
    "sleepMinutes" INTEGER,
    "sleepStart" TIMESTAMP(3),
    "sleepEnd" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'health_connect',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt" TIMESTAMP(3),

    CONSTRAINT "LinkedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceLinkCode" (
    "codeHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceLinkCode_pkey" PRIMARY KEY ("codeHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyActivity_userId_localDate_key" ON "DailyActivity"("userId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedDevice_tokenHash_key" ON "LinkedDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "LinkedDevice_userId_idx" ON "LinkedDevice"("userId");

-- CreateIndex
CREATE INDEX "DeviceLinkCode_userId_idx" ON "DeviceLinkCode"("userId");

-- AddForeignKey
ALTER TABLE "DailyActivity" ADD CONSTRAINT "DailyActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedDevice" ADD CONSTRAINT "LinkedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceLinkCode" ADD CONSTRAINT "DeviceLinkCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

