---
name: prompt-assembly-architecture
description: Design, review, or refactor prompt assembly systems with static and dynamic prompt boundaries, section registries, cache-aware composition, feature-gated overlays, and session-specific instruction injection. Use when Codex needs to build or audit system prompt pipelines, prompt builders, prompt layering, or instruction composition code.
---

# Prompt Assembly Architecture

## Overview

Treat prompt construction as a pipeline, not as ad hoc string concatenation. Keep a long-lived static prefix stable, inject volatile sections late, and make cache behavior an explicit design concern.

## Source Anchors

- `src/constants/prompts.ts`
- `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`
- `getSessionSpecificGuidanceSection()`
- `getSystemPrompt()`

## Workflow

1. Inventory every prompt ingredient and classify it as stable across sessions or volatile per turn.
2. Keep identity framing, baseline behavior, safety rules, and universal formatting in the static zone.
3. Move language preference, environment details, skill discovery, MCP instructions, memory, scratchpad, and token budget into the dynamic zone.
4. Add an explicit boundary marker so the cache layer, debugging tools, and API layer all split at the same point.
5. Manage dynamic sections through a registry or resolver rather than scattered string appends.
6. Place any runtime feature gate that can change the prefix hash after the boundary, or resolve it lazily.
7. Return prompt sections as an array and join them only at the end so testing, filtering, and diffing stay simple.
8. Assign stable IDs to sections so you can trace regressions, cache misses, and section-level changes.

## Design Rules

- Keep the static prefix as long and as stable as possible.
- Separate identity framing, behavioral policy, and tool guidance instead of letting them overlap.
- Treat runtime variability as a first-class risk source, not as an implementation detail.
- Inject MCP, skills, and experiment-specific instructions late so late connections do not shatter the cached prefix.
- Keep each reusable rule in one place so sections do not drift apart over time.
- Record which inputs each dynamic section depends on so cache misses are explainable.

## Failure Modes

- Reading runtime state while building the static prefix.
- Generating one giant string first and trying to split or trim it later.
- Letting feature gates multiply prompt variants inside the supposedly stable prefix.
- Appending tone or formatting rules from several helpers until they conflict.
- Recomputing MCP or skill instructions on every turn even when nothing changed.

## Output

- Produce a section map with source, stability, and cache ownership for each block.
- Produce a boundary checklist that says which conditions must stay in the dynamic zone.
- Produce a minimal prompt builder that maps config plus environment into section arrays and a final prompt.
