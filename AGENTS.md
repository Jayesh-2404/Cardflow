# Cardflow (kanban-board)

This project is its own git repo, nested at F:\notes\projects\kanban-board
inside the notes tree. The notes repo ignores this path.

- Remote: https://github.com/Jayesh-2404/Cardflow (public)
- History was carried over from the notes monorepo. Do not rewrite it.

## Commit rules

- Before committing, confirm `git remote -v` shows Cardflow. If it shows the
  notes repo or anything else, stop and fix the remote.
- Run git from this directory. Never stage these files from F:\notes.
- `git push` is denied to agents by opencode.jsonc. Commit locally, then
  report the branch and commit; the user runs pushes.
