import type { Context as CordisContext } from "@deepseek-ai/cordis";
import type { AnnotationCoreClient } from "dsh-annotation-core/client-api";
import type { ObsidianBridgeLifecycle } from "dsh-obsidian-bridge-lifecycle/api";

import { bridgeSurfaceIdFromUrl, createBridgeHttpClient } from "../bridge/http-client.ts";
import { startReferencePolling } from "../bridge/reference-polling.ts";
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
    list: { getSnapshot(): { current?: string } };
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
  const unregisterSource = ctx.annotationCore.registerSourceAdapter("obsidian-note", {
    async openSource(item) {
      if (item.sourceType !== "obsidian-note") throw new TypeError("Expected an Obsidian reference");
      await bridge.openNote(openSourceAction(item.locator.notePath, item.locator.blockId));
    },
  });
  const unregisterAttachment = ctx.obsidianBridgeLifecycle.mountWhenReady(
    "obsidian-reference-adapter:client-transport",
    () => {
      const polling = startReferencePolling(bridge, async (action) => {
        if (action.type === "reference-delete-request") {
          if (action.profileId !== PROFILE_ID) return false;
          await ctx.annotationCore.deleteReferenceLink(action.sessionId, action.setId, action.referenceId);
          return true;
        }
        if (action.type === "reference-capture") {
          const sessionId = ctx.sessions.list.getSnapshot().current;
          if (!sessionId) return false;
          await consumeObsidianReferenceCapture({
            capture: action,
            sessionId,
            profileId: PROFILE_ID,
            annotationCore: ctx.annotationCore,
            bridge,
          });
          return true;
        }
        if (action.type === "deep-link" && action.setId !== undefined) {
          ctx.sessions.open(action.sessionId);
          if (typeof ctx.annotationCore.openAnnotationInSession === "function") {
            return ctx.annotationCore.openAnnotationInSession(action.sessionId, action.setId, action.referenceId);
          }
          ctx.annotationCore.openAnnotation(action.setId, action.referenceId);
          return true;
        }
        return false;
      }, {
        onError: (error) => console.warn("[dsh-obsidian-reference-adapter] Bridge unavailable", error),
        onActionError: (error, action) => console.warn(
          "[dsh-obsidian-reference-adapter] action failed",
          { actionId: action.actionId, type: action.type, error },
        ),
      });
      return () => polling.stop();
    },
  );
  ctx.effect(() => async () => {
    unregisterAttachment();
    unregisterSource();
    bridge.dispose();
  }, "dsh-obsidian-reference-adapter: client");
}
