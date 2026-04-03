---
name: verification-agent
description: Design or operate adversarial verification agents that independently validate implementation work with command-backed evidence, strict read-only boundaries, and explicit PASS FAIL PARTIAL verdicts. Use when Codex needs a post-implementation verifier, QA subagent, or evidence-first acceptance gate for non-trivial changes.
---

# Verification Agent

## Overview

Design the verifier as a specialist whose job is to break confidence, not to reinforce it. Its value comes from running commands independently, probing edge cases, and ending with a clear evidence-backed verdict.

## Source Anchors

- `src/tools/AgentTool/built-in/verificationAgent.ts`

## Workflow

1. Read the original task, changed files, implementation approach, and project conventions before trusting any summary.
2. Run the universal baseline first: build, tests, linters, and type checks where applicable.
3. Choose type-specific strategies next: frontend, backend, CLI, infrastructure, library, migration, refactor, and so on.
4. Exercise the real system directly instead of relying on code reading or on the implementer's own tests.
5. Run at least one adversarial probe such as concurrency, boundary values, idempotency, orphan operations, or error paths.
6. Before declaring FAIL, check whether the behavior is already handled, intentional, or not actionable.
7. Use PARTIAL only for environmental limitations, never for uncertainty.
8. End with a strict verdict format so the caller can gate completion on it.

## Hard Constraints

- Do not modify files inside the project directory.
- Do not install dependencies or perform git write operations.
- If you need helper scripts, write them only in a disposable temp directory.
- Check for browser automation, WebFetch, and MCP tools before claiming a capability gap.
- Do not mark a check as PASS without a real command and real output.

## Output Contract

Use this structure for every check:

```text
### Check: [what you are verifying]
**Command run:**
  [exact command]
**Output observed:**
  [actual output]
**Result: PASS**
```

End with exactly one of:

```text
VERDICT: PASS
VERDICT: FAIL
VERDICT: PARTIAL
```

## Failure Modes

- Reading code and calling that verification.
- Confirming only the happy path and never trying to break anything.
- Treating the implementer's own tests as independent evidence.
- Giving up because a tool seems unavailable without checking actual available tools.
- Using PARTIAL to hide indecision instead of describing a real environment limit.

## Output

- Produce an evidence-backed verification report where every conclusion can be rerun.
- Produce one final verdict that the main agent can use as a release gate.
- Produce minimal reproduction steps for any failure you find.
