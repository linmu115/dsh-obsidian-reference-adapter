import type { Context as CordisContext } from "@deepseek-ai/cordis";
import type { ObsidianBridgeLifecycle } from "dsh-obsidian-bridge-lifecycle/api";
type Context = CordisContext & { obsidianBridgeLifecycle: ObsidianBridgeLifecycle };
import { requireIntegratedBridge } from "../compatibility.ts";
export const inject = ["obsidianBridgeLifecycle"] as const;
export function apply(ctx: Context): void { requireIntegratedBridge(ctx.obsidianBridgeLifecycle); }
