# PROJECT_MAP

## Purpose
RepoSentinel is a local-first security scanner for Git repositories and uploaded ZIP projects.

Architecture goals:
- deterministic scanning first
- AI only as escalation/explanation
- graceful degradation when OpenAI or external scanners are unavailable

## Top-level structure
```text
backend/   Express + TypeScript + SQLite + scan engine
frontend/  React + Vite + TypeScript operator UI
shared/    shared contracts/types used by backend + frontend
docs/      optional notes
```

## Runtime flow
1. Frontend starts a scan from `frontend`.
2. Backend clones a repo or extracts an uploaded ZIP into temp workspace.
3. Backend enumerates files and runs deterministic detectors.
4. Findings are normalized into shared schema.
5. Risk score and scan summary are computed.
6. AI is called only when enabled and necessary.
7. Scan report is stored in SQLite.
8. Frontend loads history/dashboard/results via REST and SSE.

## Shared layer
Location: `shared/src/index.ts`

This is the contract source of truth.
Contains:
- scan/report types
- finding schema
- AI review / AI triage types
- settings/dashboard response types
- language enums and common API payload types

When changing data shape between backend and frontend, update `shared` first.

## Backend map
### Entry points
- `backend/src/index.ts`: backend bootstrap
- `backend/src/app.ts`: Express app, routes, API wiring

### Important folders
- `backend/src/config/`
  - env loading and app configuration
- `backend/src/db/`
  - SQLite schema, persistence helpers, migrations-in-place
- `backend/src/services/scanners/`
  - scan orchestration
  - detector execution
  - finding normalization and dedupe
- `backend/src/services/scanners/detectors/`
  - deterministic detectors
  - examples: secret, encoded payload, suspicious command, workflow, binary artifact, filename risk, key material
- `backend/src/services/ai/`
  - OpenAI validation
  - AI review / finding explanation / triage
  - should never replace deterministic detection
- `backend/src/services/report/`
  - JSON/HTML/PDF export generation
- `backend/src/services/git/`
  - clone/extract source into temp workspace
- `backend/src/utils/`
  - formatting, temp cleanup, confidence normalization, file helpers

### Backend data flow
- routes in `app.ts` call service layer
- scanner returns normalized `ScanReport`
- DB persists scans/findings/AI/settings
- exports read stored report data, not raw temp workspace

### Backend design rules
- detector output should be structured and explainable
- confidence should be numeric `0..1`
- category should be explicit, not `other`
- AI is optional and cached where possible
- temp workspaces under backend temp area should be cleaned after scan

## Frontend map
### Entry points
- `frontend/src/main.tsx`: app mount + global CSS import
- `frontend/src/App.tsx`: top-level layout coordination and main tab/page switching

### Important folders
- `frontend/src/api/`
  - backend client wrapper
- `frontend/src/hooks/`
  - app-level state orchestration
  - `useRepoSentinelApp.ts` is the main frontend state hub
- `frontend/src/pages/`
  - top-level screens
  - current pages: overview, new scan, live scan, analytics, history, settings
- `frontend/src/components/`
  - reusable UI blocks
  - important: `AppShell`, `LivePanel`, `ScanFormCard`, `HistoryPanel`, `SettingsPanel`, `AnalyticsPanel`
- `frontend/src/data/`
  - static UI config and localized copy
- `frontend/src/types/`
  - UI-local types only
- `frontend/src/utils/`
  - formatters and label helpers
- `frontend/src/styles/app.css`
  - global app styling

### Frontend state ownership
- `App.tsx`
  - only main tab selection and page composition
- `useRepoSentinelApp.ts`
  - fetch bootstrap data
  - selected scan
  - history query
  - language
  - settings save/validate flow
  - scan submission/rescan/delete
  - AI explanation cache for selected findings
- page/component local state
  - only UI-local concerns such as filters or panel toggles

## Current UI page map
- Overview
  - summary stats
  - scan form
  - compact live panel
  - compact history
  - compact settings
- Quet moi / New scan
  - start repo or ZIP scan
- Quet truc tiep / Live scan
  - active or selected scan details
  - findings, AI analysis, largest files
- Thong ke / Analytics
  - scan list, token usage, filters/sorting, CSV export
- Lich su / History
  - searchable scan history with rescan/delete
- Cai dat / Settings
  - thresholds, AI config, model, validation

## Files worth opening first
If you are a future agent, read in this order:
1. `AGENTS.md`
2. `PROJECT_MAP.md`
3. `shared/src/index.ts`
4. `backend/src/app.ts`
5. `backend/src/services/scanners/scanEngine.ts`
6. `frontend/src/hooks/useRepoSentinelApp.ts`
7. `frontend/src/App.tsx`
8. relevant page/component files only after that

## Common change recipes
### Add a new detector
1. Create/update detector in `backend/src/services/scanners/detectors/`
2. Normalize finding shape through shared schema
3. Register detector in scan engine
4. Update category / recommendation / severity mapping if needed
5. Add backend tests
6. Verify frontend already renders the structured fields

### Change finding data shape
1. Update `shared/src/index.ts`
2. Update backend serializer/storage
3. Update frontend client types if needed
4. Update UI rendering in `LivePanel` and related components

### Change AI behavior
1. Keep deterministic detectors as source of truth
2. Prefer shorter prompts and cached results
3. Update AI parsing so output stays structurally stable
4. Never make OpenAI mandatory for scan completion

## Known large files
These are still comparatively dense and are the first candidates for future refactor if needed:
- `backend/src/services/scanners/scanEngine.ts`
- `backend/src/services/ai/openAiReviewService.ts`
- `frontend/src/components/LivePanel.tsx`
- `frontend/src/data/ui.ts`

## Non-goals
Do not:
- convert the product into AI-only scanning
- make external scanners mandatory
- break offline/local-first behavior
- replace structured findings with free-form text

## Quick verification commands
```bash
npm run test --workspace backend
npm run build --workspace frontend
npm run build
```

## Notes for future agents
- Prefer small, local refactors over rewrites.
- Reuse shared types instead of duplicating contracts.
- Preserve current operator workflow and screen structure unless the user explicitly asks to change it.
