---
name: prompt-cache-economics
description: Optimize prompt systems for cache efficiency, stable prefixes, fork-safe reuse, compact summarization, and instruction budgets. Use when Codex needs to design or audit prompt caching, prompt reuse, compaction prompts, skill listing budgets, or cache-safe agent forks.
---

# Prompt Cache Economics

## Overview

Treat prompt cache as a real systems budget. Anything that changes the prefix, tool set, model parameters, or thinking configuration affects latency and token cost, so cache reuse has to be designed into the architecture from the start.

## Source Anchors

- `src/constants/prompts.ts`
- `src/services/compact/prompt.ts`
- `src/tools/SkillTool/prompt.ts`

## Workflow

1. List every factor that participates in cache keys, such as system prompt prefix, tool set, model, and thinking config.
2. Classify prompt content by stability and keep the most stable material as far forward as possible.
3. Use an explicit boundary to split static and dynamic content so runtime bits do not contaminate the cached prefix.
4. Design summary, compact, and forked-agent prompts for cache-safe reuse, including text-only and no-tools modes where needed.
5. Put hard budgets on skill listings, tool descriptions, and server instructions so discovery text does not consume the main task budget.
6. Move late-changing data such as MCP connection state or experimental deltas into uncached tails or delta attachments.
7. When forks must share cache, keep tools, model, and thinking parameters exactly aligned with the parent request.
8. Keep summary scratchpads disposable and only persist the actual summary content back into context.

## Design Rules

- Favor a stable static prefix and a narrow dynamic tail.
- For summary agents, forbid tool calls when a single wasted turn would destroy the benefit of cache reuse.
- Trim discovery text aggressively and keep only the signal that improves matching.
- Preserve exact parent request shape only when the cache payoff is worth the loss of flexibility.
- Turn late-arriving external state into incremental updates rather than whole-prompt rebuilds.
- Record why each cache miss happens so optimization work stays targeted.

## Failure Modes

- Reading session type, language, or MCP connection state while building the supposedly static prefix.
- Letting a summary prompt retain tool-call freedom and losing its only turn to a denied tool.
- Allowing skill descriptions to grow without budget limits.
- Changing tools or thinking config in a fork that was supposed to share cache with its parent.
- Recomputing information that could have been attached incrementally.

## Output

- Produce a cache surface map that lists all variables capable of busting reuse.
- Produce a stable prefix contract that says which request fields must match across forks and compact paths.
- Produce a prompt budget policy for skill listings, MCP instructions, and summary prompts.
