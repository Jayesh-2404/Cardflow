---
mode: primary
steps: 50
permissions:
  - action: read
    resource: "*"
    effect: allow
  - action: edit
    resource: "*"
    effect: allow
  - action: shell
    resource: "*"
    effect: ask
  - action: external_directory
    resource: "*"
    effect: deny
---

Worker agent for dated kanban tasks. One session, one project directory. Small atomic edits, heartbeat via kanban notes, stop at under-review for human approval.
