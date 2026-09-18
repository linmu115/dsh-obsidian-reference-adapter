# Bridge integration — 2026-09-18

## Result

The supported runtime is Annotation Core + dsh-obsidian-bridge-lifecycle 0.4.0-rc2.1 + Sticker. Existing package and service names remain unchanged. The old reference adapter 0.3.5-rc2.1 is a capability-checked compatibility shell: it cannot register a source, create a transport, or start a second receiver, and reports the required Bridge upgrade on older runtimes.

Bridge owns one transport/action pump per controller or surface, reference source registration, capture/claim delivery, deletion confirmation, logical/native location resolution, and the independent Obsidian health sidebar. Its borrowed transport excludes cursor, acknowledgement and disposal operations. Sticker registers its existing ordinary-navigation handler and readiness/sync hooks. Reference handoff accepts business prepare/commit callbacks and delegates durable add/fencing/compensation to Core.

The pump preserves instance, profile and target-surface ownership; foreign-profile actions are ignored without acknowledgement rather than filling the retry queue. Ordinary navigation retains one-shot/coalesced-click behavior. Successful work whose acknowledgement fails retries only that acknowledgement. Reference retries retain their existing independent cursor positions, queue-epoch reset and cancellation behavior.

## Validation

- Bridge: TypeScript typecheck, declaration generation and host/browser/transport bundles passed. Vitest: 14 files, 79 tests passed.
- Compatibility adapter: TypeScript typecheck, declaration generation and host/browser bundles passed. Vitest: 2 files, 3 tests passed.
- Bridge regressions include migrated capture compensation, source preparation, deletion HTTP, SM resolver and viewer tests; common dispatcher ownership, profile filtering and ack retry; callback handoff compensation; ordinary navigation coalescing/invalid targets; and real Cordis host/surface fibers without Core or SM, with Core late attachment, unload and reload.
- Dependency validation uses the local Core 0.3.12-rc2.19 source cohort. The initial existing pnpm auto-install restored an old Core tarball alias; that alias was backed up and replaced with the intended local source junction. Subsequent validation invokes tools directly and does not install or deploy.
- Both lib directories were verified as ordinary directories within the owned repositories before rebuild. Bridge output was cleaned. Automatic review rejected the Adapter recursive output cleanup without a detailed reason; its previous output was instead retained in the same repository at node_modules/.adapter-lib-before-integration and the normal lib output rebuilt. No running profile, real session, Vault, Obsidian instance, or production configuration was changed.

## Boundaries and risks

No Vault binding, multi-Vault routing, new interaction workflow, future generic notes channel or replacement SM adapter is included. SM is optional; existing resolver semantics are preserved, and unresolved logical targets wait instead of being rebound to arbitrary native sessions. Core is optional for Bridge connection/health startup; reference functionality waits for its service. The relocated health panel was built but not visually exercised in a live UI. Cross-repository Suite assembly and release packaging remain the parent task's responsibility. No push or deployment was performed.
