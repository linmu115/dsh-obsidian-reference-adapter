import type { BridgeAction, BridgeHttpClient } from "./http-client.ts";

export type DeliveryOutcome = "handled" | "retry" | "ignored" | "cancelled";
export interface ReferenceDeliveryHealth {
  state: "receiving" | "waiting-for-session" | "retrying" | "stopped";
  pendingCount: number;
  lastError?: string;
}
export interface ReferencePollingHandle {
  readonly firstCycle: Promise<void>;
  stop(): void;
  retry(): void;
  getHealth(): ReferenceDeliveryHealth;
  subscribe(listener: () => void): () => void;
}
export interface ReferencePollingOptions {
  schedule?: (callback: () => void, delay: number) => () => void;
  onError?: (error: unknown) => void;
  onActionError?: (error: unknown, message: BridgeAction) => void;
  onHealth?: (health: ReferenceDeliveryHealth) => void;
  now?: () => number;
  isVisible?: () => boolean;
  maxPending?: number;
}

/** Retain retry positions independently of the forward cursor; only owners acknowledge. */
export function startReferencePolling(
  bridge: Pick<BridgeHttpClient, "nextActions" | "acknowledgeDeepLink" | "acknowledgeAction">,
  apply: (message: BridgeAction, signal: AbortSignal) => Promise<DeliveryOutcome | boolean>,
  options: ReferencePollingOptions = {},
): ReferencePollingHandle {
  const schedule = options.schedule ?? ((callback, delay) => {
    const timer = globalThis.setTimeout(callback, delay);
    return () => globalThis.clearTimeout(timer);
  });
  const now = options.now ?? Date.now;
  const abort = new AbortController();
  const listeners = new Set<() => void>();
  const retries = new Map<number, { attempts: number; due: number; waiting: boolean }>();
  const maxPending = options.maxPending ?? 500;
  if (!Number.isInteger(maxPending) || maxPending < 1) throw new TypeError("Pending retry limit must be positive");
  let cursor = 0;
  let queueId: string | undefined;
  let stopped = false;
  let running = false;
  let wakeRequested = false;
  let cancelScheduled: (() => void) | undefined;
  let networkDelay = 1_000;
  let lastError: string | undefined;
  let resolveFirst!: () => void;
  const firstCycle = new Promise<void>((resolve) => { resolveFirst = resolve; });
  const getHealth = (): ReferenceDeliveryHealth => ({
    state: stopped ? "stopped" : lastError ? "retrying" : [...retries.values()].some((item) => item.waiting) ? "waiting-for-session" : "receiving",
    pendingCount: retries.size,
    ...(lastError === undefined ? {} : { lastError }),
  });
  const cycle = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    cancelScheduled = undefined;
    let delay = options.isVisible?.() === false ? 3_000 : 750;
    try {
      const after = retries.size === 0 ? cursor : Math.min(cursor, Math.min(...retries.keys()) - 1);
      const page = await bridge.nextActions(Math.max(0, after), abort.signal);
      if (stopped) return;
      if ((page.queueId !== undefined && queueId !== undefined && page.queueId !== queueId) || page.cursor < cursor) {
        cursor = 0;
        retries.clear();
      }
      if (page.queueId !== undefined) queueId = page.queueId;
      // The pending endpoint returns the complete active suffix. A missing retry was
      // claimed or cancelled elsewhere and must never be replayed from a local cache.
      const present = new Set(page.actions.map((entry) => entry.cursor));
      for (const key of retries.keys()) if (!present.has(key)) retries.delete(key);
      for (const entry of [...page.actions].sort((a, b) => a.cursor - b.cursor)) {
        if (stopped) break;
        const retry = retries.get(entry.cursor);
        if (entry.cursor <= cursor && retry === undefined) continue;
        if (retry !== undefined && retry.due > now()) continue;
        if (retry === undefined && retries.size >= maxPending) break;
        let outcome: DeliveryOutcome | boolean = "retry";
        let failed = false;
        try {
          outcome = await apply(entry.message, abort.signal);
          if (stopped) break;
          if (outcome === "handled" || outcome === true) {
            if (entry.message.type === "deep-link") await bridge.acknowledgeDeepLink(entry.message.actionId, abort.signal);
            if (entry.message.type === "reference-delete-request") await bridge.acknowledgeAction(entry.message.actionId, abort.signal);
          }
        } catch (error) {
          if (stopped) break;
          failed = true;
          outcome = "retry";
          lastError = error instanceof Error ? error.message : String(error);
          options.onActionError?.(error, entry.message);
        }
        if (stopped) break;
        if (outcome === "retry") {
          const attempts = Math.min((retry?.attempts ?? 0) + 1, 10);
          retries.set(entry.cursor, { attempts, due: now() + Math.min(750 * 2 ** (attempts - 1), 10_000), waiting: !failed && entry.message.type === "reference-capture" });
        } else retries.delete(entry.cursor);
        cursor = Math.max(cursor, entry.cursor);
      }
      if (page.actions.length === 0) cursor = Math.max(cursor, page.cursor);
      if (retries.size === 0) lastError = undefined;
      networkDelay = 1_000;
    } catch (error) {
      if (!stopped) {
        lastError = error instanceof Error ? error.message : String(error);
        options.onError?.(error);
        delay = networkDelay;
        networkDelay = Math.min(networkDelay * 2, 10_000);
      }
    } finally {
      running = false;
      resolveFirst();
      options.onHealth?.(getHealth());
      for (const listener of [...listeners]) listener();
      if (!stopped) {
        if (wakeRequested) { wakeRequested = false; for (const retry of retries.values()) retry.due = 0; delay = 0; }
        cancelScheduled = schedule(() => { void cycle(); }, delay);
      }
    }
  };
  void cycle();
  return {
    firstCycle, getHealth,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    retry() {
      if (stopped) return;
      for (const retry of retries.values()) retry.due = 0;
      cancelScheduled?.();
      if (running) wakeRequested = true;
      else void cycle();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      abort.abort();
      cancelScheduled?.();
      retries.clear();
      resolveFirst();
      options.onHealth?.(getHealth());
      for (const listener of [...listeners]) listener();
    },
  };
}
