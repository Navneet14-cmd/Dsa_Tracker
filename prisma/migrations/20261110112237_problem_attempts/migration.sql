-- CreateTable
CREATE TABLE "ProblemAttempt" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL,
    "timeTakenMins" INTEGER NOT NULL,
    "solvedAlone" BOOLEAN NOT NULL,
    "confidence" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProblemAttempt_problemId_attemptedAt_idx" ON "ProblemAttempt"("problemId", "attemptedAt");

-- AddForeignKey
ALTER TABLE "ProblemAttempt" ADD CONSTRAINT "ProblemAttempt_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
