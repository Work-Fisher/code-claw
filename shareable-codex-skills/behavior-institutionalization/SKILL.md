---
name: behavior-institutionalization
description: Encode desired agent behavior into durable prompt policy using concrete do and dont rules, escalation triggers, communication constraints, and reporting standards. Use when Codex needs to design or audit system prompts, agent constitutions, collaboration rules, or behavior control layers.
---

# Behavior Institutionalization

## Overview

Translate desired behavior into enforceable operating policy, not vague virtues. Good behavioral control turns recurring failure patterns such as false certainty, scope creep, or misleading reporting into explicit rules with triggers and boundaries.

## Source Anchors

- `src/constants/prompts.ts`
- `getSimpleDoingTasksSection()`
- `getActionsSection()`
- `getOutputEfficiencySection()`
- `getSimpleToneAndStyleSection()`

## Workflow

1. Start from the model's recurring failures, not from aspirational values.
2. Rewrite each failure mode into concrete do or dont rules such as "do not claim tests passed unless you ran them."
3. Split rules into layers: task execution, risky actions, user communication, format constraints, and truthful reporting.
4. Attach explicit escalation triggers for destructive or shared-state actions.
5. Turn honesty into an operating requirement with exact reporting rules rather than a vague principle.
6. Keep style constraints separate from task rules so tone does not pollute execution policy.
7. Regularly prune stale or conflicting rules so the constitution stays coherent.

## Design Rules

- Prefer observable behavior over abstract traits.
- Attach activation conditions so each rule has a clear scope.
- Add anti-cheating clauses for high-frequency model failures such as hedging finished work or disguising unverified outcomes.
- Pair positive requirements with explicit boundaries and counterexamples.
- Keep user-visible communication rules separate from internal execution rules.
- Make "when to ask the user" and "when to proceed autonomously" explicit policy choices.

## Failure Modes

- Writing rules like "be professional" that have no operational meaning.
- Hiding trigger information in the body instead of the frontmatter description.
- Mixing "be extremely concise" and "explain thoroughly" without defining when each applies.
- Policing tone while ignoring false reports, omissions, and unsafe autonomy.
- Adding new rules forever and never removing outdated ones.

## Output

- Produce a behavior constitution that covers truthfulness, collaboration, escalation, format, and verification.
- Produce a failure-pattern to rule map that explains what each rule is preventing.
- Produce a conflict checklist that tests whether new rules override old safeguards.
