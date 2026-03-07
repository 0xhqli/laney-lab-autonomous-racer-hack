You are working in this repo/workspace:

c:\Users\jesse\CascadeProjects\laney-lab-autonomous-racer-hack\simulator

Objective (critical):
Fix simulator data flow so ALL users’ online runs are persisted to shared backend storage and contribute to model training. Current behavior appears localStorage-based and not globally aggregated.

Do not produce emojis in code, comments, UI, logs, or messages.

Context:
- Production URL: https://laney-lab-autonomous-racer-hack-production.up.railway.app
- Current symptom: homepage/dashboard run totals are inconsistent and not reliably global.
- We need server-authoritative persistence + aggregation + training dataset usage.

Deliverables:
1) Implement server-side run ingestion and storage
2) Implement shared stats endpoints
3) Switch client/dashboard/training to read from shared backend (not localStorage as source of truth)
4) Add validation proving runs from different users are counted and used for training

Implementation requirements:
1. Discover current data flow
   - Locate run logging, dashboard stats rendering, and training dataset source.
   - Identify any localStorage keys and all places they are read/written.
   - Keep localStorage only as optional cache/fallback, never source of truth for global counts.

2. Add/confirm backend API routes
   - POST /api/runs (or existing equivalent): accepts completed run payload
   - GET /api/runs: returns paginated/filterable shared runs
   - GET /api/stats: global aggregate stats (runs, laps, frames, best lap, etc.)
   - Ensure robust validation and error handling.

3. Shared persistence
   - Persist run metadata + frames in shared storage (DB and/or object storage pointer).
   - Include user/session identifiers, timestamps, track, drive mode, lap stats.
   - Ensure schema/indexes support aggregate queries and training exports.

4. Client integration
   - On run/lap completion, upload to backend and mark sync status.
   - Dashboard must fetch from backend endpoints for totals and run lists.
   - Keep UX resilient for transient failures (retry queue allowed), but backend remains authoritative.

5. Training integration
   - Training job creation must use shared persisted dataset, not browser-only data.
   - Record which run IDs (or dataset version snapshot) were used for each training job.

6. Verification + proof
   - Add checks/tests or scripted verification:
     a) Submit a run from one client/session.
     b) Verify totals update on another client/session.
     c) Verify training job includes newly uploaded run IDs.
   - Add brief docs section explaining data flow and source of truth.

Coding constraints:
- Keep changes focused and minimal; preserve existing app style.
- Do not add unrelated refactors.
- If migrations are needed, include them and document apply steps.
- Update README/docs with exact setup/env requirements.
- No breaking changes to existing simulator controls/UI behavior.

Output format expected:
1) What was root cause
2) Files changed with concise purpose per file
3) API contract summary (request/response examples)
4) How to run locally and validate multi-user aggregation
5) Deployment notes for Railway (env vars, migration steps)
6) Any remaining risks/TODOs

Start now by:
- Mapping current run save/load + training code paths
- Then implement backend persistence and wire clients to it
- Then verify with end-to-end proof
