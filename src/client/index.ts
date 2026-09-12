import { resolveMaintenanceLocation } from "../bridge/maintenance-location.ts";
import type { Context as CordisContext } from "@deepseek-ai/cordis";
import type { AnnotationCoreClient } from "dsh-annotation-core/client-api";
import type { ObsidianBridgeLifecycle } from "dsh-obsidian-bridge-lifecycle/api";

import { BridgeHttpError, bridgeSurfaceIdFromUrl, createBridgeHttpClient } from "../bridge/http-client.ts";
import { startReferencePolling } from "../bridge/reference-polling.ts";
import { createReferenceDeleteActionHandler } from "../bridge/reference-delete-actions.ts";
import type { OpenNoteAction } from "../protocol.ts";
import { consumeObsidianReferenceCapture } from "./annotation-consumer.ts";


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
  const identity = ctx.obsidianBridgeLifecycle.runtimeIdentity;
  const profileId = identity?.profileId ?? "web";
  const instance = identity?.dshInstanceId;
  const instanceScope = instance === undefined ? {} : { dshInstanceId: instance };
  const bridge = createBridgeHttpClient({
    ...instanceScope,
    origin: ctx.obsidianBridgeLifecycle.bridgeOrigin,
    clientId: `dsh-reference-web-${surfaceId ?? crypto.randomUUID()}`,
    ...(surfaceId === undefined ? {} : { surfaceId }),
  });
  const applyReferenceDelete = createReferenceDeleteActionHandler(ctx.annotationCore, bridge, profileId, {
    ...instanceScope,
    resolveSession: async action => {
      if (action.type !== "reference-delete-request") return undefined;
      const resolved = await resolveMaintenanceLocation(action);
      return resolved?.sessionId ?? (action.logicalSessionId ? undefined : action.sessionId);
    },
  });
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
          if (action.dshInstanceId !== undefined && action.dshInstanceId !== instance) return "ignored";
          const target = await resolveMaintenanceLocation({ sessionId });
          if (target !== undefined && target.sessionId !== sessionId) throw new Error("Capture resolver changed the receiving session identity");
          try { await consumeObsidianReferenceCapture({
            signal,
            capture: action,
            sessionId,
            profileId,
            logicalTarget: { ...instanceScope, legacySessionId: sessionId,
              ...(target?.logicalSessionId ? { logicalSessionId: target.logicalSessionId } : {}) },
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
          if (action.dshInstanceId !== undefined && action.dshInstanceId !== instance) return "ignored";
          const resolved = await resolveMaintenanceLocation(action);
          if (action.logicalSessionId && resolved === undefined) return "retry";
          const targetSessionId = resolved?.sessionId ?? action.sessionId;
          await ctx.sessions.open(targetSessionId);
          if (typeof ctx.annotationCore.openAnnotationInSession === "function") {
            return await ctx.annotationCore.openAnnotationInSession(targetSessionId, action.setId, action.referenceId) ? "handled" : "retry";
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
