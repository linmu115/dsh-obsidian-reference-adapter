import type { Context as CordisContext } from "@deepseek-ai/cordis";
import type { AnnotationCoreClient } from "dsh-annotation-core/client-api";
import type { ObsidianBridgeLifecycle } from "dsh-obsidian-bridge-lifecycle/api";

import { BridgeHttpError, bridgeSurfaceIdFromUrl, createBridgeHttpClient } from "../bridge/http-client.ts";
import { startReferencePolling } from "../bridge/reference-polling.ts";
import { createReferenceDeleteActionHandler } from "../bridge/reference-delete-actions.ts";
import type { OpenNoteAction } from "../protocol.ts";
import { consumeObsidianReferenceCapture } from "./annotation-consumer.ts";

const PROFILE_ID = "web";

type SessionOpeningCore = AnnotationCoreClient & {
  openAnnotationInSession?: (sessionId: string, setId: string, referenceId?: string) => Promise<boolean>;
};
type Context = CordisContext & {
  annotationCore: SessionOpeningCore;
  obsidianBridgeLifecycle: ObsidianBridgeLifecycle;
  sessions: {
    list: { getSnapshot(): { current?: string }; subscribe?(listener: () => void): () => void };
    open(sessionId: string): void;
  };
};

export const inject = ["sessions", "annotationCore", "obsidianBridgeLifecycle"] as const;

function openSourceAction(notePath: string, blockId?: string): OpenNoteAction {
  return {
    protocolVersion: 1,
    type: "open-note",
    actionId: crypto.randomUUID(),
    notePath,
    ...(blockId === undefined ? {} : { blockId }),
  };
}

export function apply(ctx: Context): void {
  const surfaceId = typeof location === "undefined" ? undefined : bridgeSurfaceIdFromUrl(location.href);
  const bridge = createBridgeHttpClient({
    origin: ctx.obsidianBridgeLifecycle.bridgeOrigin,
    clientId: `dsh-reference-web-${surfaceId ?? crypto.randomUUID()}`,
    ...(surfaceId === undefined ? {} : { surfaceId }),
  });
  const applyReferenceDelete = createReferenceDeleteActionHandler(ctx.annotationCore, bridge, PROFILE_ID);
  const unregisterSource = ctx.annotationCore.registerSourceAdapter("obsidian-note", {
    async openSource(item) {
      if (item.sourceType !== "obsidian-note") throw new TypeError("Expected an Obsidian reference");
      await bridge.openNote(openSourceAction(item.locator.notePath, item.locator.blockId));
    },
  });
  const unregisterAttachment = ctx.obsidianBridgeLifecycle.mountWhenReady(
    "obsidian-reference-adapter:client-transport",
    () => {
      const polling = startReferencePolling(bridge, async (action, signal) => {
        signal.throwIfAborted();
        if (action.type === "reference-delete-request") {
          return await applyReferenceDelete(action) ? "handled" : "ignored";
        }
        if (action.type === "reference-capture") {
          const sessionId = ctx.sessions.list.getSnapshot().current;
          if (!sessionId) return "retry";
          try { await consumeObsidianReferenceCapture({
            signal,
            capture: action,
            sessionId,
            profileId: PROFILE_ID,
            annotationCore: ctx.annotationCore,
            bridge,
          }); } catch (error) {
            if (error instanceof BridgeHttpError && (error.code === "idempotency-conflict" || error.status === 404 || error.status === 410)) return "cancelled";
            throw error;
          }
          return "handled";
        }
        if (action.type === "deep-link" && action.setId !== undefined) {
          if (action.targetSurfaceId !== undefined && action.targetSurfaceId !== surfaceId) return "ignored";
          ctx.sessions.open(action.sessionId);
          if (typeof ctx.annotationCore.openAnnotationInSession === "function") {
            return await ctx.annotationCore.openAnnotationInSession(action.sessionId, action.setId, action.referenceId) ? "handled" : "retry";
          }
          ctx.annotationCore.openAnnotation(action.setId, action.referenceId);
          return "handled";
        }
        return "ignored";
      }, {
        isVisible: () => typeof document === "undefined" || document.visibilityState !== "hidden",
        onError: (error) => console.warn("[dsh-obsidian-reference-adapter] Bridge unavailable", error),
        onActionError: (error, action) => console.warn(
          "[dsh-obsidian-reference-adapter] action failed",
          { actionId: action.actionId, type: action.type, error },
        ),
      });
      const unregisterHealth = ctx.obsidianBridgeLifecycle.registerHealthSource?.("references", polling);
      let previousSession = ctx.sessions.list.getSnapshot().current;
      const unsubscribe = ctx.sessions.list.subscribe?.(() => {
        const current = ctx.sessions.list.getSnapshot().current;
        if (current && current !== previousSession) polling.retry();
        previousSession = current;
      });
      const visibility = () => { if (document.visibilityState !== "hidden") polling.retry(); };
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", visibility);
      return () => {
        polling.stop();
        unregisterHealth?.();
        unsubscribe?.();
        if (typeof document !== "undefined") document.removeEventListener("visibilitychange", visibility);
      };
    },
  );
  ctx.effect(() => async () => {
    unregisterAttachment();
    unregisterSource();
    bridge.dispose();
  }, "dsh-obsidian-reference-adapter: client");
}
