# Pastickfight Admin Failure Report

## Scope
This report documents the current regression observed on the `/admin` maintenance UI when attempting to create Players or Arenas in the production Firebase project `pastickfight-472521`.

## Reproduction Steps
1. Deploy or serve the current `public/` bundle and open `/admin` in a Chromium-based browser.
2. Wait for the header status to change from “Loading Firebase…” to the resolved project identifier, confirming `initializeApp` succeeded.
3. In the **Admin — Players** form, populate the inputs (e.g., name `Test User`, code `ABC123`) and submit. Repeat in **Admin — Arenas** with sample data (e.g., name `Test Arena`, code `ARENA1`).
4. Observe both forms return immediate errors; the diagnostic textarea simultaneously captures the failure events.

## Observed Behaviour
* Player create attempts display `Failed to add player: permission-denied · Missing or insufficient permissions.`
* Arena create attempts display `Failed to add arena: permission-denied · Missing or insufficient permissions.`
* Health write check (`Diag → Write test`) emits the same Firestore rejection.

## Diagnostic Log Excerpts
```
2024-06-01T18:22:07.145Z config.fetch.start
2024-06-01T18:22:07.348Z config.fetch.ok {"projectId":"pastickfight-472521"}
2024-06-01T18:22:07.352Z app.init.ok {"projectId":"pastickfight-472521"}
2024-06-01T18:22:07.361Z firestore.ready {"projectId":"pastickfight-472521"}
2024-06-01T18:22:22.914Z players.add.submit {"code":"ABC123"}
2024-06-01T18:22:23.127Z players.add.err {"code":"ABC123","errCode":"permission-denied","errMsg":"Missing or insufficient permissions."}
2024-06-01T18:22:39.410Z arenas.add.submit {"code":"ARENA1"}
2024-06-01T18:22:39.611Z arenas.add.err {"code":"ARENA1","errCode":"permission-denied","errMsg":"Missing or insufficient permissions."}
2024-06-01T18:23:01.502Z health.write.err {"code":"permission-denied","message":"Missing or insufficient permissions."}
```

## Root Cause Analysis
* Firestore rejects every write with `permission-denied`, indicating the project currently enforces security rules that disallow unauthenticated clients. The admin UI is unauthenticated and relies on client-side rules permitting direct writes; those rules are presently locked down to `false` (or equivalent) which blocks the admin surface.
* No App Check token is attached to these requests; however, the rejection occurs before App Check evaluation, so the immediate blocker is Firestore access, not App Check enforcement.

## Fix Plan
1. **Firestore Rules:** Update and publish Firestore security rules to explicitly allow the admin UI (e.g., by gating on an admin auth mechanism, or temporarily allowing reads/writes from the Admin environment) or deploy callable Cloud Functions that perform privileged writes.
2. **Provisioning Check:** Verify Firestore is fully provisioned in Native mode for project `pastickfight-472521`. Confirm the database exists and is not in a locked “never published rules” state.
3. **Longer-Term Hardening:** Once write access is restored, integrate Firebase Authentication (or an admin-only API) plus App Check enforcement so future rule tightening will not block management tools.

## Current Firebase Controls
* **Firestore Rules:** Default deny (no read/write) — requires update to permit admin operations.
* **App Check:** Not integrated/enforced in the admin UI; no App Check token is requested or sent by the frontend.
