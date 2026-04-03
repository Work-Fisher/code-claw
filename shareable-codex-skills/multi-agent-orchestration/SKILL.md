---
name: multi-agent-orchestration
description: Design, review, or operate multi-agent systems with role-specialized workers, scoped permissions, forked context, skill preloading, additive MCP connections, and explicit cleanup. Use when Codex needs to build or audit agent swarms, subagent delegation, worker roles, or cooperative task execution pipelines.
---

# Multi-Agent Orchestration

## Overview

Treat a multi-agent system as a constrained production system, not as a loose collection of helpers. Define role contracts, context shape, permissions, tools, MCP access, records, and cleanup before any agent starts working.

## Source Anchors

- `src/tools/AgentTool/`
- `src/tools/AgentTool/runAgent.ts`
- `src/tools/AgentTool/built-in/`

## Workflow

1. Decide which work must stay on the main critical path and which work can be delegated.
2. Write an explicit contract for each agent type: goal, allowed tools, default model, async or sync behavior, and permission strategy.
3. Choose a context strategy for each agent: full fork, slim fork, or task-only prompt.
4. Scope permissions so parent session grants do not leak into child agents by accident.
5. Preload the right skills, frontmatter hooks, and agent-specific MCP servers before execution starts.
6. Record transcripts, metadata, parent-child hierarchy, and progress messages so runs stay auditable and resumable.
7. Define stop conditions such as `maxTurns`, abort propagation, and completion callbacks.
8. In `finally`, clean up MCP clients, session hooks, prompt-cache tracking, file state, and orphaned todo entries.

## Design Rules

- Keep final responsibility on the main agent. Delegation does not delegate accountability.
- Separate sync collaboration from async background work because permission behavior differs.
- Treat agent-specific MCP as additive, and only clean up the connections created for that agent.
- Drop irrelevant inherited context for read-only agents such as stale git state or large policy files they do not need.
- Persist enough metadata for resume paths to reconstruct the correct agent shape.
- Treat skill preloading as part of startup, not as an optional convenience.

## Failure Modes

- Delegating blocking critical-path work and leaving the main agent idle.
- Letting child agents inherit allow rules that were never intended for them.
- Running async agents on an interactive permission path they cannot complete.
- Failing to record sidechain transcripts and then losing resume continuity.
- Skipping cleanup and leaving behind live MCP connections or leaked state.

## Output

- Produce an agent matrix with role, permissions, tools, model, and exit conditions.
- Produce a delegation policy that says when to stay local, when to delegate, and when to parallelize.
- Produce a lifecycle checklist that covers spawn, progress, resume, abort, and cleanup.
