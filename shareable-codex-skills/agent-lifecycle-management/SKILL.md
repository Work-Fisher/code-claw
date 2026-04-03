---
name: agent-lifecycle-management
description: Manage agent runtime lifecycles from spawn through context fork, permission shaping, transcript recording, progress streaming, and deterministic cleanup. Use when Codex needs to implement or audit agent spawning, resume support, background workers, or subagent runtime scaffolding.
---

# Agent Lifecycle Management

## Overview

Design the agent lifecycle as a full runtime protocol: create, choose model, shape context, assemble tools, start hooks, stream progress, record transcripts, and clean up deterministically. Without all of those stages, subagents become leak sources instead of force multipliers.

## Source Anchors

- `src/tools/AgentTool/runAgent.ts`

## Workflow

1. Assign a stable agent ID and resolve model, working directory, and transcript subdirectory.
2. Fork context carefully and remove incomplete parent tool calls before reuse.
3. Trim inherited context by agent type so read-only agents do not carry large irrelevant state.
4. Construct agent-specific app state for permission mode, allowed tools, prompt behavior, and effort level.
5. Load startup resources such as `SubagentStart` hooks, frontmatter hooks, preloaded skills, and agent-specific MCP servers.
6. Create the subagent context and decide which callbacks and abort controllers are shared versus isolated.
7. Record transcript messages, metadata, progress, and API metrics throughout execution so resume and observability work.
8. In `finally`, tear down MCP clients, hooks, prompt-cache tracking, read-file caches, transcript mappings, and leftover todos.

## Design Rules

- Distinguish orchestration from lifecycle. One decides who to spawn, the other decides how the spawned agent lives and exits.
- Give async agents independent abort controllers by default and sync agents shared control unless there is a reason not to.
- Maintain a root-state write path for nested async agents so they can update shared state safely.
- Preserve tool-use results for agents whose transcripts will be inspected later.
- Persist enough metadata for resume flows to reconstruct the correct agent shape.
- Put all cleanup in `finally` instead of trusting the normal completion path.

## Failure Modes

- Reusing parent messages with incomplete tool calls and triggering API errors immediately.
- Running async agents with permission strategies that still expect interactive dialogs.
- Skipping metadata writes and then failing to resume the right agent type.
- Creating agent-specific MCP connections and never cleaning them up.
- Leaving read-file caches and todo maps alive across many finished subagents.

## Output

- Produce a lifecycle state chart that covers init, run, abort, resume, and cleanup.
- Produce a context-shaping policy that defines what can be inherited and what must be trimmed.
- Produce a cleanup checklist that assigns an owner to every runtime resource.
