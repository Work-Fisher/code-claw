---
name: tool-runtime-pipeline
description: Design, review, or debug tool execution runtimes with input validation, hook integration, permission resolution, telemetry, structured results, and failure handling. Use when Codex needs to build or audit tool call pipelines, tool runners, tool middleware, or execution orchestration code.
---

# Tool Runtime Pipeline

## Overview

Model a tool call as a full runtime chain: resolve the tool, validate input, run pre-hooks, resolve permissions, execute the tool, map results, run post-hooks, and handle failures. No stage should silently bend the protocol.

## Source Anchors

- `src/services/tools/toolExecution.ts`
- `src/services/tools/toolHooks.ts`

## Workflow

1. Resolve tool identity and attach MCP server metadata, safe logging fields, and telemetry context.
2. Validate input before execution and map schema errors into a stable user-facing and telemetry-safe form.
3. Run `PreToolUse` hooks so hooks can add context, modify input, request allow or ask or deny, or stop continuation.
4. Merge hook output with the base permission system, but never let hooks bypass rule-based deny or ask decisions or safety checks.
5. Execute the tool only after permission passes, and record duration, result, and classified error details.
6. Normalize tool output into transcript-consumable blocks so builtin tools and MCP tools share one exit shape.
7. Run `PostToolUse` and `PostToolUseFailure` hooks so governance logic stays separate from tool implementation.
8. Classify aborts, auth failures, timeouts, input errors, and tool errors separately so retry logic stays correct.

## Design Rules

- Make permission resolution an explicit stage, not a side effect inside tool code.
- Treat hooks as a governance layer, not as a privileged execution layer.
- Clone or backfill input carefully so corrected input can flow through without destabilizing transcripts or cache keys.
- Use telemetry-safe error names instead of relying on minified constructor names.
- Allow MCP output mutation only through controlled fields such as `updatedMCPToolOutput`.
- Return structured error results when execution is denied so the model learns that the call was blocked, not lost.

## Failure Modes

- Treating hook allow as unconditional allow and bypassing settings-based deny rules.
- Reusing one generic error message for schema errors and runtime errors.
- Letting different tools emit incompatible result shapes that downstream code cannot normalize.
- Skipping failure hooks and losing the governance layer during the exact moments it matters most.
- Reporting MCP auth failure without updating connection state, causing repeated broken calls.

## Output

- Produce a phase diagram covering validation, pre-hook, permission, execution, post-hook, and failure handling.
- Produce an error taxonomy with user messaging, telemetry labels, and retry policy for each class.
- Produce merge rules that say exactly which hook decisions can influence permissions and which cannot.
