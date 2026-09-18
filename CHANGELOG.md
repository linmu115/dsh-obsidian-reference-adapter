## 0.3.5-rc2.1 — 2026-09-18

## 0.3.5-rc2.2 — 2026-09-18

- Accept the Protocol 0.4.0 binding cohort while retaining the integrated Bridge capability guard.

Replace the independent receiver with an explicit capability-checked compatibility shell for the integrated Bridge.

See [integration report](docs/changes/2026-09-18-bridge-consolidation.md).

# Changelog

## 0.3.4-rc2.3 — 2026-09-13

- Accept Core 0.3.12-rc2.1 and Lifecycle 0.3.3-rc2.3 alongside the previous RC2 peers.
- Build with the Core 0.3.12-rc2.1 protocol while preserving the existing data formats.
- Keep existing runtime behavior; P2 session stickers and Obsidian data migration are not part of this release.
- Validation and its limits are recorded in docs/changes/2026-09-13-upstream-core-compatibility.md.

## 0.3.4-rc2.2 — 2026-09-12

Complete instance scope across durable capture, authenticated Core deletion, persisted reference ownership and Sticker backlink transport/matching. Legacy unscoped data remains unchanged. See deployment evidence for the tested combination.


## 0.3.4-rc2.1 — DSH 0.1.5-rc.2 (2026-09-12)

28 tests passed. Capture, navigation and deletion resolve logical/legacy IDs through the current instance Maintenance service. Delete the resolved native relation, then acknowledge the original source identity. Unresolved logical references remain pending; another explicit instance is ignored.


## 0.3.3 - 2026-09-07

- Share exact-identity deletion confirmation between host and browser consumers before acknowledging the Bridge action. Pending tombstones and already-absent relations now drain the source delete outbox through the existing delete-commit endpoint.
- Preserve optional logical and legacy relation identifiers, duplicate acknowledgement safety and visible identity conflicts.

## 0.3.2 - Unreleased

- Retain temporarily unhandled references for bounded independent retry; wake on session availability and visibility changes without acknowledging sibling-owned actions.
- Cancel stopped polling, ignore late responses, preserve retryable Core adds, and roll back definitive losing claims without cancelling the winning source reference.
- Use the lifecycle transport and shared Protocol data schemas, inherit the lifecycle origin by default, and register delivery health and retry controls.

## 0.3.1 - 2026-09-04

- Rebuild against the RC1 Core and Cordis type baseline.
- Preserve source registration, one-shot surface-targeted navigation,
  immediate local deletion, background Core cleanup, and logical-session
  resolution without changing the Bridge or Annotation Core public contracts.
- Resolve RC1 Core and lifecycle development types from public full commits;
  clean-checkout verification no longer depends on sibling worktrees.
