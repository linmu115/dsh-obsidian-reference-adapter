export {
  ANNOTATION_PROTOCOL_VERSION,
  BacklinkCommitV2Schema,
  BacklinkReceiptV2Schema,
  ObsidianNoteReferenceSourceSchema,
  ObsidianReferenceCaptureV2Schema,
  ReferenceClaimV2Schema,
  ReferenceDiscardV2Schema,
  ReferenceDeleteCommitV2Schema,
  ReferenceDeleteRequestV2Schema,
  ReferenceRefreshRequestV2Schema,
  ReferenceRefreshResultV2Schema,
  canonicalSha256,
  documentHash,
  selectedTextHash,
} from "dsh-annotation-core/protocol";
export type {
  BacklinkCommitV2,
  BacklinkReceiptV2,
  ObsidianNoteReferenceSource,
  ObsidianReferenceCaptureV2,
  ReferenceClaimV2,
  ReferenceDiscardV2,
  ReferenceDeleteCommitV2,
  ReferenceDeleteRequestV2,
  ReferenceRefreshRequestV2,
  ReferenceRefreshResultV2,
} from "dsh-annotation-core/protocol";

export * from "dsh-obsidian-bridge-protocol/data";
