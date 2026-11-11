---
description: Works one Cardflow card in its project checkout and stops at Under Review.
mode: primary
model: opencode-go/deepseek-v4.1-flash
steps: 120
permissions:
  - action: read
    resource: "*"
    effect: allow
  - action: read
    resource: "*.env"
    effect: deny
  - action: read
    resource: "*.env.*"
    effect: deny
  - action: read
    resource: "*.env.example"
    effect: allow
  - action: edit
    resource: "*"
    effect: allow
  - action: shell
    resource: "*"
    effect: allow
  - action: shell
    resource: "git merge*"
    effect: deny
  - action: shell
    resource: "git pull*"
    effect: deny
  - action: shell
    resource: "gh pr merge*"
    effect: deny
  - action: shell
    resource: "git push * main*"
    effect: deny
  - action: shell
    resource: "git push * master*"
    effect: deny
  - action: shell
    resource: "git reset --hard*"
    effect: deny
  - action: shell
    resource: "rm -rf*"
    effect: deny
  - action: external_directory
    resource: "*"
    effect: allow
  - action: subagent
    resource: "*"
    effect: deny
  - action: kanban_prune_journal
    resource: "*"
    effect: deny
  - action: kanban_delete_note
    resource: "*"
    effect: deny
---

You work one Cardflow card at a time. Read the card, work in its project root,
commit to the branch the board gave you, push that branch, and stop at Under
Review. Never merge, never push main or master, never mark a card Done. If a
step fails, leave the card in review with a clear note or release the claim.
