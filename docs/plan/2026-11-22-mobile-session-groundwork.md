# Android Cooking Sessions Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task after review.
> This is preparatory work against the merged Phase 8–9 contract; it does not close Phase 12 or start final Phase 13 acceptance.

**Goal:** Prepare an Android Expo cooking-session flow that creates/resumes a server-owned session and controls steps safely while the team implements chat and the web assistant.

**Architecture:** Reuse the generated types and `createApi` methods from `packages/cooklens-api`.
A small native-independent controller owns request cancellation, pending operations and accepted session state; React Native owns presentation/lifecycle, and a SecureStore adapter owns the last-session pointer.
The backend remains the authority for recipe snapshots, step transitions, expiry and versions.

**Tech stack:** Existing Expo SDK 58, React Native 0.88.1, TypeScript and Node's built-in test runner.
Proposed addition: SDK-compatible `expo-secure-store` for the session capability identifier.
No new test framework, backend, chat provider or navigation framework.

**Spec:** [Phase 12](phase-12-mobile.md), [Phase 8 decisions](phase-08-foundation.md), [Phase 9](phase-09-sessions.md), and the assistant-session section of [API contract](../contracts/mvp-v1.md).
Read these from the integrated Phase 8–9 source before execution; the current preparation checkout has not yet incorporated that source.

## Execution record

The preparation branch now includes PR #21.
The superseded local Expo setup files are preserved in a local stash.
Tasks 1–3 produced the storage adapter, session controller, screen and test command.
The screen owns lifecycle cancellation through `leave()` and calls `foreground()` for a GET refresh.
Opening a recipe fetches the saved pointer first and restores a matching active session.
The Phase 12 results contain a device checklist and the Phase 13 results identify the remaining dependencies.
The scanner rejects the regenerated npm integrity metadata, so CI readiness remains open.

## Scope and delivery boundary

- Implement this session-only slice on `codex/phase12-13-prep`; preserve existing setup edits.
- Allow local development/checks against the merged session API, without treating this as permission to close the roadmap's Phase 11 dependency.
- Entry from recipe detail, resume, current-step display, start/next/previous/repeat/finish, loading/errors and explicit retry are in scope.
- Chat composition/sending, provider changes, shared message-version semantics, new release images, registry publication and full assistant acceptance remain deferred.
- Display truthful copy that chat is not available in this slice; step controls must work without a provider/key.
- Do not modify shared API contracts, generated schemas, backend state rules or Phase 10–11 files to suit the mobile UI.
- No commit/push unless subsequently requested; do not mark full Phase 12 or Phase 13 complete.

## Global constraints

- Android 10+ on a real device, Expo Go SDK 58; iOS acceptance and APK/store builds are outside this delivery.
- One public gateway for web/mobile; no direct AI/Qdrant calls and no key in client configuration.
- Session lifetime is 24 hours; `ready` starts at step 0; cooking steps are 1-based.
- Actions are `start`, `next`, `previous`, `repeat`, `finish`; the server decides the resulting step/version.
- There are at most 100 action events; the last slot is reserved for `finish`.
- Retry the same operation with the same body/operation ID; never automatically retry a POST.
- On conflict, fetch current server state before allowing a new operation; do not silently rebase and resend.
- Accept a response only for the active screen/session generation and with a version at least as new as the displayed state.
- Keep the server's recipe/corpus snapshot when resuming an older valid session.
- Persist only a session pointer scoped to the configured gateway; no image, recipe snapshot, chat, API key or pending POST body in device storage.
- The session ID grants access to the session: do not log it, place it in share links or include it in screenshots/reports.
- Keep plans in `docs/plan`; results stay in the existing phase file, with aggregate acceptance numbers in `docs/acceptance.md`.
  Do not add an evidence directory or claim native coverage from browser emulation.

## Review focus

| Failure mode | Required behavior | Owning task |
| --- | --- | --- |
| A request succeeds server-side but its response is lost | Explicit retry keeps operation/body; one gesture does not become two actions | 2 |
| Old response arrives after recipe switch, Back or app background | Ignore it; no stale screen/state or persisted pointer replaces the new selection | 2–3 |
| Stored ID belongs to another gateway, is malformed or storage fails | Do not send it to a different gateway; show a recoverable state and never fall back to plaintext storage | 1–3 |
| Another client advances or finishes the session | Handle 409 by refreshing; do not overwrite a newer version or auto-retry with a new operation | 2 |
| App is killed/reopened or session expires | Restore by GET after explicit resume; 404/410 clears the matching pointer, while network failure preserves it for retry | 2–4 |

## Task 1: Integrate the merged baseline and add bounded session-pointer storage

**Files:** `mobile/package.json`, `mobile/package-lock.json`; create `mobile/src/assistant/session-pointer.ts` and `mobile/src/assistant/session-pointer.test.mjs`.

**Interfaces:**
- Consume `AssistantSession`, `RecipeDocument`, `AssistantAction` and the existing create/get/action methods from the integrated shared client.
- Produce `SessionPointer = { gateway: string; sessionId: string }` and `SessionPointerStore` with `read(gateway): Promise<SessionPointer | null>`, `write(pointer): Promise<void>`, `clear(gateway, sessionId): Promise<void>`.
- `createSessionPointerStore(storage)` takes a minimal injected port matching SecureStore's `getItemAsync`, `setItemAsync`, `deleteItemAsync`.
  The module does not import React Native so its tests run in Node.

- [ ] Preserve the existing setup edits, reconcile them against the equivalent Expo patch updates already merged upstream, and incorporate `origin/develop` without a destructive reset.
  Retain npm integrity metadata; do not strip it or change scanner policy as an incidental step.
  If its previously recorded policy conflict remains, report it as a commit/CI readiness issue rather than bypassing the approval rejection.
- [ ] Write storage tests first: valid pointer round-trip, malformed JSON/UUID ignored, another gateway returns null, native read/write rejection surfaces, and clearing old pointer A cannot erase newer pointer B.
  Add an ordered-write test in which delayed save A completes before queued save B and the final saved pointer is B.
- [ ] Run `node --experimental-strip-types --test mobile/src/assistant/session-pointer.test.mjs`.
  Expected before implementation: failure to import the missing module.
- [ ] Install SecureStore using the installed SDK's `expo install expo-secure-store` compatibility selection.
  Use the documented async methods without biometric authentication or a custom native build.
- [ ] Implement the adapter with one versioned storage key `cooklens.active-session.v1`, validating/canonicalizing the absolute gateway URL and UUID.
  Serialize read/modify/write operations so a late cleanup cannot erase a newly selected session.
  Keep storage failures distinct from API failures; never print the pointer value.
- [ ] Rerun the storage tests, then mobile typecheck and `expo install --check`.
  Expected: tests, TypeScript and dependency compatibility pass; a metadata policy failure, if any, is recorded separately.

SecureStore is included in Expo Go and uses encrypted Android storage.
Reference: [official Expo SecureStore documentation](https://docs.expo.dev/versions/latest/sdk/securestore/), checked 2026-11-22.

## Task 2: Implement server-owned session operations and recovery

**Files:** create `mobile/src/assistant/session-controller.ts` and `mobile/src/assistant/session-controller.test.mjs`.

**Interfaces:**
- Consume Task 1's pointer store and `Pick<ReturnType<typeof createApi>, 'createSession' | 'getSession' | 'sessionAction'>`.
- Produce `createCookingSessionController({ api, store, gateway, operationId })`.
  `operationId(): string` is injected and bound to `expo-crypto` by the app.
- Public methods include `openRecipe(document: RecipeDocument)`, `resume()`, `act(action: AssistantAction)`, `retry()`, `suspend()`, `leave()`, `foreground()`, `subscribe(listener)` and `getSnapshot()` for React's `useSyncExternalStore`.
  Request methods return `Promise<void>`; cancellation/subscription methods are synchronous.
- Snapshot fields: `session: AssistantSession | null`, `busy: null | 'create' | 'restore' | 'action' | 'refresh'`, `error: { message: string; code?: string; retryable: boolean } | null`, `storageWarning: string | null`.

- [ ] Write tests before implementation using Node `test`/`assert`, injected fake API/storage and deferred promises.
  Build recipe/session inputs from the existing corpus and contract; do not add static snapshots or a second taxonomy.
- [ ] Assert create sends exactly `{recipe_id, corpus_version, operation_id}` from `RecipeDocument`; no recipe/state goes in the request.
  Replay create may return an already-started session, so do not require version 0 on success.
- [ ] Assert two rapid actions send at most one POST; timeout/retry sends the identical action, expected version and operation ID.
  After 409, one GET refreshes state, with no automatic replacement POST.
- [ ] Assert a late A response cannot replace B, a lower-version response cannot roll back the display, and cancellation still works when a fake transport ignores its abort signal.
- [ ] Assert resume uses GET only, preserves an older valid corpus snapshot, clears only matching expired/missing pointers, and retains the pointer on network/storage 503.
  A persistence failure must preserve the usable in-memory session and show a warning that restart recovery was not saved.
- [ ] Assert background/resume never resends a POST automatically.
  While the process remains alive, an uncertain operation can only be retried explicitly with its original payload; after process death, resolve known sessions by GET.
  A create whose response was never received cannot be recovered across process death from a session ID alone; do not promise otherwise or silently create again on startup.
- [ ] Run `node --experimental-strip-types --test mobile/src/assistant/session-controller.test.mjs` and observe the missing-module failure.
- [ ] Implement one owner for the in-flight request, generation and pending retry payload.
  Use backend error codes and accepted server responses; do not duplicate the backend transition algorithm or change shared-client validation for future chat.
- [ ] Run both assistant test files and existing shared-client tests.
  Expected: all pass, including the five review-focus cases.

## Task 3: Wire the Android cooking screen and lifecycle

**Files:** create `mobile/src/assistant/CookingSessionScreen.tsx`; modify `mobile/App.tsx`, `mobile/package.json`, `.github/workflows/mobile.yml` and `mobile/README.md`.

**Interfaces:**
- `CookingSessionScreen({ controller, onBack })` consumes Task 2's snapshot/controller; the app binds Task 1's store to `expo-secure-store`.
- `App.tsx` retains the existing upload/prediction/search/navigation flow and uses `getRecipeDocument` when opening recipe detail.
  Starting a session is a separate explicit button, not an automatic side effect of opening a recipe.

- [ ] Add controller tests for the lifecycle wiring requirements before changing the screen: leaving invalidates outstanding work; re-entering an existing session refreshes via GET without creating again.
  Run the targeted tests and verify the missing behavior fails before implementing it.
- [ ] Add the Vietnamese entry “Hướng dẫn nấu” on recipe detail and a “Tiếp tục phiên nấu” resume action on the initial screen.
  Resume first fetches and displays the server recipe title/state; it must not assume the previously browsed recipe is the saved session's recipe.
- [ ] Show the server recipe title/source, status, current step/total, instruction and controls.
  Use explicit start and finish; disable impossible/busy controls and normal actions after 99 events while allowing finish.
  Repeating a step displays its text without introducing voice support.
- [ ] Bind Back/unmount/background to cancellation; returning to foreground refreshes an active session using GET only.
  Back leaves the session resumable rather than finishing it server-side.
  Never auto-upload an image or send/create an operation on foreground.
- [ ] Keep safe-area and scroll behavior, large-text wrapping, descriptive accessibility labels and focus/announcements for step changes.
  On 404/410 show an explicit option to create a new session; on 409 display refreshed state before another action.
  Storage failure displays the Task 2 warning without breaking cooking controls.
- [ ] Show “Hỏi đáp sẽ được bổ sung sau” as informational text only; no chat input, fake model response or change to `sessionMessage` yet.
- [ ] Add `test:assistant` to mobile scripts for the two Node test files and invoke it in the existing mobile workflow.
  Keep workflow paths/jobs and existing client/typecheck/export checks; do not start release jobs.
- [ ] Run assistant/shared-client tests, mobile typecheck, Expo compatibility and Android bundle export.
  Expected: all pass; bundle success is recorded as build evidence, not device acceptance.
- [ ] Verify upload → prediction → recipe still compiles and no generated native output is tracked.
  Update README with Android-only session usage and the truthful chat limitation.

## Task 4: Record the Android handoff and prepare the remaining acceptance work

**Files:** update `docs/plan/phase-12-mobile.md` and this plan's task state.
Use `docs/plan/phase-13-acceptance.md` only for a brief readiness note; preserve its release gates.

- [ ] Record commands/results for this preparatory slice and the exact source/contracts tested.
  Leave full Phase 12 completion and readiness-for-Phase-13 boxes unchecked while Phase 10–11/native gates remain open.
- [ ] Prepare the following manual Android matrix in the Phase 12 result section; each row starts as not run.

| Device check | Expected outcome |
| --- | --- |
| Image → recipe → start → next/previous/repeat → finish | Correct server snapshot/step; no doubled action or automatic finish at the last step |
| Rapid taps and interrupted action response | One action; explicit retry cannot advance twice |
| Back/background during pending work | No stale screen update or automatic POST on return |
| Force-close and explicit resume | Known session restores correct snapshot/step by GET; lost create response is not claimed recoverable |
| Network failure, 409, 404 and 410 | Clear retry/refetch/new-session states without losing unrelated saved sessions |
| Changed gateway or SecureStore failure | No pointer sent to another server; truthful recovery warning, no plaintext fallback |
| Large text, TalkBack, safe area and existing photo picker | Usable controls/labels with no regression to upload or navigation |

- [ ] Run document-link, whitespace and metadata checks; inspect the diff for generated files, secrets and shared-contract changes.
  Do not mark the entire scanner green while the known local lockfile policy conflict is unresolved.
- [ ] List the Phase 13 inputs that still need the other team: final message/version behavior, 25-second client timeout, confirmed provider/model, runtime LLM networking/key configuration and the web assistant.
  Reuse their SQLite persistence checks and existing CV/retrieval/runtime harnesses; do not duplicate those suites now.
- [ ] Record the future candidate requirement: a new version built from integrated assistant source, then clean pull, native/web multi-turn tests, 30 single-turn/3 multi-turn evaluation, backup/restore and rollback checks.
  `2.0.0-rc.2` and old measurements cannot satisfy these gates.

## Verification commands for execution

Run from the repository root unless specified; use the local tools helper when needed.

```powershell
. .\.venv-build\enter-tools.ps1
node --experimental-strip-types --test mobile/src/assistant/session-pointer.test.mjs mobile/src/assistant/session-controller.test.mjs
node --experimental-strip-types --test packages/cooklens-api/client.test.mjs
npm.cmd --prefix mobile run typecheck
Push-Location mobile
npx.cmd --no-install expo install --check
npx.cmd --no-install expo export --platform android --no-bytecode
Pop-Location
python deploy/scripts/check_public_metadata.py
git diff --check
git status --short
```

These are planned checks, not results claimed by this document.
This planning turn installs nothing, changes no application code and makes no API calls.
Inline implementation is recommended because the tasks share controller/storage interfaces and one mobile app entry point.
At delivery, report what passed, device checks still missing and dependencies still deferred; request no routine provider or backend redesign decisions from the user.
Cleanup of project-local tools/cache/checkout remains an end-of-project step after the finished work is safely delivered, not part of this slice.
