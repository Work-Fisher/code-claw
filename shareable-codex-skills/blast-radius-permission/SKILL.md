---
name: blast-radius-permission
description: Design or audit permission systems that combine rule-based allow ask deny logic, safety checks, auto-mode classifiers, dangerous-rule stripping, and blast-radius-aware user confirmation. Use when Codex needs to build or review tool permission layers, approval workflows, or risk-scoped execution policies.
---

# Blast Radius Permission

## Overview

A permission system is not just a yes-or-no gate. It is a layered judgment about who bears the risk, how wide the action's blast radius is, and which safeguards must remain active even in autonomous modes.

## Source Anchors

- `src/utils/permissions/permissions.ts`
- `src/utils/permissions/permissionSetup.ts`
- `src/components/permissions/`

## Workflow

1. Gather every rule source first: user settings, project settings, local settings, session rules, and CLI grants.
2. Evaluate rule-based deny and ask decisions before tool-specific permission checks.
3. Treat content-specific ask rules and safety checks as bypass-immune so fast modes cannot skip them.
4. Apply mode behavior next, including bypass, accept-edits, plan, and auto.
5. Before entering auto mode, strip dangerous allow rules such as `Bash(*)`, `PowerShell(iex:*)`, or `Agent(*)` that would bypass the classifier.
6. Let safely sandboxed commands use the sandbox fast path and route the rest through classifier or explicit user approval.
7. Track classifier source, reason, cost, and repeated denials so the system can fail closed or fall back to prompting in a controlled way.
8. Model permission persistence explicitly so temporary session grants and durable on-disk grants do not get confused.

## Design Rules

- Ask who is affected before asking whether the command can technically run.
- Preserve source metadata for every allow, ask, and deny decision so behavior is explainable.
- Treat broad shell and subagent allow rules as especially dangerous because they disable later safety evaluation.
- Keep a human gate for high-blast-radius actions even in automated modes.
- Make UI confirmation language and backend permission logic agree.
- Restore stripped dangerous rules when leaving auto mode so user configuration is not silently lost.

## Failure Modes

- Treating tool-level allow as harmless and accidentally creating hidden YOLO mode.
- Letting bypass mode skip content-specific ask rules and safety checks.
- Entering auto mode without first stripping dangerous allow rules.
- Updating permissions only in memory and then surprising the user on the next turn.
- Returning opaque denials that neither users nor developers can explain.

## Output

- Produce a decision ladder that lists rule, tool check, mode, classifier, and prompt stages in order.
- Produce a dangerous-rule catalog that explains which grants enlarge blast radius.
- Produce a persistence policy that distinguishes temporary grants from durable grants.
