---
description: Pick the next Cardflow card and work it to Under Review
agent: worker
model: opencode-go/deepseek-v4.1-flash
---

Pick one card from the Cardflow board, work it in its project checkout on a new
branch, and stop at Under Review. Never merge and never mark a card Done.

1. Call `kanban_board_health`. If `remote.ok` is false, report the error and stop.
2. Call `kanban_pick_task` with `runner: "opencode"` and
   `model: "opencode-go/deepseek-v4.1-flash"`.
   If `$ARGUMENTS` is non-empty, pass it as `project`.
3. If `task` is null, reply `idle — no claimable card` and stop.
4. `cd` into the returned `projectRoot`. Run `git status --porcelain`.
   If it is not empty, call `kanban_release_task` with the reason
   `working tree is dirty` and stop. Never commit someone else's changes.
5. Create the returned `branch` with `git switch -c "<branch>"`. If it already
   exists, append `-2`. Never work on main or master.
6. Read the card's `description` and implement exactly that. Keep commits small.
   Call `kanban_heartbeat_task` between long steps and `kanban_add_note` for
   progress that a reviewer would want.
7. If `gitEnabled` is true:
   - `git push -u origin "<branch>"`.
   - If `gh auth status` succeeds, open a draft PR:
     `gh pr create --draft --head "<branch>" --title "<card title>" --body "<card id and summary>"`.
     Capture the URL and number.
   - Never run `git merge`, `gh pr merge`, or push to main/master.
8. Run `git rev-parse HEAD` for the commit.
9. Call `kanban_finish_task` with the id, branch, lastCommit, prUrl, prNumber,
   and a short summary. This moves the card to Under Review.
10. Reply with the card id, branch, commit, PR link, and elapsed time.

If the work cannot continue after the claim, call `kanban_release_task` with the
reason. If part of the work is on a branch, call `kanban_finish_task` instead so
the card lands in review with the branch and the blocker.

$ARGUMENTS
