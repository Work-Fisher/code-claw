---
name: hook-governance-layer
description: Design, review, or extend hook-based governance layers for tool runtimes with pre and post hooks, permission mediation, continuation control, additional context injection, and non-fatal hook errors. Use when Codex needs to build or audit hook systems, policy middleware, or execution governance around tools.
---

# Hook Governance Layer

## Overview

Design hooks as a governance layer, not as the execution layer itself. Hooks should inject policy, add context, modify MCP output, or stop continuation without corrupting the underlying tool protocol.

## Source Anchors

- `src/services/tools/toolHooks.ts`
- `src/services/tools/toolExecution.ts`

## Workflow

1. Define the lifecycle events first: `PreToolUse`, `PostToolUse`, and `PostToolUseFailure`.
2. For each event, define the allowed result fields such as `updatedInput`, `permissionBehavior`, `additionalContexts`, `blockingError`, `preventContinuation`, and `updatedMCPToolOutput`.
3. Resolve pre-hook permission results through the base permission system so hook allow does not bypass rule-based deny or ask decisions.
4. Normalize post-hook side effects into separate channels for messages, blocking, added context, continuation control, and MCP output changes.
5. Treat hook cancellation and hook error as visible but non-fatal events unless product policy explicitly requires fail-closed behavior.
6. Measure wall-clock hook time so "the system feels stuck" can be diagnosed accurately.

## Design Rules

- Keep the hook contract strongly typed instead of encoding control semantics in free text.
- Deduplicate blocking output so one policy decision does not render twice in the UI.
- Allow `updatedMCPToolOutput` only for MCP tools.
- Let hooks add context, but do not let them silently redefine the base execution protocol.
- Model continuation control with a dedicated signal instead of overloading deny behavior.
- Make hook errors observable without turning the governance layer into a single point of failure.

## Failure Modes

- Treating hook allow as final allow and bypassing core permission rules.
- Emitting both `blockingError` and `hook_blocking_error` for the same event.
- Letting hook exceptions kill the whole tool pipeline.
- Giving non-MCP tools the ability to rewrite output through MCP-specific pathways.
- Leaving continuation behavior implicit and forcing callers to guess from text.

## Output

- Produce a hook contract matrix for each lifecycle event.
- Produce governance merge rules that define how hooks interact with the permission system.
- Produce a non-fatal error policy that says which hook failures block and which only inform.
