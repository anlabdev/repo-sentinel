# AGENTS.md

## Project name
RepoSentinel

## Purpose
RepoSentinel is a local-first web application for scanning Git repositories for suspicious or potentially malicious code.

The product philosophy is:

1. **Deterministic scanning first**
   - Use rule-based and signature/pattern-based checks first
   - Avoid calling AI for every scan

2. **AI only as escalation**
   - OpenAI is only used when findings are suspicious enough
   - AI is for explanation, deeper triage, and rule improvement suggestions
   - The application must remain useful even when OpenAI is not configured

3. **Practical MVP**
   - The project should be runnable locally
   - It should provide real scan behavior, not just UI mockups
   - External scanners may be optional and gracefully skipped if unavailable

---

## High-level architecture

This project should be structured as a small full-stack TypeScript application:

- `frontend/` → React + Vite + TypeScript
- `backend/` → Express + TypeScript + SQLite
- `shared/` → shared types/contracts if useful
- `docs/` → notes/design docs if needed

The backend is the main engine:
- clones repositories into a temporary workspace
- runs detectors
- aggregates findings
- computes risk score
- optionally calls OpenAI
- persists reports in SQLite
- exposes REST endpoints

The frontend is an operator dashboard:
- start a new scan
- review scan status/results
- browse findings
- review suspicious files
- inspect AI review
- reopen previous scans

---

## Primary workflow

1. User enters a Git repository URL
2. Backend clones repository into temp directory
3. Backend enumerates files and repo metadata
4. Built-in detectors run first
5. Optional external scanners run if installed
6. Findings are normalized into a common shape
7. Risk score is computed
8. If threshold exceeded, OpenAI analysis may run
9. Results are saved in SQLite
10. Frontend displays scan report

---

## Detection philosophy

### Always prioritize non-AI detection
The project must rely on deterministic checks first.

Examples of suspicious indicators:
- `eval`, `exec`, dynamic code execution
- shelling out to system commands
- PowerShell encoded commands
- downloading remote payloads and executing them
- suspicious `preinstall` / `postinstall` hooks
- obfuscated JavaScript
- unusually long base64 or hex blobs
- suspicious GitHub Actions workflow commands
- hardcoded secrets or tokens
- risky startup/persistence behavior
- hidden or misleading filenames
- binary-like artifacts in source repos

### External scanner support
Design adapters/interfaces for tools such as:
- Semgrep
- Trivy
- OSV-Scanner
- YARA

These integrations should be optional.
If a scanner is not installed:
- do not crash
- report it as unavailable
- continue with remaining detectors

---

## AI escalation philosophy

OpenAI must **not** be required for every scan.

Only call OpenAI when:
- overall score exceeds threshold
- a detector marks a finding as high severity
- or suspicious behavior is inconclusive and needs deeper analysis

When sending data to OpenAI:
- minimize token usage
- send only suspicious snippets and structured findings
- avoid dumping entire repositories unnecessarily

Expected AI output:
- concise explanation
- why the code is suspicious
- severity estimate
- confidence estimate
- recommended action
- suggestions for future deterministic rules

If OpenAI fails:
- scan must still complete successfully
- AI result should be marked unavailable or failed
- deterministic results remain the source of truth

---

## Coding standards

### General
- Use TypeScript everywhere practical
- Keep modules small and focused
- Prefer clarity over abstraction-heavy architecture
- Avoid unnecessary frameworks beyond the required stack
- Keep code readable for future AI agents and humans

### Backend
- Separate concerns:
  - routes
  - services
  - detectors
  - scoring
  - database
  - ai integration
- Normalize all findings into one common schema
- Avoid unsafe shell execution
- Validate all user input
- Handle repository clone errors gracefully

### Frontend
- Keep UI clean and functional
- Prefer a light modern dashboard style
- Make tabs/pages easy to scan visually
- Show useful summaries first, raw details later
- Do not overcomplicate state management unless needed

### Database
- Keep schema simple
- Store:
  - scans
  - findings
  - ai reviews
  - settings
- Use practical local persistence suitable for MVP

---

## Important product constraints

1. The app must work without OpenAI configured
2. The app must work even if Semgrep/Trivy/OSV/YARA are missing
3. The app must still provide real built-in scan behavior
4. Findings should be explainable and structured
5. Risk scoring must be transparent enough to inspect later
6. The project should feel like a serious MVP, not a toy mockup

---

## Expected detectors
At minimum, create built-in detector modules like:
- `installHooksDetector`
- `suspiciousCommandDetector`
- `encodedPayloadDetector`
- `workflowRiskDetector`
- `secretPatternDetector`
- `suspiciousFilenameDetector`

You may add more if helpful.

Each detector should ideally produce:
- detector name
- title
- description
- severity
- score contribution
- file path
- line number if available
- evidence snippet
- tags

---

## Risk scoring expectations

Every scan should end with:
- total score
- severity bucket
- summary counts by severity
- `needsAiReview`
- `aiInvoked`
- `aiStatus`

Score should come from accumulated findings rather than vague heuristics alone.

---

## UX expectations

The frontend should provide:
- New Scan page
- Scan Results page
- Scan History page
- Settings page

Scan Results should include:
- Overview
- Findings
- Suspicious Files
- Dependencies
- Secrets
- AI Review
- Raw JSON

The UI should be functional first, pretty second.

---

## Environment expectations

Create:
- `.env.example`
- `README.md`

Environment variables should include examples for:
- backend port
- frontend port if relevant
- database path
- OpenAI API key
- scan threshold
- optional tool paths

Never hardcode secrets.

---

## How future agents should behave
When working on this repository:
- respect the deterministic-first architecture
- do not convert the whole product into AI-only scanning
- do not remove the local rule engine
- keep external scanner support optional
- maintain graceful degradation
- favor practical features over speculative complexity

If architecture decisions are needed, choose the option that:
- keeps the app runnable locally
- keeps the code maintainable
- preserves the non-AI-first philosophy
- improves scan transparency

---

## Definition of done for MVP
A good MVP is complete when:
- user can enter a repo URL
- backend clones and scans it
- findings are produced by real built-in rules
- score is computed
- scan report is saved
- frontend shows results
- AI review triggers only on suspicious scans
- app runs locally with documented setup