import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import { createBridgeHttpClient } from "../src/bridge/http-client.ts";
import type { ReferencePollingHandle } from "../src/bridge/reference-polling.ts";
import { apply as applyClient } from "../src/client/index.ts";
import { createReferenceDeleteActionHandler } from "../src/bridge/reference-delete-actions.ts";
import { ReferenceDeleteCommitV2Schema, type ReferenceDeleteRequestV2 } from "../src/protocol.ts";

const deletion: ReferenceDeleteRequestV2 = {
  annotationProtocolVersion: 2,
  type: "reference-delete-request",
  actionId: "delete-action",
  referenceId: "reference-1",
  profileId: "web",
  sessionId: "session-1",
  setId: "set-1",
  requestedAt: 100,
  logicalSessionId: "logical-session-1",
  logicalAnchorId: "logical-anchor-1",
  legacySessionId: "legacy-session-1",
  legacyAnchorId: "legacy-anchor-1",
};

// Keep real HTTP transport and handler behavior. The source fixture preserves a
// delete request until a schema-valid, exact-identity commit acknowledges it.
async function sourceFixture() {
  const requests = new Set(["delete-action"]);
  let rejectCommit = false;
  let origin = "";
  let queued = true;
  const server = createServer(async (request, response) => {
    const respond = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (request.url === "/v2/handshake") {
      respond(200, {
        token: "test-token", expiresAt: Date.now() + 60_000,
        annotationProtocolVersion: 2, stickerProtocolVersion: 1, bridgeOrigin: origin,
        capabilities: ["reference-capture-v2", "reference-refresh", "backlink-commit-v2", "reference-delete-v2", "sticker-backlink-delete-v1"],
      });
      return;
    }
    if (request.headers.authorization !== "Bearer test-token") { respond(401, {}); return; }
    if (request.url?.startsWith("/v2/actions/pending?")) {
      respond(200, { queueId: "queue-1", cursor: 1, actions: queued ? [{ cursor: 1, message: deletion }] : [] });
      return;
    }
    if (request.url === "/v1/actions/delete-action/ack") { queued = false; respond(200, { ok: true }); return; }
    if (request.url === "/v2/references/reference-1/discard") {
      respond(409, { code: "IDEMPOTENCY_CONFLICT", error: "Deletion request requires an exact relation acknowledgement" });
      return;
    }
    if (request.url !== "/v2/references/reference-1/delete-commit") { respond(404, {}); return; }
    let body = "";
    for await (const chunk of request) body += chunk.toString();
    const parsed = ReferenceDeleteCommitV2Schema.safeParse(JSON.parse(body));
    if (!parsed.success) { respond(400, { error: "Invalid delete commit" }); return; }
    const commit = parsed.data;
    if (rejectCommit || commit.referenceId !== "reference-1" || commit.profileId !== "web"
      || commit.sessionId !== "session-1" || commit.setId !== "set-1" || commit.deletedAt !== 100
      || commit.logicalSessionId !== "logical-session-1" || commit.logicalAnchorId !== "logical-anchor-1"
      || commit.legacySessionId !== "legacy-session-1" || commit.legacyAnchorId !== "legacy-anchor-1") {
      respond(409, { code: "IDEMPOTENCY_CONFLICT", error: "Deletion identity mismatch" });
      return;
    }
    requests.delete("delete-action");
    queued = false;
    respond(200, { ok: true });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const bridge = createBridgeHttpClient({ origin });
  return {
    requests, bridge, origin,
    reject(value: boolean) { rejectCommit = value; },
    async close() {
      bridge.dispose();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

describe("host reference deletion", () => {
  it.each([
    { deleted: true, scope: "pending" as const },
    { deleted: false, scope: "pending" as const },
    { deleted: true, scope: "sent" as const },
    { deleted: false, scope: "sent" as const },
  ])("drains the source delete request after Core returns $scope / deleted=$deleted", async (result) => {
    const source = await sourceFixture();
    const relations = new Set(result.deleted ? ["session-1:set-1:reference-1"] : []);
    const apply = createReferenceDeleteActionHandler({
      async deleteReferenceLink(sessionId, setId, referenceId) {
        if (`${sessionId}:${setId}:${referenceId}` !== "session-1:set-1:reference-1") throw new Error("Core relation identity mismatch");
        relations.delete(`${sessionId}:${setId}:${referenceId}`);
        return result;
      },
    }, source.bridge, "web");
    try {
      await expect(apply(deletion)).resolves.toBe(true);
      expect(relations.size).toBe(0);
      expect(source.requests.size).toBe(0);
      await expect(Promise.all([apply(deletion), apply(deletion)])).resolves.toEqual([true, true]);
      expect(source.requests.size).toBe(0);
    } finally { await source.close(); }
  });

  it("retains the source request when Core rejects another set's reference", async () => {
    const source = await sourceFixture();
    const apply = createReferenceDeleteActionHandler({
      async deleteReferenceLink() { throw new Error("Live reference identity does not match the requested set"); },
    }, source.bridge, "web");
    try {
      await expect(apply({ ...deletion, setId: "wrong-set" })).rejects.toThrow("Live reference identity does not match");
      expect(source.requests.size).toBe(1);
    } finally { await source.close(); }
  });

  it("does not swallow a source identity conflict and can acknowledge a later retry", async () => {
    const source = await sourceFixture();
    const apply = createReferenceDeleteActionHandler({
      async deleteReferenceLink() { return { deleted: false, scope: "pending" }; },
    }, source.bridge, "web");
    try {
      source.reject(true);
      await expect(apply(deletion)).rejects.toMatchObject({ status: 409, code: "idempotency-conflict" });
      expect(source.requests.size).toBe(1);
      source.reject(false);
      await expect(apply(deletion)).resolves.toBe(true);
      expect(source.requests.size).toBe(0);
    } finally { await source.close(); }
  });

  it("leaves browser actions and other profiles for their owning consumer", async () => {
    const source = await sourceFixture();
    const apply = createReferenceDeleteActionHandler({
      async deleteReferenceLink() { throw new Error("This consumer does not own this action"); },
    }, source.bridge, "web");
    try {
      await expect(apply({ ...deletion, profileId: "other" })).resolves.toBe(false);
      await expect(apply({ protocolVersion: 1, type: "deep-link", actionId: "deep-link-action", sessionId: "session-1", anchorId: "anchor-1" })).resolves.toBe(false);
      expect(source.requests.size).toBe(1);
    } finally { await source.close(); }
  });

  it.each(["pending", "sent"] as const)("lets a browser consumer drain an already-deleted %s relation without a Core cleanup job", async (scope) => {
    const source = await sourceFixture();
    let polling: ReferencePollingHandle | undefined;
    const cleanup: Array<() => void | Promise<void>> = [];
    const context = {
      annotationCore: {
        registerSourceAdapter: () => () => {},
        async deleteReferenceLink(sessionId: string, setId: string, referenceId: string) {
          if (`${sessionId}:${setId}:${referenceId}` !== "session-1:set-1:reference-1") throw new Error("Wrong relation");
          return { deleted: false, scope };
        },
      },
      obsidianBridgeLifecycle: {
        bridgeOrigin: source.origin,
        mountWhenReady(_id: string, mount: () => () => void) { return mount(); },
        registerHealthSource(_id: string, value: ReferencePollingHandle) { polling = value; return () => {}; },
      },
      sessions: { list: { getSnapshot: () => ({}) } },
      effect(factory: () => () => Promise<void>) { cleanup.push(factory()); },
    };
    try {
      applyClient(context as unknown as Parameters<typeof applyClient>[0]);
      expect(polling).toBeDefined();
      await polling!.firstCycle;
      expect(source.requests.size).toBe(0);
      expect(polling!.getHealth()).toMatchObject({ state: "receiving", pendingCount: 0 });
    } finally {
      for (const dispose of cleanup) await dispose();
      await source.close();
    }
  });
});
