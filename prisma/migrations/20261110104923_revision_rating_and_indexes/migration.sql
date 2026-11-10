-- CreateEnum
CREATE TYPE "RevisionRating" AS ENUM ('AGAIN', 'HARD', 'GOOD', 'EASY');

-- AlterTable
ALTER TABLE "Revision" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "rating" "RevisionRating";

-- CreateIndex
CREATE INDEX "Problem_userId_leetcodeNumber_idx" ON "Problem"("userId", "leetcodeNumber");

-- CreateIndex
CREATE INDEX "Problem_userId_dateSolved_idx" ON "Problem"("userId", "dateSolved");

-- CreateIndex
CREATE INDEX "Revision_problemId_completed_idx" ON "Revision"("problemId", "completed");
