# Cardflow (kanban-board)

This project is its own git repo. It used to live inside the notes tree; the
notes repo ignores this path.

- Remote: https://github.com/Jayesh-2404/Cardflow (public)
- History was carried over from the notes monorepo. Do not rewrite it.

## Commit rules

- Before committing, confirm `git remote -v` shows Cardflow. If it shows the
  notes repo or anything else, stop and fix the remote.
- Run git from this directory.
- Agents may push `kanban/*` branches and open draft PRs. Never push `main` or
  `master`, and never merge a branch. The human merges.
