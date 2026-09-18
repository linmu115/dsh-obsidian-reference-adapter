import type { ObsidianBridgeLifecycle } from "dsh-obsidian-bridge-lifecycle/api";
export function requireIntegratedBridge(bridge: ObsidianBridgeLifecycle): void {
  const integrated = bridge as ObsidianBridgeLifecycle & { capabilities?: readonly string[] };
  if (!integrated.capabilities?.includes("reference-channel-v1") || !integrated.capabilities?.includes("action-dispatch-v1")) {
    throw new Error("dsh-obsidian-reference-adapter now delegates to dsh-obsidian-bridge-lifecycle >=0.4.0-rc2.1; upgrade Bridge before enabling this compatibility package");
  }
}
