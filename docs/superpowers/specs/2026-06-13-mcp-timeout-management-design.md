# MCP Timeout Management and Loading Improvements

## Problem Statement

Many MCP servers are timing out during Kimi session startup. The current implementation in `packages/agent-core/src/mcp/connection-manager.ts` has two major bottlenecks:

1. **Global blocking gate.** `connectAll()` starts all servers in parallel and waits for every one of them to settle before resolving. A single slow server stalls `waitForInitialLoad()`, which blocks every turn loop and memory sync.
2. **No retry on transient failures.** If a server times out because of a spawn race, CPU contention, or a brief HTTP flap, it is immediately marked `failed`. The user must manually reconnect via `/mcp-config reconnect`.

## Goals

- Session startup must not block on slow or failing MCP servers; ready servers should be usable immediately.
- Transient startup failures must be retried automatically with exponential backoff.
- Tool registration must remain dynamic as servers connect in the background.
- Keep the change localized to `McpConnectionManager`; avoid new services or large refactors.

## Non-Goals

- New CLI subcommands for MCP management.
- Periodic health checks / keepalive after a server has connected.
- Connection pooling or caching tool lists across sessions.
- Changes to the MCP SDK, stdio/http transports, OAuth flow, or `ToolManager`.

## Approach

Adopt **Approach A: background loading + retries in the existing connection manager**.

`connectAll()` becomes a non-blocking kickoff. Each server connects independently with retries. The turn loop and memory sync wait only for a short readiness budget (5s) or the first available servers, while full startup metrics continue to wait for complete settlement.

## Architecture Changes

### `McpConnectionManager`

1. **Non-blocking `connectAll()`**
   - Sets up `InternalEntry` objects, emits `pending`, and schedules connections in the background.
   - Returns a promise that resolves once the startup phase is "sufficiently complete" (see Startup Readiness Semantics).
   - Maintains two internal promises:
     - `initialLoadReady`: resolves after the readiness budget or when all servers are settled.
     - `initialLoadSettled`: resolves only after every server has reached a terminal state and retries are exhausted.

2. **Per-server retry loop (`connectOneWithRetry`)**
   - Wraps the existing `connectOne()` with exponential backoff.
   - Retries only on timeout and transient transport errors.
   - Does not retry auth errors (401 → `needs-auth`), config errors, or disabled servers.
   - Backoff: `delay = retryDelayMs * 2^attempt` with full jitter, capped at 30s.
   - Defaults: `maxRetries = 3`, `retryDelayMs = 1000`.

3. **Stdio concurrency limit**
   - Limit in-flight stdio spawns to 4 by default to reduce CPU/disk contention.
   - HTTP servers continue to start in parallel because they do not spawn local processes.

4. **Entry retry state**
   - Add `retryCount`, `nextRetryAt`, and `backoffMs` to `InternalEntry`.
   - `reconnect(name)` resets retry state and starts a fresh `connectOneWithRetry()`.

5. **Preserved APIs**
   - `onStatusChange`, `list`, `get`, `resolved`, and the `McpServerEntry` shape remain unchanged so `ToolManager`, TUI, and RPC keep working.

## Startup Readiness Semantics

`waitForInitialLoad()` gains an options overload:

```ts
interface WaitForInitialLoadOptions {
  /** Return early after this many milliseconds if at least one server is connected. */
  readyTimeoutMs?: number;
  /** Return early once this many servers are connected. */
  minReadyCount?: number;
  signal?: AbortSignal;
}

// Backward-compatible overload for existing callers.
waitForInitialLoad(signal?: AbortSignal): Promise<void>;
waitForInitialLoad(options: WaitForInitialLoadOptions): Promise<void>;
```

Rules:

1. With no arguments, `waitForInitialLoad()` waits for `initialLoadSettled` (full settlement, including retries). This preserves backward compatibility for RPC metrics.
2. With `{ readyTimeoutMs: 5000 }`, it waits for `initialLoadReady`: resolves after 5 seconds if at least one server is connected, or earlier if all servers settle first.
3. With `{ minReadyCount: 2 }`, it resolves once two servers are connected.
4. If zero servers are configured or all are disabled, it resolves immediately.

### Callers to update

- `packages/agent-core/src/agent/turn/index.ts` `runStepLoop()`: use `waitForInitialLoad({ readyTimeoutMs: 5000 })`.
- `packages/agent-core/src/session/index.ts` `syncMcpMemories()`: use `waitForInitialLoad({ readyTimeoutMs: 5000 })`.
- `packages/agent-core/src/session/rpc.ts` `getMcpStartupMetrics()`: keep `waitForInitialLoad()` with no args so it reports full startup duration.

## Retry and Error Handling

- **Retryable errors:** timeout, spawn transient errors (`EAGAIN`, etc.), HTTP 5xx, SSE reconnect exhaustion.
- **Non-retryable errors:** `UnauthorizedError` / 401 → `needs-auth`, config validation errors, missing command/env.
- After max retries, the entry becomes `failed` and the last error is preserved.
- `McpStatusListener` receives each transition so the TUI and `ToolManager` update live.
- Unexpected close after a successful connection still marks `failed` immediately without retry; the user can reconnect manually.

## Config Additions

Extend `McpServerConfigSchema` in `packages/agent-core/src/config/schema.ts`:

```ts
maxRetries: z.number().int().min(0).max(10).optional(),
retryDelayMs: z.number().int().min(100).optional(),
// startupTimeoutMs already exists
```

Defaults are applied in `McpConnectionManager` so existing configs continue to work.

## Observability

- Log each retry attempt at `warn` level with server name, attempt number, next delay, and reason.
- Keep existing error logging for `failed` and `needs-auth` statuses.

## Testing Plan

Add unit tests for `McpConnectionManager` in `packages/agent-core/src/mcp/connection-manager.test.ts` using a fake `MCPClient`:

1. Slow server: resolves after the readiness budget. Session proceeds, and the server later connects and registers tools.
2. Failing server: retries 3 times with backoff, then marks `failed`.
3. Concurrency limit: only 4 stdio clients are in-flight at once.
4. Backward compatibility: `waitForInitialLoad()` with no arguments waits for full settlement.
5. Auth error: immediately becomes `needs-auth` without retries.

Existing stdio/http client tests remain unchanged.

## Files to Change

- `packages/agent-core/src/mcp/connection-manager.ts` — main implementation.
- `packages/agent-core/src/config/schema.ts` — add `maxRetries` and `retryDelayMs` to `McpServerConfigSchema`.
- `packages/agent-core/src/agent/turn/index.ts` — use `waitForInitialLoad({ readyTimeoutMs: 5000 })`.
- `packages/agent-core/src/session/index.ts` — use `waitForInitialLoad({ readyTimeoutMs: 5000 })`.
- `packages/agent-core/src/mcp/connection-manager.test.ts` — new tests.

## Risks

- **Background retries may delay visibility of permanent failures.** A misconfigured server will retry 3 times before showing `failed`. This is acceptable because the session can start using other servers.
- **Turn loop may start before all desired tools are available.** The model may need to issue a follow-up turn once slow servers connect. This is expected and preferable to hanging.
- **Memory sync may start before the memory MCP server is ready.** With the 5s readiness budget, most local servers will already be connected; remote/memory servers continue loading in background.
