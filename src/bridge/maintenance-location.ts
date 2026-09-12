/** Current-instance resolution shared by navigation, capture and deletion. */
export interface ReferenceLocation {
  readonly sessionId: string;
  readonly anchorId?: string | undefined;
  readonly logicalSessionId?: string | undefined;
  readonly logicalAnchorId?: string | undefined;
  readonly legacySessionId?: string | undefined;
  readonly legacyAnchorId?: string | undefined;
}
export interface ResolvedReferenceLocation {
  readonly sessionId: string;
  readonly anchorId?: string | undefined;
  readonly logicalSessionId?: string | undefined;
  readonly logicalAnchorId?: string | undefined;
}
export function maintenanceLocationRequest(location: ReferenceLocation) {
  return { operation: "reference:resolve" as const, referenceType: "obsidian-reference" as const,
    logicalSessionId: location.logicalSessionId ?? null, logicalAnchorId: location.logicalAnchorId ?? null,
    legacyNativeSessionId: location.legacySessionId ?? location.sessionId,
    legacyNativeAnchorId: location.legacyAnchorId ?? location.anchorId ?? null };
}
export function resolvedReferenceLocation(value: unknown): ResolvedReferenceLocation | undefined {
  const envelope = value as { referenceResolution?: { status?: string | undefined; nativeSessionId?: string | undefined; nativeAnchorId?: string | null;
    logicalSessionId?: string | null; logicalAnchorId?: string | null } };
  const result = envelope?.referenceResolution;
  if (result?.status !== "resolved" || typeof result.nativeSessionId !== "string" || !result.nativeSessionId) return undefined;
  return { sessionId: result.nativeSessionId,
    ...(result.nativeAnchorId ? { anchorId: result.nativeAnchorId } : {}),
    ...(result.logicalSessionId ? { logicalSessionId: result.logicalSessionId } : {}),
    ...(result.logicalAnchorId ? { logicalAnchorId: result.logicalAnchorId } : {}) };
}
export async function resolveMaintenanceLocation(location: ReferenceLocation, fetchImpl: typeof fetch = fetch): Promise<ResolvedReferenceLocation | undefined> {
  const response = await fetchImpl("/dsh-session-maintenance/api", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(maintenanceLocationRequest(location)),
  });
  if (!response.ok) {
    if (response.status === 404 && !location.logicalSessionId) return undefined;
    throw new Error(`Reference location resolver is unavailable (${response.status})`);
  }
  return resolvedReferenceLocation(await response.json());
}
