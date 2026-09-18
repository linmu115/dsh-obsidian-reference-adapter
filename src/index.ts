import type { Context as CordisContext } from "@deepseek-ai/cordis";
import s from "@deepseek-ai/schemastery";
import type { ObsidianBridgeLifecycle } from "dsh-obsidian-bridge-lifecycle/api";
type Context = CordisContext & { obsidianBridgeLifecycle: ObsidianBridgeLifecycle };
import { requireIntegratedBridge } from "./compatibility.ts";
export const name = "dsh-obsidian-reference-adapter";
export const inject = ["obsidianBridgeLifecycle"] as const;
export interface Config { bridgeOrigin: string; profileId: string; }
export const Config = s.object({ bridgeOrigin: s.string().default(""), profileId: s.string().default("web") });
/** Compatibility registration only: Bridge owns transport, sources and polling. */
export function apply(ctx: Context, _config: Config): void { requireIntegratedBridge(ctx.obsidianBridgeLifecycle); }
