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
): (action: BridgeAction) => Promise<boolean> {
  return async (action) => {
    if (action.type !== "reference-delete-request" || action.profileId !== profileId) return false;
    await core.deleteReferenceLink(action.sessionId, action.setId, action.referenceId);
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
      ...(action.logicalSessionId ? { logicalSessionId: action.logicalSessionId } : {}),
      ...(action.logicalAnchorId ? { logicalAnchorId: action.logicalAnchorId } : {}),
      ...(action.legacySessionId ? { legacySessionId: action.legacySessionId } : {}),
      ...(action.legacyAnchorId ? { legacyAnchorId: action.legacyAnchorId } : {}),
    });
    return true;
  };
}
