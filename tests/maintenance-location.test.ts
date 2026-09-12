import { expect, it, vi } from "vitest";
import { maintenanceLocationRequest, resolvedReferenceLocation, resolveMaintenanceLocation } from "../src/bridge/maintenance-location.ts";
it("resolves a legacy anchor through the stable logical identity without selecting an instance in the browser", async () => {
  const input = { sessionId: "old", anchorId: "old-anchor", logicalSessionId: "logical" };
  const request = maintenanceLocationRequest(input);
  expect(request).toMatchObject({ logicalSessionId: "logical", legacyNativeSessionId: "old", legacyNativeAnchorId: "old-anchor" });
  expect(request).not.toHaveProperty("targetInstanceId");
  const fetch = vi.fn(async () => new Response(JSON.stringify({ referenceResolution: {
    status: "resolved", nativeSessionId: "rc2-native", nativeAnchorId: "rc2-anchor", logicalSessionId: "logical",
  } }), { status: 200 }));
  expect(await resolveMaintenanceLocation(input, fetch)).toEqual({ sessionId: "rc2-native", anchorId: "rc2-anchor", logicalSessionId: "logical" });
});
it("never accepts ambiguous or unavailable resolution as a successful native target", async () => {
  expect(resolvedReferenceLocation({ referenceResolution: { status: "ambiguous", nativeSessionId: "guess" } })).toBeUndefined();
  const unavailable = async () => new Response("", { status: 404 });
  expect(await resolveMaintenanceLocation({ sessionId: "legacy" }, unavailable)).toBeUndefined();
  await expect(resolveMaintenanceLocation({ sessionId: "legacy", logicalSessionId: "logical" }, unavailable)).rejects.toThrow("404");
});
