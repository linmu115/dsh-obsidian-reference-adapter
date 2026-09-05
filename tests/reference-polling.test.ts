import { describe, expect, it, vi } from "vitest";
import { startReferencePolling } from "../src/bridge/reference-polling.ts";
import type { BridgeActionPage } from "../src/bridge/http-client.ts";
const deletion = (cursor: number) => ({ cursor, message: { annotationProtocolVersion: 2 as const, type: "reference-delete-request" as const, actionId: `a${cursor}`, referenceId: `r${cursor}`, profileId: "web", sessionId: "s", setId: "set", requestedAt: 1 } });
function setup(page: BridgeActionPage) {
  const scheduled: Array<() => void> = [];
  const bridge = { nextActions: vi.fn(async () => page), acknowledgeDeepLink: vi.fn(async () => {}), acknowledgeAction: vi.fn(async () => {}) };
  const options = { schedule: (callback: () => void) => { scheduled.push(callback); return () => {}; } };
  return { bridge, options, scheduled };
}
describe("reference queue retry and ownership", () => {
  it("retains no-session work and wakes it without blocking unrelated actions", async () => {
    const fixture = setup({ queueId: "one", cursor: 2, actions: [deletion(1), deletion(2)] }); let session = false;
    const apply = vi.fn(async (message: any) => message.actionId === "a1" && !session ? "retry" as const : "handled" as const);
    const poll = startReferencePolling(fixture.bridge, apply, fixture.options); await poll.firstCycle;
    expect(fixture.bridge.acknowledgeAction).toHaveBeenCalledWith("a2", expect.any(AbortSignal)); expect(poll.getHealth()).toMatchObject({ pendingCount: 1 });
    session = true; poll.retry(); await vi.waitFor(() => expect(fixture.bridge.acknowledgeAction).toHaveBeenCalledWith("a1", expect.any(AbortSignal)));
    expect(apply.mock.calls.filter(([message]) => message.actionId === "a2")).toHaveLength(1); poll.stop();
  });
  it("never applies a page returned after stop", async () => {
    let resolve!: (value: BridgeActionPage) => void; const fixture = setup({cursor: 0, actions: []}); fixture.bridge.nextActions.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const apply = vi.fn(); const poll = startReferencePolling(fixture.bridge, apply, fixture.options); poll.stop(); resolve({ cursor: 1, actions: [deletion(1)] }); await poll.firstCycle; await Promise.resolve(); expect(apply).not.toHaveBeenCalled();
  });
  it("does not acknowledge a handler that finishes after stop", async () => {
    let resolve!: (value: "handled") => void; const fixture = setup({cursor: 1, actions: [deletion(1)]});
    const apply = vi.fn(() => new Promise<"handled">((done) => { resolve = done; })); const poll = startReferencePolling(fixture.bridge, apply, fixture.options);
    await vi.waitFor(() => expect(apply).toHaveBeenCalledOnce()); poll.stop(); resolve("handled"); await Promise.resolve(); expect(fixture.bridge.acknowledgeAction).not.toHaveBeenCalled();
  });
  it("forgets deferred captures removed by another consumer or discard", async () => {
    const page = { cursor: 1, actions: [deletion(1)] }; const fixture = setup(page); const apply = vi.fn(async () => "retry" as const);
    const poll = startReferencePolling(fixture.bridge, apply, fixture.options); await poll.firstCycle; page.actions = []; poll.retry();
    await vi.waitFor(() => expect(poll.getHealth().pendingCount).toBe(0)); expect(apply).toHaveBeenCalledOnce(); poll.stop();
  });
  it("keeps retryable errors independent and ignores sibling-owned actions without ack", async () => {
    const fixture = setup({cursor: 3, actions: [deletion(1), deletion(2), deletion(3)]});
    const poll = startReferencePolling(fixture.bridge, async (action) => { if (action.actionId === "a1") throw Error("try later"); return action.actionId === "a2" ? "ignored" : "handled"; }, fixture.options);
    await poll.firstCycle; expect(fixture.bridge.acknowledgeAction).toHaveBeenCalledTimes(1); expect(fixture.bridge.acknowledgeAction).toHaveBeenCalledWith("a3", expect.any(AbortSignal)); poll.stop();
  });
  it("resets retries and cursor when Bridge queue identity changes", async () => {
    const fixture = setup({queueId: "old", cursor: 4, actions: [deletion(4)]}); const apply = vi.fn(async () => "retry" as const);
    const poll = startReferencePolling(fixture.bridge, apply, fixture.options); await poll.firstCycle;
    fixture.bridge.nextActions.mockResolvedValue({queueId: "new", cursor: 1, actions: [deletion(1)]}); poll.retry(); await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(2)); expect(poll.getHealth().pendingCount).toBe(1); poll.stop();
  });
});
