---
name: mcp-integration-plane
description: Design, review, or debug MCP integration layers with multi-transport connectivity, auth lifecycle handling, tool and resource discovery, output persistence, session-expiry recovery, and elicitation support. Use when Codex needs to build or audit MCP clients, connector planes, or external tool integration systems.
---

# MCP Integration Plane

## Overview

Treat MCP as an external capability bus, not as a thin RPC wrapper. It has to manage connection types, auth, discovery, timeouts, progress, oversized output, session expiry, and user elicitation without destabilizing the main agent loop.

## Source Anchors

- `src/services/mcp/client.ts`
- `src/services/mcp/config.ts`
- `src/services/mcp/elicitationHandler.ts`

## Workflow

1. Normalize server configuration first and distinguish stdio, SSE, HTTP, WebSocket, IDE, and proxy-style transports.
2. Build the correct auth provider, headers, proxy behavior, and timeout strategy for each transport type.
3. Convert remote auth failures into explicit `needs-auth` state instead of generic connection errors.
4. Memoize connections and cache tool, resource, and command discovery with bounded LRU behavior.
5. Sanitize Unicode, trim oversized descriptions, and preserve tool annotations such as read-only and destructive hints during discovery.
6. Run MCP tool calls with progress reporting, hard timeouts, preserved `_meta`, and large-result persistence.
7. Let hooks or users resolve URL elicitations and retry the tool call only after the elicitation has completed.
8. Handle 401, 404, and session-expired paths with targeted recovery such as cache clearing, reconnection, or token refresh.
9. In cleanup, close transports, stop process monitoring, and unregister all cleanup handlers.

## Design Rules

- Create a fresh timeout for each request instead of reusing one stale abort signal.
- Do not apply normal request timeouts to long-lived SSE subscription streams.
- Log only redacted and query-stripped base URLs.
- Turn oversized output into persisted references or truncated guidance, not raw prompt inflation.
- Distinguish auth failure, transport closure, and session expiry because the recovery path differs for each.
- Treat MCP tool metadata as a shared input for permissions, UI, context collapse, and search behavior.

## Failure Modes

- One expired token causes a wave of 401s and then gets cached as prolonged unavailability.
- A connection-scoped timeout is reused until every later request fails instantly.
- Session-expired 404 responses are treated as generic network failures.
- Generated tool descriptions flood the context window because no cap exists.
- Large MCP responses are injected into the transcript without persistence or truncation.

## Output

- Produce a transport matrix covering auth, timeout, and cleanup behavior.
- Produce a recovery policy for needs-auth, session expiry, timeout, and connection loss.
- Produce an output policy that defines when to truncate, when to persist, and when to preserve `_meta`.
