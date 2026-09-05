# Changelog

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
