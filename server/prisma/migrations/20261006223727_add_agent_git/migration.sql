-- AlterTable
ALTER TABLE "Task" ADD COLUMN "projectKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Task" ADD COLUMN "agentState" TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE "Task" ADD COLUMN "gitEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "branch" TEXT;
ALTER TABLE "Task" ADD COLUMN "lastCommit" TEXT;

-- CreateIndex
CREATE INDEX "Task_userId_dueDate_idx" ON "Task"("userId", "dueDate");
