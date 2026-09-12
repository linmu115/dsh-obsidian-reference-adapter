import type { BridgeAction, BridgeHttpClient } from "./http-client.ts";

type CoreDeletionCapability = {
  deleteReferenceLink: (
    sessionId: string,
    setId: string,
    referenceId: string,
  ) => Promise<{ deleted: boolean; scope: "pending" | "sent" }>;
};

type ReferenceDeleteAcknowledger = Pick<BridgeHttpClient, "deleteCommittedReference">;

/** Confirm durable cross-app deletion identically from host and browser consumers. */
export function createReferenceDeleteActionHandler(
  core: CoreDeletionCapability,
  bridge: ReferenceDeleteAcknowledger,
  profileId: string,
  options: { dshInstanceId?: string; resolveSession?: (action: BridgeAction) => Promise<string | undefined> } = {},
): (action: BridgeAction) => Promise<boolean> {
  return async (action) => {
    if (action.type !== "reference-delete-request" || action.profileId !== profileId) return false;
    if (action.dshInstanceId !== undefined && action.dshInstanceId !== options.dshInstanceId) return false;
    const sessionId = options.resolveSession === undefined ? action.sessionId : await options.resolveSession(action);
    if (sessionId === undefined) return false;
    await core.deleteReferenceLink(sessionId, action.setId, action.referenceId);
    // A duplicate request can outlive Core's cleanup job or the entire relation.
    // Confirm every successful deletion using the source request's exact identity.
    await bridge.deleteCommittedReference({
      annotationProtocolVersion: action.annotationProtocolVersion,
      type: "reference-delete-commit",
      referenceId: action.referenceId,
      profileId: action.profileId,
      sessionId: action.sessionId,
      setId: action.setId,
      deletedAt: action.requestedAt,
      ...(action.dshInstanceId ? { dshInstanceId: action.dshInstanceId } : {}),
      ...(action.logicalSessionId ? { logicalSessionId: action.logicalSessionId } : {}),
      ...(action.logicalAnchorId ? { logicalAnchorId: action.logicalAnchorId } : {}),
      ...(action.legacySessionId ? { legacySessionId: action.legacySessionId } : {}),
      ...(action.legacyAnchorId ? { legacyAnchorId: action.legacyAnchorId } : {}),
    });
    return true;
  };
}
