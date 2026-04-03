---
name: skill-workflow-packaging
description: Package reusable workflows as discoverable skills with command metadata, invocation contracts, char-budgeted listings, forked execution, and MCP-sourced skill merging. Use when Codex needs to create or audit skill systems, slash-command skills, or workflow packaging for reusable agent capabilities.
---

# Skill Workflow Packaging

## Overview

Treat a skill as a controlled workflow package, not just a markdown document. It must be discoverable, triggerable, budgeted for listing, isolatable when needed, and clearly represented in the transcript.

## Source Anchors

- `src/tools/SkillTool/SkillTool.ts`
- `src/tools/SkillTool/prompt.ts`

## Workflow

1. Define the command identity first: name, description, `whenToUse`, aliases, and whether users can invoke it directly.
2. Put hard limits on listing text so skill discovery remains cheap enough to keep in the main prompt.
3. Make skill invocation a blocking requirement when the request clearly matches a skill.
4. Merge local skills and MCP skills carefully, but filter out plain MCP prompts that are not actually skills.
5. Choose between inline and forked execution based on isolation, token budget, and workflow complexity.
6. For forked skills, prepare context explicitly, stream progress, and record results back into the transcript.
7. Track usage, discovery source, and execution context so ranking and recommendation can improve later.
8. Prevent duplicate invocation when the skill is already loaded or already running.

## Design Rules

- Write `whenToUse` as high-signal trigger language, not as generic marketing copy.
- Prefer short listing descriptions that preserve match quality over long descriptions that waste turn-zero budget.
- Keep invocation semantics explicit so the model does not mention a skill without calling it.
- Give forked skills their own token budget and message collection so they do not contaminate the main reasoning path.
- Preserve namespaces for plugin and marketplace skills to avoid collisions.
- Add transcript markers when a skill is injected so recursive re-entry can be blocked cleanly.

## Failure Modes

- Writing a vague `whenToUse` that never reliably triggers.
- Letting skill descriptions grow until the listing costs more than the task itself.
- Mentioning a skill in prose but never invoking the Skill tool.
- Exposing raw MCP prompts as if they were skills.
- Running a forked skill without progress or result reporting, leaving the caller in a black box.

## Output

- Produce a skill command contract with name, description, `whenToUse`, and execution mode.
- Produce a listing budget policy that explains truncation and ordering.
- Produce fork criteria that say when a skill should run inline and when it should run in an isolated subagent.
