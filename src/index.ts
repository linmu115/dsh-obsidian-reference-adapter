import type { Context as CordisContext } from "@deepseek-ai/cordis";
import s from "@deepseek-ai/schemastery";
import type { AnnotationCoreHost } from "dsh-annotation-core/host-api";
import type { ObsidianBridgeLifecycle } from "dsh-obsidian-bridge-lifecycle/api";

import { createBridgeHttpClient, normalizeBridgeOrigin } from "./bridge/http-client.ts";
import { startReferencePolling } from "./bridge/reference-polling.ts";
import { createObsidianSourceAdapter } from "./host/obsidian-source-adapter.ts";
import { createReferenceDeleteActionHandler } from "./bridge/reference-delete-actions.ts";

type Context = CordisContext & {
  annotationCoreHost: AnnotationCoreHost;
  obsidianBridgeLifecycle: ObsidianBridgeLifecycle;
};

export const name = "dsh-obsidian-reference-adapter";
export const inject = ["annotationCoreHost", "obsidianBridgeLifecycle"] as const;
export interface Config { bridgeOrigin: string; profileId: string; }
export const Config = s.object({
  bridgeOrigin: s.string().default(""),
  profileId: s.string().default("web"),
});

export function apply(ctx: Context, config: Config): void {
  const origin = normalizeBridgeOrigin(config.bridgeOrigin || ctx.obsidianBridgeLifecycle.bridgeOrigin);
  const bridge = createBridgeHttpClient({ origin, clientId: `dsh-reference-host-${config.profileId}` });
  const unregisterSource = ctx.annotationCoreHost.registerSourceAdapter(
    "obsidian-note",
    createObsidianSourceAdapter(bridge),
  );
  const deleteReferenceLink = ctx.annotationCoreHost.deleteReferenceLink?.bind(ctx.annotationCoreHost);
  const unregisterAttachment = ctx.obsidianBridgeLifecycle.mountWhenReady(
    "obsidian-reference-adapter:host-transport",
    () => {
      if (deleteReferenceLink === undefined) return;
      const polling = startReferencePolling(
        bridge,
        createReferenceDeleteActionHandler({ deleteReferenceLink }, bridge, config.profileId),
        {
          onError: (error) => console.warn("[dsh-obsidian-reference-adapter] host Bridge unavailable", error),
          onActionError: (error, action) => console.warn(
            "[dsh-obsidian-reference-adapter] host action failed",
            { actionId: action.actionId, type: action.type, error },
          ),
        },
      );
      const unregisterHealth = ctx.obsidianBridgeLifecycle.registerHealthSource?.("reference-deletions", polling);
      return () => { polling.stop(); unregisterHealth?.(); };
    },
  );
  ctx.effect(() => async () => {
    unregisterAttachment();
    unregisterSource();
    bridge.dispose();
  }, "dsh-obsidian-reference-adapter: host");
}
