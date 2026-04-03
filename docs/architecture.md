# RepoSentinel Architecture Notes

## Scan pipeline

1. `POST /api/scans` creates a queued scan record in SQLite
2. Backend clones the target repository into a temporary workspace
3. Files are enumerated while skipping `.git` and `node_modules`
4. Built-in detectors run first and emit normalized findings
5. External scanner adapters are checked and reported
6. Findings are aggregated into a risk score and severity summary
7. OpenAI is invoked only when escalation rules are met
8. Findings, AI review, and summary data are saved into SQLite
9. Frontend polls `GET /api/scans/:id` until the scan completes

## Detector model

Each detector returns findings in a common shape:

- id
- title
- description
- severity
- scoreContribution
- filePath
- lineNumber
- detector
- evidenceSnippet
- tags

## Persistence

SQLite tables:

- `scans`
- `findings`
- `ai_reviews`
- `settings`
