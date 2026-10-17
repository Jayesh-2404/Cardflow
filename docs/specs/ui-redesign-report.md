# UI redesign — verification report

Branch: `kanban/ui-redesign`, base `main`. UI/UX only: `git diff main...HEAD -- server/`
is empty, and no API, schema, MCP, or live-sync protocol changed. The brief lives at
`docs/specs/ui-redesign.md` (moved there in `97f0a14`).

## What changed

- **Tokens** — `src/index.css` rebuilt around one scale (type, spacing, radius, shadow,
  motion durations/easings) for both themes; the `kb` colours are registered via `@theme`
  so the utilities resolve (`f4e5fae`, `9dcb661`).
- **Board surface** — one responsive board at every width (the phone list-tabs are gone);
  columns keep a readable minimum and the board snaps list-by-list on a phone. Cards show
  `#HASH` ids, dot priority, entry counts, agent badges; header, quick-add and animated
  column counters are rebuilt (`4ed7f77`, `a772073`).
- **Drag motion** — dnd-kit keeps sensors, hit-testing and auto-scroll; `motion/react`
  provides the physical layer: pointer-following overlay, velocity tilt on a spring,
  layout springs on neighbours, spring drop. The insertion slot is pure logic in
  `src/lib/slot.ts` (`4ed7f77`).
- **Accessibility** — keyboard drag (Space lift, arrows move, Space/Enter drop, Esc
  cancel), an assertive live region naming column and position
  (`src/lib/dragAnnouncements.ts`), Enter opens the focused card; the task drawer is the
  reference's modal (`614d4ea`, `90ace16`).
- **The rest of the app on the same scale** — sidebar/floating panels (`ea7ba18`),
  journal (`23a5984`), command palette (`1fca1be`), login (`870849a`); README keyboard
  table updated (`55b61aa`).

## Engine decision (brief §3)

Keep `@dnd-kit/core` + `@dnd-kit/sortable` for sensors, hit-testing, auto-scroll and its
accessibility primitives. Layer `motion/react` — the one new runtime dependency the brief
allows — for the physical feel. Derive the insertion slot as pure, side-effect-free logic
(`src/lib/slot.ts`) so the trickiest math stays reasoning- and unit-test friendly. No
custom drag engine was written.

## Verification

| What | Result | Evidence |
| --- | --- | --- |
| `cd server && npm test` | 26/26 pass | `checks-batch.txt` |
| `cd server && npm run typecheck` | clean | `checks-batch.txt` |
| server `npm run build` | `tsc` clean (exit 0) | `checks-batch.txt` |
| root `npm run build` (`tsc && vite build`) | clean; 493 kB js / 155 kB gzip | `checks-batch.txt` |
| `npm run typecheck:e2e` | clean (exit 0) | run log |
| `npm run test:e2e` full suite | **24/24, exit 0** | `full-suite-5174-run2.txt` |
| desktop project | 12/12 | `desktop-green-5174.txt` |
| mobile project | 12/12 | `mobile-green-5174.txt` |
| mobile baseline on `main` | 12/12 — the redesign regressed nothing the suite covers | `mobile-baseline-main.txt` |

Two environment notes on the table: the root package has no `typecheck` script, so `tsc`
runs inside `npm run build`; and the server build's `prisma generate` step hits EPERM on
`query_engine-windows.dll.node` while the dev API process holds it — the compile itself
(`tsc -p tsconfig.json`) exits 0 and `prisma generate` succeeds whenever the dev server
is stopped.

### e2e spec changes (all three, and why)

1. Removed the `showList` mobile-tab helper and its call site — the surface no longer
   switches lists behind tabs on a phone, so there is nothing to switch.
2. `editor-column` moved from `selectOption` to a radiogroup click — the drawer's list
   picker is now a segmented radiogroup of list names.
3. `journal-filter-note` button → `journal-filter` radio `Notes` — the journal filters
   became a radiogroup.

No assertion was weakened; everything else in the spec is untouched.

### Motion checklist (the brief's nine)

1. **Lift with shadow and velocity tilt** — PASS. Smoke driver mid-drag: rotation
   ≈ −6.7° with a layered lift shadow, the source card hidden, overlay rides the
   pointer (`smoke-run2.txt`, `after-02-mid-drag.png`).
2. **Slot opens, neighbours glide with springs** — PASS. Exactly one placeholder slot
   mid-drag; neighbours animate through motion layout springs; movement is transform-only
   and cards are memoized.
3. **Spring drop carrying throw velocity** — PASS. Drop-flight and settle captured
   (`after-03-drop-flight.png`, `after-04-after-drop.png`); the drop settles in 7 ms under
   reduced motion.
4. **Edge auto-scroll, both axes** — PASS. Probe: holding the pointer at the tray's bottom
   edge scrolled `scrollTop` 189 → 1638 px; holding at the board's right edge reached max
   `scrollLeft` 788 px; both with the drag active (`probe-report.json`).
5. **Keyboard: Space lift, arrows move, Space/Enter drop, Esc cancel, Enter opens** —
   PASS. e2e keyboard test passes, Enter opens the focused card (checks run:
   `enterOpensEditor: true`), lift/move/drop announcements observed during a scripted
   keyboard drag (`checks-run2.txt`, `after-05-keyboard-lift.png`).
6. **Announcements on pick up, move, drop** — PASS. Assertive live-region strings were
   read from the DOM mid-drag: pick-up, move (with list + position), drop and cancel
   (`smoke-run2.txt`).
7. **Reduced motion honored** — PASS. `prefers-reduced-motion`: rotation 0,
   `transform: none`, drop settles in 7 ms (`checks-report.json`).
8. **Phone: snap scroll, usable 390 px layout, drawer covers the board** — PASS. Phone
   probes: `snapType: x`, column width 235 px; the drawer is 374 px on a 390 px frame
   (96 %); screenshots `after-10-phone.png`, `after-40-drawer-phone.png`.
9. **200-card board stays smooth while dragging** — PASS. A column with 201 cards, clean
   frame sample during a drag (n = 90): p50 **16.6 ms**, p95 **20.1 ms**, max 74.6 ms;
   auto-scroll keeps working while dragging; `after-41-200-cards.png`,
   `after-42-200-mid-drag.png`.

### Two-tab live sync

Measured with an instrumented second tab (raw `EventSource` plus a `fetch` patch and a
`MutationObserver`): the server push arrives the instant the write commits; the receiving
tab then waits its 350 ms coalescing debounce and refetches. Card visible in tab B
≈ 1.0–1.2 s after the commit (350 ms debounce + 0.6–0.8 s refetch + render ≈ 20–60 ms;
`sync2-report.json`, three iterations, and `probe-run.txt`). Wall-clock in the measured
window was ≈ 3.9 s, dominated by the shared Neon write (≈ 2.8 s per move-write) — the
originating tab waits on the same write, so the two tabs converge within ≈ 1 s of each
other. On a warm database the refetch lands in ≈ 0.2–0.5 s, making the peer update
≈ 0.6 s after the commit.

## In-repo assets

`docs/specs/ui-redesign/` — `before-*` (captured from `main`), `after-*` (captured
against this branch; the board, drag, drawer and 200-card shots against the final head,
the panel shots during their feature commits, after which only token cleanup landed),
and `drag-clip.mp4` (5.4 s recording of one drag, from Playwright video capture).

## Evidence (working files, outside the repo)

`C:\Users\jayes\AppData\Local\Temp\opencode\ui-redesign\evidence\` — e2e runs
(`full-suite-5174-run2.txt`, `desktop-green-5174.txt`, `mobile-green-5174.txt`,
`mobile-baseline-main.txt`), checks (`checks-batch.txt`, `checks-run2.txt`,
`checks-report.json`), probes (`probe-report.json`, `sync2-report.json`), smoke
(`smoke-run2.txt`), drag clip source (`drag-clip.webm`). The e2e suite ran against an
isolated stack (web `:5174`, api `:4001`) because unrelated processes hold `:5173` and
`:4000` on this machine; the server's own auth limiter (60 logins / 10 min / IP) allows
one full suite per window, which is how the final 24/24 run was taken.

## Known gaps / follow-ups

- `POST /api/board/replace` fails with P2028 at ≈ 200 tasks (pre-existing journeyed
  issue; `server/` is frozen by scope). Seeding 200 cards with chunked
  `POST /api/board/tasks` works, which is how the 200-card checks were run. A reset then
  sweeps the board clean again.
- Creating a card does not notify other tabs: `POST /tasks` never calls the server's
  `bump()` (moves, notes, deletes, archives, replaces do). Pre-existing server behavior,
  identical to `main`, out of scope — moves, the case the brief requires, sync fine.
- Live-sync wall-clock follows the shared database's write latency, not the sync layer
  (see above). Treat the seconds above as environment-bound measurements.
- The reset endpoint's transaction is heavy under acute database load (one 35 s timeout
  was observed during the earlier Neon incident); a healthy window resets in ≈ 4 s.
