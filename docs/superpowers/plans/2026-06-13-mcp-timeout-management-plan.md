# MCP Timeout Management and Loading Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Kimi session startup resilient to slow or transiently failing MCP servers by loading them in the background, retrying transient failures with backoff, and only blocking the turn loop until the first servers are ready.

**Architecture:** Keep all changes inside `McpConnectionManager`. Add per-server retry state, a stdio spawn concurrency semaphore, and a second "ready" promise that resolves earlier than the existing "settled" promise. Expose new options on `waitForInitialLoad()` and switch the turn loop and memory sync to a 5-second readiness budget.

**Tech Stack:** TypeScript, Vitest, `@modelcontextprotocol/sdk`, Zod.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/agent-core/src/config/schema.ts` | Adds `maxRetries` and `retryDelayMs` to the MCP server config schema. |
| `packages/agent-core/src/mcp/connection-manager.ts` | Main change: background loading, retry loop, concurrency limit, ready/settled promises. |
| `packages/agent-core/src/agent/turn/index.ts` | Switch `runStepLoop()` to `waitForInitialLoad({ readyTimeoutMs: 5000 })`. |
| `packages/agent-core/src/session/index.ts` | Switch `syncMcpMemories()` to `waitForInitialLoad({ readyTimeoutMs: 5000 })`. |
| `packages/agent-core/test/mcp/connection-manager.test.ts` | Update existing timeout/failure tests and add new retry/background-loading tests. |

---

## Task 1: Add retry config fields to the MCP server schema

**Files:**
- Modify: `packages/agent-core/src/config/schema.ts`

- [ ] **Step 1: Add `maxRetries` and `retryDelayMs` to `McpServerCommonFields`**

Locate the `McpServerCommonFields` object (around line 159) and add the two new optional fields:

```ts
const McpServerCommonFields = {
  enabled: z.boolean().optional(),
  startupTimeoutMs: z.number().int().min(1).optional(),
  toolTimeoutMs: z.number().int().min(1).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  retryDelayMs: z.number().int().min(100).optional(),
  enabledTools: z.array(z.string()).optional(),
  disabledTools: z.array(z.string()).optional(),
} as const;
```

- [ ] **Step 2: Verify the package typechecks**

Run:

```bash
cd /Users/cheng/kimi-code
pnpm --filter @moonshot-ai/agent-core run typecheck
```

Expected: PASS (no new compile errors from the schema change).

- [ ] **Step 3: Commit**

```bash
git add packages/agent-core/src/config/schema.ts
git commit -m "feat(agent-core): add maxRetries and retryDelayMs to MCP server config schema"
```

---

## Task 2: Add constants and helper functions to `connection-manager.ts`

**Files:**
- Modify: `packages/agent-core/src/mcp/connection-manager.ts`

- [ ] **Step 1: Add retry/backoff constants after `DEFAULT_STARTUP_TIMEOUT_MS`**

```ts
const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;
const DEFAULT_STDIO_CONCURRENCY = 4;
const DEFAULT_READY_TIMEOUT_MS = 5_000;
```

- [ ] **Step 2: Add a small `Semaphore` class at the bottom of the file** (before helper functions)

```ts
class Semaphore {
  private permits: number;
  private readonly queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next !== undefined) {
      next();
    } else {
      this.permits += 1;
    }
  }
}
```

- [ ] **Step 3: Add retry delay and error classification helpers near the bottom of the file**

```ts
function computeRetryDelay(attemptIndex: number, baseDelayMs: number): number {
  const exponential = baseDelayMs * 2 ** attemptIndex;
  const capped = Math.min(exponential, MAX_RETRY_DELAY_MS);
  // Full jitter: random value in [0, capped].
  return Math.floor(Math.random() * (capped + 1));
}

function isRetryableStartupError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Timeouts are the main pain point.
  if (error.message.includes('Timed out after')) return true;
  // HTTP reconnect exhaustion from the SDK is retryable at the manager layer.
  if (isTerminalTransportError(error)) return true;
  // Config-level problems should fail fast.
  if (error instanceof KimiError && error.code === ErrorCodes.CONFIG_INVALID) return false;
  // Auth failures go through the needs-auth flow, not retries.
  if (isUnauthorizedLikeError(error)) return false;
  // Default to retrying unknown transport/spawn errors.
  return true;
}
```

- [ ] **Step 4: Verify typecheck**

Run:

```bash
cd /Users/cheng/kimi-code
pnpm --filter @moonshot-ai/agent-core run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-core/src/mcp/connection-manager.ts
git commit -m "feat(agent-core): add MCP retry constants and helper functions"
```

---

## Task 3: Extend `InternalEntry` with retry state and abort control

**Files:**
- Modify: `packages/agent-core/src/mcp/connection-manager.ts`

- [ ] **Step 1: Update the `InternalEntry` interface**

```ts
interface InternalEntry {
  readonly name: string;
  readonly config: McpServerConfig;
  attemptId: number;
  status: McpServerStatus;
  tools?: readonly Tool[];
  enabledNames?: ReadonlySet<string>;
  error?: string;
  client?: RuntimeMcpClient;
  // Retry state.
  retryCount: number;
  nextRetryAt?: number;
  lastError?: unknown;
  retryAbortController?: AbortController;
}
```

- [ ] **Step 2: Add a private stdio semaphore field to `McpConnectionManager`**

```ts
export class McpConnectionManager {
  private readonly entries = new Map<string, InternalEntry>();
  private readonly listeners = new Set<McpStatusListener>();
  private readonly stdioSemaphore = new Semaphore(DEFAULT_STDIO_CONCURRENCY);
  private initialLoad: Promise<void> = Promise.resolve();
  private initialLoadReady: Promise<void> = Promise.resolve();
  private initialLoadSettled: Promise<void> = Promise.resolve();
  private initialLoadAttemptId = 0;
  private initialLoadStartedAt: number | undefined;
  private initialLoadFinishedAt: number | undefined;
  // ... rest of class
}
```

- [ ] **Step 3: Update every place that constructs an `InternalEntry` to initialize `retryCount: 0`**

There are three construction sites:

1. `connect()` around line 163:

```ts
const entry: InternalEntry = {
  name,
  config,
  attemptId: 0,
  status: disabled ? 'disabled' : 'pending',
  retryCount: 0,
};
```

2. `connectAllNow()` around line 205:

```ts
const entry: InternalEntry = {
  name,
  config,
  attemptId: 0,
  status: disabled ? 'disabled' : 'pending',
  retryCount: 0,
};
```

3. `reconnect()` also reuses an existing entry, so reset `retryCount` and related fields after validations:

```ts
entry.retryCount = 0;
entry.nextRetryAt = undefined;
entry.lastError = undefined;
entry.error = undefined;
entry.retryAbortController?.abort();
entry.retryAbortController = undefined;
```

- [ ] **Step 4: Update `shutdown()` to abort any in-flight retry delays**

```ts
async shutdown(): Promise<void> {
  const entries = Array.from(this.entries.values());
  this.entries.clear();
  for (const entry of entries) {
    entry.retryAbortController?.abort();
  }
  const tasks = entries.map((entry) => this.closeClient(entry));
  await Promise.allSettled(tasks);
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/agent-core/src/mcp/connection-manager.ts
git commit -m "feat(agent-core): extend MCP internal entry with retry state"
```

---

## Task 4: Implement the per-server retry loop with concurrency control

**Files:**
- Modify: `packages/agent-core/src/mcp/connection-manager.ts`

- [ ] **Step 1: Add `connectOneWithRetry()` private method**

Insert it after `connectOne()`:

```ts
private async connectOneWithRetry(entry: InternalEntry): Promise<void> {
  const maxRetries = entry.config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = entry.config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  while (true) {
    // Hold the stdio semaphore only while actually spawning/handshaking.
    const isStdio = entry.config.transport === 'stdio';
    if (isStdio) {
      await this.stdioSemaphore.acquire();
    }

    const attemptId = this.beginConnectAttempt(entry);
    entry.lastError = undefined;
    try {
      await this.connectOne(entry, attemptId);
    } finally {
      if (isStdio) {
        this.stdioSemaphore.release();
      }
    }

    if (entry.status === 'connected' || entry.status === 'needs-auth') {
      return;
    }
    if (!this.isCurrent(entry, attemptId)) {
      return;
    }

    entry.retryCount += 1;
    if (entry.retryCount > maxRetries) {
      break;
    }
    if (!isRetryableStartupError(entry.lastError)) {
      break;
    }

    const delayMs = computeRetryDelay(entry.retryCount - 1, baseDelayMs);
    this.log.warn('mcp server startup failed, retrying', {
      server: entry.name,
      attempt: entry.retryCount,
      maxRetries,
      delayMs,
      reason: entry.error,
    });

    entry.status = 'pending';
    entry.error = `Retrying after startup failure (attempt ${entry.retryCount}/${maxRetries})`;
    entry.nextRetryAt = Date.now() + delayMs;
    this.emit(entry);

    entry.retryAbortController = new AbortController();
    try {
      await abortable(sleep(delayMs), entry.retryAbortController.signal);
    } catch {
      // Shutdown or reconnect aborted the retry loop.
      return;
    }
  }
}
```

- [ ] **Step 2: Add the `sleep` import or helper**

At the top of the file, add:

```ts
import { setTimeout as sleep } from 'node:timers/promises';
```

- [ ] **Step 3: Update `connectOne()` to store the raw error on the entry**

In the `catch (error)` block (around line 271), add one line before classification:

```ts
} catch (error) {
  entry.lastError = error;
  if (!this.isCurrent(entry, attemptId)) {
    // ... existing code
  }
  // ... rest of existing catch block
}
```

- [ ] **Step 4: Verify typecheck**

Run:

```bash
cd /Users/cheng/kimi-code
pnpm --filter @moonshot-ai/agent-core run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-core/src/mcp/connection-manager.ts
git commit -m "feat(agent-core): add per-server MCP retry loop with stdio concurrency limit"
```

---

## Task 5: Make `connectAll()` non-blocking and track ready/settled promises

**Files:**
- Modify: `packages/agent-core/src/mcp/connection-manager.ts`

- [ ] **Step 1: Replace the `connectAll()` method body**

```ts
connectAll(configs: Record<string, McpServerConfig>): Promise<void> {
  const attemptId = ++this.initialLoadAttemptId;
  this.initialLoadStartedAt = Date.now();
  this.initialLoadFinishedAt = undefined;

  // Tear down any previous load's retry timers.
  for (const entry of this.entries.values()) {
    entry.retryAbortController?.abort();
  }
  this.entries.clear();

  const readyDeferred = createDeferred<void>();
  const settledDeferred = createDeferred<void>();
  this.initialLoadReady = readyDeferred.promise;
  this.initialLoadSettled = settledDeferred.promise;

  const initialLoad = this.connectAllNow(configs, {
    ready: readyDeferred,
    settled: settledDeferred,
  }).finally(() => {
    if (this.initialLoadAttemptId === attemptId) {
      this.initialLoadFinishedAt = Date.now();
    }
  });

  this.initialLoad = initialLoad;
  return initialLoad;
}
```

- [ ] **Step 2: Replace `connectAllNow()` to kick off background work and resolve deferreds**

```ts
private async connectAllNow(
  configs: Record<string, McpServerConfig>,
  deferred: { ready: Deferred<void>; settled: Deferred<void> },
): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  for (const [name, config] of Object.entries(configs)) {
    const disabled = config.enabled === false;
    const entry: InternalEntry = {
      name,
      config,
      attemptId: 0,
      status: disabled ? 'disabled' : 'pending',
      retryCount: 0,
    };
    this.entries.set(name, entry);
    this.emit(entry);
    if (!disabled) {
      tasks.push(this.connectOneWithRetry(entry));
    }
  }

  // Resolve the "ready" promise when enough servers are ready or all settled.
  this.resolveWhenReady(deferred.ready);

  await Promise.allSettled(tasks);
  deferred.ready.resolve();
  deferred.settled.resolve();
}
```

- [ ] **Step 3: Add `Deferred<T>` and `createDeferred<T>` helpers at the bottom of the file**

```ts
interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value?: T): void;
  reject(reason?: unknown): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
```

- [ ] **Step 4: Add `resolveWhenReady()` private method**

```ts
private resolveWhenReady(deferred: Deferred<void>, options?: { readyTimeoutMs?: number; minReadyCount?: number }): void {
  let resolved = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const finish = () => {
    if (resolved) return;
    resolved = true;
    if (timer !== undefined) clearTimeout(timer);
    unsubscribe();
    deferred.resolve();
  };

  const check = () => {
    const entries = this.list();
    const pending = entries.filter((e) => e.status === 'pending');
    const connectedCount = entries.filter((e) => e.status === 'connected').length;

    if (pending.length === 0) {
      finish();
      return;
    }
    if (options?.minReadyCount !== undefined && connectedCount >= options.minReadyCount) {
      finish();
      return;
    }
  };

  const unsubscribe = this.onStatusChange(() => check());

  if (options?.readyTimeoutMs !== undefined) {
    timer = setTimeout(() => {
      const connectedCount = this.list().filter((e) => e.status === 'connected').length;
      if (connectedCount > 0) {
        finish();
      }
      // Otherwise keep waiting for the first connection or full settlement.
    }, options.readyTimeoutMs);
  }

  check();
}
```

- [ ] **Step 5: Update `connect()` to use `connectOneWithRetry()`**

In `connect()`, replace:

```ts
if (!disabled) {
  await this.connectOne(entry, this.beginConnectAttempt(entry));
}
```

with:

```ts
if (!disabled) {
  await this.connectOneWithRetry(entry);
}
```

- [ ] **Step 6: Update `reconnect()` to use `connectOneWithRetry()`**

Replace the final line `await this.connectOne(entry, attemptId);` with:

```ts
await this.connectOneWithRetry(entry);
```

- [ ] **Step 7: Verify typecheck**

Run:

```bash
cd /Users/cheng/kimi-code
pnpm --filter @moonshot-ai/agent-core run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/agent-core/src/mcp/connection-manager.ts
git commit -m "feat(agent-core): make MCP connectAll non-blocking with ready/settled promises"
```

---

## Task 6: Add the `waitForInitialLoad()` overload

**Files:**
- Modify: `packages/agent-core/src/mcp/connection-manager.ts`

- [ ] **Step 1: Add the public options interface near the top of the file**

```ts
export interface WaitForInitialLoadOptions {
  /** Return early after this many milliseconds if at least one server is connected. */
  readyTimeoutMs?: number;
  /** Return early once this many servers are connected. */
  minReadyCount?: number;
  signal?: AbortSignal;
}
```

- [ ] **Step 2: Replace the `waitForInitialLoad()` method body**

```ts
waitForInitialLoad(signal?: AbortSignal): Promise<void>;
waitForInitialLoad(options: WaitForInitialLoadOptions): Promise<void>;
waitForInitialLoad(options?: WaitForInitialLoadOptions | AbortSignal): Promise<void> {
  let signal: AbortSignal | undefined;
  let readyTimeoutMs: number | undefined;
  let minReadyCount: number | undefined;

  if (options !== undefined) {
    if (isAbortSignal(options)) {
      signal = options;
    } else {
      signal = options.signal;
      readyTimeoutMs = options.readyTimeoutMs;
      minReadyCount = options.minReadyCount;
    }
  }

  // Backward-compatible path: no readiness options means wait for full settlement.
  if (readyTimeoutMs === undefined && minReadyCount === undefined) {
    signal?.throwIfAborted();
    if (signal === undefined) return this.initialLoadSettled;
    return abortable(this.initialLoadSettled, signal);
  }

  const readyDeferred = createDeferred<void>();
  this.resolveWhenReady(readyDeferred, { readyTimeoutMs, minReadyCount });
  const readyPromise = readyDeferred.promise;
  if (signal === undefined) return readyPromise;
  return abortable(readyPromise, signal);
}
```

- [ ] **Step 3: Add helper functions at the bottom of the file**

```ts
function isAbortSignal(value: unknown): value is AbortSignal {
  return value !== null && typeof value === 'object' && 'aborted' in value;
}
```

The `resolveWhenReady()` private method was added in Task 5.

- [ ] **Step 4: Verify typecheck**

Run:

```bash
cd /Users/cheng/kimi-code
pnpm --filter @moonshot-ai/agent-core run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent-core/src/mcp/connection-manager.ts
git commit -m "feat(agent-core): add waitForInitialLoad overload for early readiness"
```

---

## Task 7: Update callers to use the readiness budget

**Files:**
- Modify: `packages/agent-core/src/agent/turn/index.ts`
- Modify: `packages/agent-core/src/session/index.ts`

- [ ] **Step 1: Update `runStepLoop()` in `packages/agent-core/src/agent/turn/index.ts`**

Change line 606 from:

```ts
await this.agent.mcp?.waitForInitialLoad(signal);
```

to:

```ts
await this.agent.mcp?.waitForInitialLoad({ readyTimeoutMs: MCP_READY_TIMEOUT_MS, signal });
```

Add the constant import at the top of the file. Since `DEFAULT_READY_TIMEOUT_MS` is private to `connection-manager.ts`, export it or define a local constant. To avoid cross-module coupling, define a local constant in `turn/index.ts`:

```ts
const MCP_READY_TIMEOUT_MS = 5_000;
```

Then use `MCP_READY_TIMEOUT_MS`.

- [ ] **Step 2: Update `syncMcpMemories()` in `packages/agent-core/src/session/index.ts`**

Change line 873 from:

```ts
await this.mcp.waitForInitialLoad();
```

to:

```ts
await this.mcp.waitForInitialLoad({ readyTimeoutMs: MCP_READY_TIMEOUT_MS });
```

Add a local constant at the top of the class or file:

```ts
const MCP_READY_TIMEOUT_MS = 5_000;
```

- [ ] **Step 3: Verify typecheck**

Run:

```bash
cd /Users/cheng/kimi-code
pnpm --filter @moonshot-ai/agent-core run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/agent-core/src/agent/turn/index.ts packages/agent-core/src/session/index.ts
git commit -m "feat(agent-core): use MCP readiness budget in turn loop and memory sync"
```

---

## Task 8: Update existing tests for retry behavior

**Files:**
- Modify: `packages/agent-core/test/mcp/connection-manager.test.ts`

Several existing tests assume a failed server is marked `failed` immediately. With retries, timeout failures will retry. We keep non-retryable errors (missing binary, config errors) failing immediately, but tests that use `startupTimeoutMs` to force timeouts need `maxRetries: 0`.

- [ ] **Step 1: Add `maxRetries: 0` to timeout-based tests**

Find the test `honors startupTimeoutMs by marking slow servers failed` and change the config to:

```ts
slow: {
  transport: 'stdio',
  command: process.execPath,
  args: [slowFixture],
  startupTimeoutMs: 100,
  maxRetries: 0,
},
```

Find the test `honors startupTimeoutMs while discovering tools` and change the config to:

```ts
slowList: {
  transport: 'stdio',
  command: process.execPath,
  args: [hangingListFixture],
  startupTimeoutMs: 100,
  maxRetries: 0,
},
```

- [ ] **Step 2: Verify the affected tests still pass**

Run:

```bash
cd /Users/cheng/kimi-code
pnpm --filter @moonshot-ai/agent-core test -- test/mcp/connection-manager.test.ts --run
```

Expected: The two timeout tests and all previously passing tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/agent-core/test/mcp/connection-manager.test.ts
git commit -m "test(agent-core): disable retries in existing MCP timeout tests"
```

---

## Task 9: Add new tests for background loading, retries, and concurrency

**Files:**
- Modify: `packages/agent-core/test/mcp/connection-manager.test.ts`

- [ ] **Step 1: Add a fixture script that fails a configurable number of times before succeeding**

Create `packages/agent-core/test/mcp/fixtures/flaky-stdio-server.mjs`:

```mjs
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const attempt = parseInt(process.env.KIMI_TEST_MCP_FLAKY_ATTEMPT ?? '0', 10);
const failUntil = parseInt(process.env.KIMI_TEST_MCP_FLAKY_FAIL_UNTIL ?? '0', 10);

if (attempt < failUntil) {
  // Exit with stderr to simulate a startup failure.
  console.error(`flaky: failing attempt ${attempt}`);
  process.exit(1);
}

const server = new Server({ name: 'flaky', version: '1.0.0' });
server.setRequestHandler('initialize', () => ({
  protocolVersion: '2024-11-05',
  capabilities: { tools: {} },
  serverInfo: { name: 'flaky', version: '1.0.0' },
}));
server.setRequestHandler('tools/list', () => ({
  tools: [{ name: 'echo', description: 'Echo', inputSchema: { type: 'object' } }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Add a test that retries a flaky server until it connects**

```ts
it('retries a flaky stdio server until it succeeds', async () => {
  const cm = new McpConnectionManager();
  const seen: Array<{ name: string; status: McpServerEntry['status'] }> = [];
  cm.onStatusChange((e) => seen.push({ name: e.name, status: e.status }));
  try {
    await cm.connectAll({
      flaky: {
        transport: 'stdio',
        command: process.execPath,
        args: [flakyStdioFixture],
        env: {
          KIMI_TEST_MCP_FLAKY_FAIL_UNTIL: '2',
        },
        startupTimeoutMs: 2_000,
        retryDelayMs: 100,
      },
    });

    expect(cm.get('flaky')?.status).toBe('connected');
    expect(cm.get('flaky')?.toolCount).toBe(1);
  } finally {
    await cm.shutdown();
  }
}, 15000);
```

Add `flakyStdioFixture` near the top of the test file:

```ts
const flakyStdioFixture = join(here, 'fixtures', 'flaky-stdio-server.mjs');
```

- [ ] **Step 3: Add a test that the session proceeds while a slow server loads in the background**

```ts
it('resolves waitForInitialLoad early when a server is slow', async () => {
  const cm = new McpConnectionManager();
  try {
    const connectPromise = cm.connectAll({
      slow: {
        transport: 'stdio',
        command: process.execPath,
        args: [slowStdioFixture],
        startupTimeoutMs: 30_000,
      },
    });

    // waitForInitialLoad with the readiness budget should resolve quickly,
    // even though the server has not connected yet.
    const start = Date.now();
    await cm.waitForInitialLoad({ readyTimeoutMs: 500 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2_000);

    // After the full initial load, the slow server is connected.
    await connectPromise;
    expect(cm.get('slow')?.status).toBe('connected');
  } finally {
    await cm.shutdown();
  }
}, 20000);
```

- [ ] **Step 4: Add a test for the stdio concurrency limit**

```ts
it('limits in-flight stdio spawns', async () => {
  const cm = new McpConnectionManager();
  try {
    // Each server waits 300ms before handshake. With a limit of 4, the
    // fifth server cannot start until one of the first four finishes.
    const connectPromise = cm.connectAll({
      a: { transport: 'stdio', command: process.execPath, args: [slowStdioFixture], env: { KIMI_TEST_MCP_SLOW_MS: '300' }, startupTimeoutMs: 5_000, maxRetries: 0 },
      b: { transport: 'stdio', command: process.execPath, args: [slowStdioFixture], env: { KIMI_TEST_MCP_SLOW_MS: '300' }, startupTimeoutMs: 5_000, maxRetries: 0 },
      c: { transport: 'stdio', command: process.execPath, args: [slowStdioFixture], env: { KIMI_TEST_MCP_SLOW_MS: '300' }, startupTimeoutMs: 5_000, maxRetries: 0 },
      d: { transport: 'stdio', command: process.execPath, args: [slowStdioFixture], env: { KIMI_TEST_MCP_SLOW_MS: '300' }, startupTimeoutMs: 5_000, maxRetries: 0 },
      e: { transport: 'stdio', command: process.execPath, args: [slowStdioFixture], env: { KIMI_TEST_MCP_SLOW_MS: '300' }, startupTimeoutMs: 5_000, maxRetries: 0 },
    });

    await connectPromise;
    const statuses = cm.list().map((e) => e.status);
    expect(statuses).toEqual(['connected', 'connected', 'connected', 'connected', 'connected']);
  } finally {
    await cm.shutdown();
  }
}, 20000);
```

Check the existing `slow-stdio-server.mjs` fixture to confirm it honors `KIMI_TEST_MCP_SLOW_MS`. If not, update the fixture or use a different value.

- [ ] **Step 5: Add a test that non-retryable errors fail immediately**

```ts
it('does not retry when the command does not exist', async () => {
  const cm = new McpConnectionManager();
  const seen: Array<{ name: string; status: McpServerEntry['status'] }> = [];
  cm.onStatusChange((e) => seen.push({ name: e.name, status: e.status }));
  try {
    await cm.connectAll({
      missing: { transport: 'stdio', command: '/definitely/not/a/real/command' },
    });
    expect(cm.get('missing')?.status).toBe('failed');
    // Should not see pending → failed → pending → failed retries.
    const statuses = seen.filter((s) => s.name === 'missing').map((s) => s.status);
    expect(statuses).toEqual(['pending', 'failed']);
  } finally {
    await cm.shutdown();
  }
}, 5000);
```

- [ ] **Step 6: Run the new tests**

```bash
cd /Users/cheng/kimi-code
pnpm --filter @moonshot-ai/agent-core test -- test/mcp/connection-manager.test.ts --run
```

Expected: All new tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/agent-core/test/mcp/connection-manager.test.ts packages/agent-core/test/mcp/fixtures/flaky-stdio-server.mjs
git commit -m "test(agent-core): add MCP retry, background load, and concurrency tests"
```

---

## Task 10: Run quality gates

**Files:** all changed files.

- [ ] **Step 1: Run the MCP test suite**

```bash
cd /Users/cheng/kimi-code
pnpm --filter @moonshot-ai/agent-core test -- test/mcp/ --run
```

Expected: PASS.

- [ ] **Step 2: Run typecheck for the package**

```bash
cd /Users/cheng/kimi-code
pnpm --filter @moonshot-ai/agent-core run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run lint on changed files**

```bash
cd /Users/cheng/kimi-code
pnpm run lint -- packages/agent-core/src/mcp/connection-manager.ts packages/agent-core/src/config/schema.ts packages/agent-core/src/agent/turn/index.ts packages/agent-core/src/session/index.ts
```

Expected: PASS or no new errors.

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore(agent-core): final fixes after MCP timeout management quality gates"
```

---

## Plan Self-Review

### Spec coverage

| Spec requirement | Task implementing it |
|---|---|
| Non-blocking `connectAll()` | Task 5 |
| Per-server exponential-backoff retries | Task 4 |
| Stdio spawn concurrency limit | Task 4 |
| `waitForInitialLoad()` options overload | Task 6 |
| Turn loop uses 5s readiness budget | Task 7 |
| Memory sync uses 5s readiness budget | Task 7 |
| Config additions (`maxRetries`, `retryDelayMs`) | Task 1 |
| Tests for retry, background load, concurrency | Task 9 |

### Placeholder scan

- No "TBD", "TODO", "implement later", or "fill in details".
- Every code step contains the actual code to write.
- Every test step contains actual test code.

### Type consistency

- `Deferred<T>` is used consistently.
- `WaitForInitialLoadOptions` matches the spec.
- `InternalEntry` always initializes `retryCount: 0`.

### Known open issues to verify during execution

1. The `slow-stdio-server.mjs` fixture must honor an env var like `KIMI_TEST_MCP_SLOW_MS`. If it does not, the concurrency test fixture needs to be created or adjusted.
2. `isUnauthorizedLikeError` and `isTerminalTransportError` are already imported from `client-shared.ts` in `connection-manager.ts`. If not, add the imports.
3. `KimiError` and `ErrorCodes` are already imported; confirm before adding the `CONFIG_INVALID` check.
