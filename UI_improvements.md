# Kanban board

> A kanban board where cards lift, tilt and spring into the slot that opens for them, with swimlanes and live WIP limits.

- Type: Block
- Page: https://uiarc.dev/components/blocks/kanban-board
- Markdown: https://uiarc.dev/components/blocks/kanban-board/markdown

- Access: Arc Pro
- Registry id: `kanban-board`
- Source file: `registry/blocks/kanban-board/kanban-board.tsx`
- Built from: Avatar, Checkbox, Segmented control, Animated counter
- Keywords: kanban, board, drag and drop, swimlanes, wip limit, task board, pipeline, issue tracker

Use this for a team's issue or task board. Load columns, people and cards from your tracker, persist onCardsChange (it receives the full ordered list after every move or edit), and set limit on columns that need WIP limits.

## When to use

- A team board where cards move between statuses.
- Pipelines where ordering within a stage matters.
- Boards that need a per person view.

## When not to use

- Scheduling on dates; use gantt-timeline or week-calendar.
- Read only status summaries; use a table.
- Hundreds of cards per column; virtualize or use customers-table.

## Installation

Kanban board is part of Arc Pro. The live preview is public; the source and install command need Pro.

### CLI with a Pro token

1. Create a token in your account and set it in the environment (or `.env.local`). Never commit it.

```bash
export ARC_PRO_TOKEN=arc_pro_...
```

2. Add the Pro registry to `components.json`:

```json
{
  "registries": {
    "@uiarc": "https://uiarc.dev/r/{name}.json",
    "@uiarc-pro": {
      "url": "https://uiarc.dev/r/pro/{name}.json",
      "headers": {
        "Authorization": "Bearer ${ARC_PRO_TOKEN}"
      }
    }
  }
}
```

3. Install:

```bash
npx shadcn@latest add @uiarc-pro/kanban-board
```

### Manual

Signed-in Pro members can copy the source from the Manual tab on the docs page.

- Plans: https://uiarc.dev/pricing
- Create a Pro token: https://uiarc.dev/account#pro-access
- Setup guide: https://uiarc.dev/docs/ai#pro-access

## Usage

```tsx
import { KanbanBoard } from "@/components/arc/blocks/kanban-board/kanban-board";

export function Sprint({ issues, team }) {
  const [cards, setCards] = useState(issues);
  return (
    <KanbanBoard
      title="Sprint 42"
      columns={[{ id: "todo", name: "To do" }, { id: "doing", name: "Doing", limit: 4 }, { id: "done", name: "Done" }]}
      people={team}
      cards={cards}
      onCardsChange={next => { setCards(next); saveOrder(next); }}
    />
  );
}
```

## API reference

### KanbanBoard

A kanban board with physical drag and drop. The lifted card follows the pointer from where you grabbed it and tilts with speed, a slot opens where it will land, the board scrolls at its edges, and the card springs into the slot on release. Group by assignee for swimlanes, with live WIP limits, quick add and a detail drawer.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `columns` | `KanbanColumn[]` | `sample columns` | Columns in order. Set limit on a column to warn when it holds more cards. |
| `people` | `KanbanPerson[]` | `sample people` | Assignees, used for avatars, swimlanes and the assignee select. |
| `cards` | `KanbanCard[]` | – | Controlled cards in board order. Leave out for uncontrolled use. |
| `defaultCards` | `KanbanCard[]` | `sample cards` | Initial cards when uncontrolled. |
| `onCardsChange` | `(cards: KanbanCard[]) => void` | – | Called with the full ordered list after every move, edit, checklist toggle or new card. |
| `defaultGroupBy` | `"status" \| "assignee"` | `"status"` | Start in columns only or in swimlanes by assignee. |
| `currentUser` | `string` | `first person` | Person id that new cards are assigned to. |
| `title` | `string` | `"Billing v2"` | Board title. |
| `className` | `string` | – | Extra class on the root. |

## Keyboard interactions

| Keys | Action |
| --- | --- |
| Enter | Opens the focused card's details. |
| Space | Lifts the focused card; Space or Enter drops it. |
| Arrow up / down | Moves a lifted card within its column. |
| Arrow left / right | Moves a lifted card to the neighbouring column. |
| Shift + arrow up / down | Moves a lifted card to the neighbouring swimlane. |
| Escape | Cancels a drag and returns the card, or closes the drawer. |

## Accessibility

- Cards are focusable buttons with a draggable role description and a label that includes title, id and assignee.
- Every pick up, move and drop is announced in an assertive live region with the column and position.
- The drawer is a modal dialog: focus moves in, Tab is trapped, Escape closes it and focus returns to the card.
- WIP limits are shown with text as well as color.

## Motion

- The lifted card rides pointer motion values, lifts slightly and tilts on a spring from horizontal velocity.
- Neighbours glide aside with layout springs as the slot moves; on release a small spring chases the slot's live position and carries the throw velocity.
- Switching to swimlanes flies every card to its lane with shared layout ids.
- Reduced motion drops tilt and travel; drops land at once.

## Responsive behavior

- Columns keep a readable minimum width and the board scrolls sideways with snap on phones.
- The drawer covers the board on narrow frames.
- Auto scroll works on both axes when dragging near an edge.

## Performance

- Only the dragged card moves every frame, through transforms; hit testing reads a few rects per move.
- Cards are memoized and use position only layout animation.
- Comfortable up to a few hundred cards.

## Notes for AI

- Choose this for issue boards, sales pipelines, hiring stages or any status workflow with manual ordering.
- Persist onCardsChange: the array order is the order within each column.
- Touch starts a drag after a short press so swipes still scroll the board.
- Use limit on columns for WIP limits; counts update live while dragging.

## Related

- [Project board](https://uiarc.dev/components/blocks/project-board/markdown): A living workflow board for moving work between stages.
- [Week calendar](https://uiarc.dev/components/blocks/week-calendar/markdown): A week calendar where you drag to create, move, and resize events, with color coded calendars, day and agenda views, and swipes on phones.

## Guidance for AI tools

Blocks are complete, self-contained screens with sample data. Replace the sample data and connect the callbacks described above. Follow the declared prop types and do not invent props. Keep keyboard access, reduced motion support, and both light and dark themes intact when adapting it.

Full library index: https://uiarc.dev/llms.txt
