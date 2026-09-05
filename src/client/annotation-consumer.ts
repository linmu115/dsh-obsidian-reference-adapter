import type { AnnotationCoreClient } from "dsh-annotation-core/client-api";

import { BridgeHttpError, type BridgeHttpClient } from "../bridge/http-client.ts";
import {
  ANNOTATION_PROTOCOL_VERSION,
  type ObsidianReferenceCaptureV2,
  type ReferenceClaimV2,
} from "../protocol.ts";

export interface ObsidianAnnotationCore extends Pick<AnnotationCoreClient, "discardPendingOperation"> {
  addReference(
    sessionId: string,
    source: ObsidianReferenceCaptureV2["source"],
    options: { operationId: string; referenceId: string },
  ): Promise<{ setId: string; referenceId: string; created: boolean }>;
}

export interface ConsumeObsidianReferenceInput {
  capture: ObsidianReferenceCaptureV2;
  signal?: AbortSignal;
  sessionId: string;
  profileId: string;
  annotationCore: ObsidianAnnotationCore | undefined;
  bridge: Pick<BridgeHttpClient, "claimReference">;
  logicalTarget?: {
    readonly logicalSessionId?: string;
    readonly logicalAnchorId?: string;
    readonly legacySessionId?: string;
    readonly legacyAnchorId?: string;
  };
}

export async function consumeObsidianReferenceCapture(input: ConsumeObsidianReferenceInput): Promise<{
  setId: string;
  referenceId: string;
  created: boolean;
}> {
  input.signal?.throwIfAborted();
  if (input.annotationCore === undefined) {
    throw new Error("DSH annotation core is unavailable; the Obsidian reference remains pending");
  }
  const persisted = await input.annotationCore.addReference(input.sessionId, input.capture.source, {
    operationId: input.capture.actionId,
    referenceId: input.capture.referenceId,
  });
  if (input.signal?.aborted) {
    input.signal.throwIfAborted();
  }
  if (persisted.referenceId !== input.capture.referenceId) {
    await input.annotationCore.discardPendingOperation(input.sessionId, input.capture.actionId, { notifySource: false });
    throw new BridgeHttpError(409, "idempotency-conflict", "Core returned a different reference identity");
  }
  const claim: ReferenceClaimV2 = {
    annotationProtocolVersion: ANNOTATION_PROTOCOL_VERSION,
    type: "reference-claim",
    referenceId: persisted.referenceId,
    profileId: input.profileId,
    sessionId: input.sessionId,
    setId: persisted.setId,
    ...(input.logicalTarget ?? {}),
  };
  try {
    if (input.signal === undefined) await input.bridge.claimReference(input.capture.actionId, claim);
    else await input.bridge.claimReference(input.capture.actionId, claim, input.signal);
  } catch (error) {
    if (error instanceof BridgeHttpError && (error.code === "idempotency-conflict" || error.status === 404 || error.status === 410)) {
      await input.annotationCore.discardPendingOperation(input.sessionId, input.capture.actionId, { notifySource: false });
    }
    throw error;
  }
  return persisted;
}

