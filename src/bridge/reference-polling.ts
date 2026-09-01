import type { BridgeAction, BridgeActionPage, BridgeHttpClient } from "./http-client.ts";

export interface ReferencePollingHandle {
  readonly firstCycle: Promise<void>;
  stop(): void;
}

export interface ReferencePollingOptions {
  schedule?: (callback: () => void, delay: number) => () => void;
  onError?: (error: unknown) => void;
  onActionError?: (error: unknown, message: BridgeAction) => void;
}

/**
 * Poll one Bridge queue without consuming messages owned by sibling adapters.
 * Unsupported messages advance only this client's cursor and are never
 * acknowledged globally.
 */
export function startReferencePolling(
  bridge: Pick<BridgeHttpClient, "nextActions" | "acknowledgeDeepLink" | "acknowledgeAction">,
  apply: (message: BridgeAction) => Promise<boolean>,
  options: ReferencePollingOptions = {},
): ReferencePollingHandle {
  const schedule = options.schedule ?? ((callback, delay) => {
    const timer = globalThis.setTimeout(callback, delay);
    return () => globalThis.clearTimeout(timer);
  });
  let cursor = 0;
  let queueId: string | undefined;
  let stopped = false;
  let cancelScheduled: (() => void) | undefined;
  let networkDelay = 1_000;
  let resolveFirst!: () => void;
  const firstCycle = new Promise<void>((resolve) => { resolveFirst = resolve; });

  const process = async (page: BridgeActionPage): Promise<void> => {
    if (page.queueId !== undefined && page.queueId !== queueId) {
      if (queueId !== undefined) cursor = 0;
      queueId = page.queueId;
    }
    if (page.cursor < cursor) cursor = 0;
    for (const entry of [...page.actions].sort((left, right) => left.cursor - right.cursor)) {
      if (entry.cursor <= cursor) continue;
      try {
        const accepted = await apply(entry.message);
        if (accepted) {
          if (entry.message.type === "deep-link") await bridge.acknowledgeDeepLink(entry.message.actionId);
          if (entry.message.type === "reference-delete-request") await bridge.acknowledgeAction(entry.message.actionId);
        }
      } catch (error) {
        options.onActionError?.(error, entry.message);
        break;
      }
      cursor = entry.cursor;
    }
    if (page.actions.length === 0 && page.cursor > cursor) cursor = page.cursor;
  };

  const cycle = async (): Promise<void> => {
    if (stopped) return;
    cancelScheduled = undefined;
    let delay = 750;
    try {
      await process(await bridge.nextActions(cursor));
      networkDelay = 1_000;
    } catch (error) {
      options.onError?.(error);
      delay = networkDelay;
      networkDelay = Math.min(networkDelay * 2, 10_000);
    }
    resolveFirst();
    if (!stopped) cancelScheduled = schedule(() => { void cycle(); }, delay);
  };
  void cycle();
  return {
    firstCycle,
    stop() {
      stopped = true;
      cancelScheduled?.();
    },
  };
}
