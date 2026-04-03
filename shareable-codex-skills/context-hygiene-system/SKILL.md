---
name: context-hygiene-system
description: Keep long-running agent conversations healthy with attachment filtering, tool-result budgeting, snip and microcompact passes, context collapse, autocompact, reactive recovery, and queued-command hygiene. Use when Codex needs to build or audit long-context runtime loops, compaction systems, or context management pipelines.
---

# Context Hygiene System

## Overview

Context hygiene is more than summarizing when the window gets full. It is a continuous cleaning system that budgets tool output, trims redundant history, compacts strategically, recovers from overflow, and keeps attachments plus queued commands in a stable order.

## Source Anchors

- `src/query.ts`
- `src/services/compact/`
- `src/services/contextCollapse/`

## Workflow

1. Start each turn with memory and skill-discovery prefetch so waiting time is hidden behind model streaming.
2. Apply tool-result budgets early and replace oversized results with persisted references when needed.
3. Run snip, microcompact, context collapse, and autocompact in a deliberate order instead of mixing them freely.
4. When compaction succeeds, rebuild task budget tracking, turn tracking, and post-compact messages from the new state.
5. Withhold prompt-too-long, media overflow, and max-output errors until recovery paths have been attempted.
6. Use context-collapse drains and reactive compaction as structured recovery steps before surfacing failure upstream.
7. At the end of the turn, collect tool-use summaries, memory attachments, skill attachments, and queued commands while deduplicating them.
8. Refresh the tool pool after the turn if capabilities changed so the next iteration sees the right tool surface.

## Design Rules

- Prefer preserving recent high-granularity context over collapsing everything into one coarse summary.
- Give each compaction layer a distinct job: snip removes redundancy, microcompact shrinks locally, collapse projects a lighter view, and autocompact summarizes globally.
- Treat recovery paths as a state machine so intermediate errors are not leaked too early.
- Keep task-budget accounting continuous across compaction boundaries.
- Snapshot attachments and queued commands so same-turn mutations do not create race conditions.
- Allow summary prompts to use disposable analysis blocks while only the summary content returns to context.

## Failure Modes

- Surfacing an intermediate error before recovery has been attempted.
- Reusing stale token counts after compaction and making the next turn's decisions wrong.
- Letting large tool results flood the prompt without early budgeting.
- Running compaction layers in the wrong order and losing detail that cheaper mechanisms could have preserved.
- Reading queued commands live instead of from a snapshot and creating racey turn behavior.

## Output

- Produce a context pipeline diagram that shows every hygiene pass before model sampling.
- Produce a recovery ladder for overflow, 413, and max-output conditions.
- Produce an attachment and queue policy that defines what enters context, what is delayed, and what is deduplicated.
