# Task: UI/UX redesign, replicate the Arc "Kanban board" reference

Reference this file when starting the worktree session. Treat it as the full task brief and follow it end to end.

- Repo: Cardflow, `F:\notes\projects\kanban-board` (its own repo, remote `Jayesh-2404/Cardflow`)
- Branch: `kanban/ui-redesign`, cut from `main` in a fresh worktree
- Type: UI/UX only. No feature changes.

## Goal

Rebuild Cardflow's UI so it looks and feels like the reference kanban board below, while every existing feature keeps working. The board is the centerpiece. The rest of the app (journal, filters, palette, editor, header, login) is restyled with the same visual language so nothing clashes.

## Reference

- Live preview (visual target): https://uiarc.dev/components/blocks/kanban-board
- Behavior notes: https://uiarc.dev/components/blocks/kanban-board/markdown
- The block is a paid product. Do not copy its source. Replicate behavior and visual style only. Keep reference screenshots out of the committed repo.

### Behavior spec, condensed from the reference

Motion:
- The grabbed card lifts (scale, shadow) and tilts from horizontal velocity on a spring. It follows the pointer from the point you grabbed it.
- A slot opens where the card will land; neighbors glide aside with layout springs.
- On release the card springs into the slot, carrying the throw's velocity.
- The board auto-scrolls at the edges on both axes while dragging.
- Only the dragged card moves every frame. Movement is transform-based. Cards are memoized.
- Reduced motion disables tilt and travel. Drops land instantly.

Keyboard:
- Enter opens the focused card's details.
- Space lifts the focused card. Space or Enter drops it.
- Up/Down moves a lifted card within its column. Left/Right moves it to the neighbor column.
- Escape cancels a drag or closes the drawer.

Accessibility:
- Cards are focusable buttons with a draggable role description and a label including title and id.
- Pick up, move, and drop are announced in an assertive live region with column and position.
- The task drawer is a modal dialog. Focus moves in, Tab is trapped, Escape closes, focus returns to the card.

Responsive:
- Columns keep a readable minimum width. The board scrolls sideways with snap on phones.
- The drawer covers the board on narrow frames.

Performance:
- Comfortable up to a few hundred cards.

Visual building blocks cited by the reference: adopt the animated counter for column counts. Avatars and the segmented group-by control are N/A for us, we have no people.

## Current state (measured)

- React + Vite + Tailwind v4. Tokens in `src/index.css`: warm neutral palette, indigo accent, 1px borders, radii 6/8/12, Inter + JetBrains Mono, dark mode. Motion token today: one 140ms ease.
- Board and app state live in `src/App.tsx` (928 lines). Drag uses `@dnd-kit/core` + `@dnd-kit/sortable`: PointerSensor (distance 4), TouchSensor (delay 220, tolerance 6), a custom collision detection. Cards move in place through sortable transforms. There is no DragOverlay.
- Missing today, required by the reference: keyboard drag (no KeyboardSensor), screen-reader announcements (no aria-live anywhere), physical motion (no lift, tilt, or springs).
- Components: `TaskCard`, `BoardColumn`, `TaskEditor` (modal), `JournalPanel`, `Timeline`, `CommandPalette`, `Header`, `Sidebar`, `Login`, `Icon` (hand-drawn single-stroke SVGs, no emoji).
- e2e: `e2e/board.spec.ts` covers quick-add, journal copy, archive, keyboard shortcuts, and filters. It must keep passing.

## Scope (frozen)

In:
- Full visual redesign of the board surface: columns, card design, column headers with live animated counts, board header, quick add, drag motion. The task editor is restyled as the reference's drawer pattern.
- Restyle of everything else with the same tokens: journal panel and timeline, filters, command palette, dialogs, header, login screen. Keep their structure and flows.
- The three interaction upgrades the reference requires: keyboard drag, live-region announcements, physical drag motion.

Out:
- No new features. No WIP limits, no assignees or avatars, no swimlanes, no group-by control.
- No server changes. `server/` is untouched: no API, schema, MCP, or journal changes. If the redesign seems to need one, stop and ask instead of changing it.
- No auth or live-sync protocol changes.
- No icon-library swap. Keep `Icon.tsx` and extend it as needed. No emoji.

## Implementation guidance

1. Step 0, capture the visual target. Open the live preview with Playwright and screenshot the board: desktop and 390px phone widths, light and dark if the preview offers both, drawer open, and a mid-drag frame if possible. Save under `C:\Users\jayes\AppData\Local\Temp\opencode\ui-redesign\reference\`. If the preview does not render, stop and ask for screenshots. Do not guess the visual language from text alone.
2. Name the data shape first. One explicit drag session state (idle, lifting, dragging, dropping) plus a derived insertion slot (listId, index). No scattered booleans. Board order stays list-scoped. A move commits through the existing optimistic pattern and the existing API.
3. Engine choice. Keep dnd-kit for sensors, hit-testing, auto-scroll, and the accessibility primitives. Layer `motion` (motion.dev, MIT, import path `motion/react`) for the physical feel: pointer-following overlay, velocity tilt, layout springs on neighbors, spring drop. That is the only new runtime dependency. If you deviate, you must rebuild keyboard drag and announcements to the same bar and justify it in the report.
4. Wire the missing pieces. KeyboardSensor with sortable keyboard coordinates. dnd-kit Accessibility live region, assertive, naming the column and position. DragOverlay so the grabbed card rides the pointer, transform-only per frame.
5. Tokens first, then components. Extend `src/index.css` with the new scale (type, spacing, radius, shadow, motion durations and easings) for both themes, then restyle. Keep sentence-case copy and tabular numerals.
6. Shortcut conflicts. Global keys must keep working: N, J, F, /, 1-9, Ctrl/Cmd+K, Enter and Shift+Enter inside inputs. Enter on a focused card opens its details. Space lifts it. Resolve overlaps deliberately and update the README "Keyboard" table for every change.
7. Preserve behavior. Due-date humanizing (`src/lib/format.ts`), agent-state badges, archive and restore, import and export, journal timeline and feed, filters, palette, live sync, dark mode. Optimistic updates and SSE refetch behavior stay as they are.

## Verification (all required)

- `cd server && npm test` and `npm run typecheck`.
- Root `npm run typecheck`, `npm run build`, and server `npm run build`.
- `npm run test:e2e` (Playwright, desktop) passes. Update `e2e/board.spec.ts` only for genuinely changed UI, and explain each change in the report.
- New unit tests only if you extract pure logic, like slot math. Prefer e2e and manual verification. No timing-dependent tests.
- Drive the real app (both dev servers, seeded account) with Playwright and capture evidence under `C:\Users\jayes\AppData\Local\Temp\opencode\ui-redesign\evidence\`:
  - before and after screenshots: board (light and dark), mid-drag frame, drawer open, journal, filters, palette, 390px phone;
  - a short screen recording of one drag if Playwright video capture cooperates;
  - the motion checklist below, pass/fail each with a note on how you verified.
- Motion checklist:
  1. lift with shadow and velocity tilt
  2. slot opens, neighbors glide with springs
  3. spring drop carrying throw velocity
  4. edge auto-scroll, both axes
  5. keyboard: Space lift, arrows move, Space or Enter drop, Esc cancel, Enter opens details
  6. announcements: live region text updates on pick up, move, drop (state how you checked)
  7. reduced motion honored
  8. phone: snap scroll and usable layout at 390px, drawer covers the board
  9. 200-card board (seed through the JSON import feature or a small script) stays smooth while dragging
- Two-tab live sync: move a card in tab A, tab B updates within a second.

## Deliverable

- Work on `kanban/ui-redesign` cut from `main`. This brief is already in the repo at `task_ui_improvement.md`; move it to `docs/specs/ui-redesign.md` in your first commit.
- Small commits, each one verifiable. Run git from the worktree only, never from `F:\notes`. Do not push, pushes are user-run in this repo.
- Keep the worktree in place for review. When everything above passes, set the card to `under-review` with branch and lastCommit. Never mark it Done.
- Report: what changed, the engine decision and why, evidence paths, checklist results, known gaps or follow-ups.
