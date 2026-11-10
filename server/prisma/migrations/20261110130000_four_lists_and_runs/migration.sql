-- Four fixed lists + agent runs.
--
-- Every board becomes Todo / Doing / Under Review / Done, distinguished by
-- `kind` rather than title so a renamed list keeps its meaning. Extra lists are
-- merged into the list of the same kind (tasks move, journal entries stay), and
-- a missing kind is created. The stored Task.agentState is replaced by
-- TaskRun plus the column kind.

-- AlterTable
ALTER TABLE "Column" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'active';

-- Classify the lists that already exist. Titles were user-editable, so the
-- match is loose; anything unrecognised stays active rather than guessing a
-- terminal state.
UPDATE "Column"
SET kind = CASE
  WHEN lower(btrim(title)) = 'todo' THEN 'todo'
  WHEN lower(btrim(title)) IN ('doing', 'in progress', 'in-progress', 'active') THEN 'active'
  WHEN lower(btrim(title)) IN ('under review', 'review', 'in review', 'in-review') THEN 'review'
  WHEN lower(btrim(title)) IN ('done', 'complete', 'completed') OR lower(btrim(title)) LIKE 'done %' THEN 'done'
  ELSE 'active'
END;

-- Duplicate kinds are merged into the lowest-positioned list of that kind.
-- Append moved tasks after the canonical list's last position so their relative
-- order survives.
WITH canonical AS (
  SELECT DISTINCT ON ("userId", kind) id, "userId", kind
  FROM "Column"
  ORDER BY "userId", kind, position, "createdAt", id
),
targets AS (
  SELECT c.id, COALESCE(MAX(t.position) + 1, 0) AS start_pos
  FROM canonical c
  LEFT JOIN "Task" t ON t."columnId" = c.id
  GROUP BY c.id
),
moved AS (
  SELECT t.id,
         c.id AS target_id,
         targets.start_pos + row_number() OVER (
           PARTITION BY c.id ORDER BY t."createdAt", t.id
         ) - 1 AS pos
  FROM "Task" t
  JOIN "Column" src ON src.id = t."columnId"
  JOIN canonical c ON c."userId" = src."userId" AND c.kind = src.kind
  JOIN targets ON targets.id = c.id
  WHERE t."columnId" <> c.id
)
UPDATE "Task" t
SET "columnId" = moved.target_id,
    position = moved.pos
FROM moved
WHERE t.id = moved.id;

WITH canonical AS (
  SELECT DISTINCT ON ("userId", kind) id, "userId", kind
  FROM "Column"
  ORDER BY "userId", kind, position, "createdAt", id
)
DELETE FROM "Column" c
USING canonical
WHERE c."userId" = canonical."userId"
  AND c.kind = canonical.kind
  AND c.id <> canonical.id;

-- Create the missing lists for every user.
INSERT INTO "Column" ("id", "userId", "title", "kind", "position", "createdAt")
SELECT 'col' || md5(u.id || wanted.kind || clock_timestamp()::text),
       u.id,
       wanted.title,
       wanted.kind,
       wanted.position,
       CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN (
  VALUES
    ('todo', 'Todo', 0),
    ('active', 'Doing', 1),
    ('review', 'Under Review', 2),
    ('done', 'Done', 3)
) AS wanted(kind, title, position)
WHERE NOT EXISTS (
  SELECT 1 FROM "Column" c
  WHERE c."userId" = u.id AND c.kind = wanted.kind
);

-- One deterministic order after the merge: kind order, then the old position
-- for any list whose kind is already in place.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY "userId"
           ORDER BY CASE kind
                      WHEN 'todo' THEN 0
                      WHEN 'active' THEN 1
                      WHEN 'review' THEN 2
                      WHEN 'done' THEN 3
                      ELSE 4
                    END,
                    position,
                    "createdAt",
                    id
         ) - 1 AS pos
  FROM "Column"
)
UPDATE "Column" c
SET position = ranked.pos
FROM ranked
WHERE c.id = ranked.id;

-- CreateTable
CREATE TABLE "TaskRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'claimed',
    "runner" TEXT NOT NULL DEFAULT 'opencode',
    "model" TEXT,
    "branch" TEXT,
    "worktree" TEXT,
    "prUrl" TEXT,
    "prNumber" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "elapsedMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskRun_pkey" PRIMARY KEY ("id")
);

-- A task that was mid-run keeps its badge; runner 'unknown' is honest about
-- the fact that the old schema never recorded which agent it was.
INSERT INTO "TaskRun" (
  "id", "userId", "taskId", "status", "runner", "branch",
  "startedAt", "heartbeatAt", "createdAt", "updatedAt"
)
SELECT 'run' || md5(t.id || clock_timestamp()::text),
       t."userId",
       t.id,
       'running',
       'unknown',
       t.branch,
       t."updatedAt",
       t."updatedAt",
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "Task" t
WHERE t."agentState" = 'running';

-- Old under-review/completed cards move to their kind's list. Their position is
-- appended in updatedAt order, so a busy list does not reshuffle.
WITH desired(kind, state) AS (
  VALUES ('review', 'under-review'), ('done', 'completed')
),
targets AS (
  SELECT c.id, c."userId", COALESCE(MAX(t.position) + 1, 0) AS start_pos
  FROM "Column" c
  LEFT JOIN "Task" t ON t."columnId" = c.id
  WHERE c.kind IN ('review', 'done')
  GROUP BY c.id, c."userId"
),
moved AS (
  SELECT t.id,
         targets.id AS target_id,
         targets.start_pos + row_number() OVER (
           PARTITION BY targets.id ORDER BY t."updatedAt", t.id
         ) - 1 AS pos
  FROM "Task" t
  JOIN desired ON desired.state = t."agentState"
  JOIN "Column" c ON c."userId" = t."userId" AND c.kind = desired.kind
  JOIN targets ON targets.id = c.id
  WHERE t."columnId" <> targets.id
)
UPDATE "Task" t
SET "columnId" = moved.target_id,
    position = moved.pos
FROM moved
WHERE t.id = moved.id;

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "agentState";

-- CreateIndex
CREATE INDEX "TaskRun_userId_status_idx" ON "TaskRun"("userId", "status");

-- CreateIndex
CREATE INDEX "TaskRun_taskId_startedAt_idx" ON "TaskRun"("taskId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Column_userId_kind_key" ON "Column"("userId", "kind");

-- AddForeignKey
ALTER TABLE "TaskRun" ADD CONSTRAINT "TaskRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRun" ADD CONSTRAINT "TaskRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
