import { describe, expect, it, vi } from "vitest";
import { apply as host } from "../src/index.ts";
import { apply as client } from "../src/client/index.ts";
describe("reference adapter compatibility shell", () => {
  it("does not register duplicate sources, handlers, transports or pollers", () => {
    const context = { obsidianBridgeLifecycle: { capabilities: ["reference-channel-v1", "action-dispatch-v1"] }, effect: vi.fn(), annotationCore: { registerSourceAdapter: vi.fn() }, annotationCoreHost: { registerSourceAdapter: vi.fn() } };
    host(context as never, {bridgeOrigin: "", profileId: "web"}); client(context as never);
    expect(context.effect).not.toHaveBeenCalled(); expect(context.annotationCore.registerSourceAdapter).not.toHaveBeenCalled(); expect(context.annotationCoreHost.registerSourceAdapter).not.toHaveBeenCalled();
  });
  it("gives a concrete upgrade diagnostic for an old Bridge", () => {
    const context = { obsidianBridgeLifecycle: { capabilities: ["action-dispatch-v1"] } };
    expect(() => client(context as never)).toThrow("upgrade Bridge");
    expect(() => host(context as never, {bridgeOrigin: "", profileId: "web"})).toThrow("upgrade Bridge");
  });
});
