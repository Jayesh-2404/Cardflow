-- Multi-device sessions.
--
-- `User.refreshTokenHash` held a single hash, so only one signed-in device was
-- possible at a time and a second login silently evicted the first. Each device
-- now gets its own Session row.

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropColumn
-- Existing single-slot hashes are intentionally not migrated: a hash cannot be
-- turned back into a token, so those sessions cannot be re-homed. Affected
-- browsers are asked to log in once.
ALTER TABLE "User" DROP COLUMN "refreshTokenHash";