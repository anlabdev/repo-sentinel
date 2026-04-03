# RepoSentinel

RepoSentinel is a production-structured MVP for scanning Git repositories for suspicious or potentially malicious code. It uses deterministic, non-AI detectors first, computes a risk score, and only escalates to OpenAI when configured thresholds or high-severity findings justify it.

## Stack

- Frontend: React, Vite, TypeScript
- Backend: Node.js, Express, TypeScript
- Persistence: SQLite
- Shared typing: `shared/`

## Project structure

```text
reposentinel/
  backend/   Express API, scan engine, SQLite persistence
  frontend/  React UI for scan creation, results, history, settings
  shared/    Shared TypeScript models
  docs/      Supporting docs
```

## Features in this MVP

- Start a scan from a Git repository URL
- Optional branch selection
- Deterministic detectors for:
  - suspicious command execution
  - download-and-execute patterns
  - obfuscation indicators
  - long encoded/base64 payloads
  - install hooks in `package.json`
  - suspicious GitHub Actions workflows
  - PowerShell/shell/batch usage patterns
  - secrets-like patterns
  - risky dependency scripts
  - suspicious filenames and hidden binary-like artifacts
- Risk scoring and AI escalation decisioning
- SQLite-backed scan history, findings, and settings
- External scanner adapter registry for Semgrep, Trivy, OSV-Scanner, and YARA
- Graceful operation when OpenAI or external scanners are unavailable

## Environment

Copy `.env.example` to `.env` and adjust if needed.

```env
PORT=4000
OPENAI_API_KEY=
GITHUB_TOKEN=
OPENAI_MODEL=gpt-4.1-mini
REPOSENTINEL_DB_PATH=./backend/data/reposentinel.sqlite
REPOSENTINEL_TEMP_DIR=./backend/tmp
```

OpenAI is optional. Normal scans still run without an API key.
`GITHUB_TOKEN` is optional, but recommended if you use `remote` mode against GitHub to avoid public API rate limits.

## Install

```bash
npm install
```

## Run the backend

```bash
npm run dev --workspace backend
```

The API will be available at `http://localhost:4000`.

## Run the frontend

```bash
npm run dev --workspace frontend
```

The UI will be available at `http://localhost:5173` and proxies `/api` to the backend.

## Run both together

```bash
npm run dev
```

## Build

```bash
npm run build
```

## API

- `GET /api/health`
- `GET /api/settings`
- `PUT /api/settings`
- `POST /api/scans`
- `GET /api/scans`
- `GET /api/scans/:id`

## How AI escalation works

OpenAI review runs only when all of the following are true:

1. OpenAI is enabled in settings
2. The scan request allows AI
3. `OPENAI_API_KEY` is configured
4. The overall risk score exceeds the threshold, or a high/critical finding exists

When triggered, RepoSentinel sends reduced context only:

- top deterministic findings
- file paths and evidence snippets
- limited file excerpts from suspicious files

The AI response is stored separately from deterministic findings.

## External scanners: real vs stubbed

- Built-in rule engine: fully implemented and used now
- Semgrep adapter: real availability check, stubbed findings ingestion
- Trivy adapter: real availability check, stubbed findings ingestion
- OSV-Scanner adapter: real availability check, stubbed findings ingestion
- YARA adapter: real availability check, stubbed findings ingestion

If a tool is missing, the scan reports it as `not_available` instead of failing.

## Where to add future detectors

Add new detector modules under `backend/src/services/scanners/detectors/` and register them in `backend/src/services/scanners/scanEngine.ts`.

## Limitations

- External scanner adapters currently report availability but do not parse native findings yet
- Repository cloning assumes `git` is installed and available on `PATH`
- Progress is polled rather than streamed over SSE/WebSocket
- Detector coverage is practical MVP coverage, not a full malware-analysis engine
- OpenAI review expects JSON output and may need stronger schema enforcement in future hardening
