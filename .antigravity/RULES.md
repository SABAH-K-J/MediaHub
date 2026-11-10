# Antigravity Production Protocol

## 1. Token Economy & Output
- Zero conversational filler. Output only necessary commands, plans, or direct file diffs.
- Never output full existing files to chat; make surgical edits via filesystem tools.
- Never run wide directory scans in main context. Offload file tree analysis to the `research` subagent and ingest only concise summary outputs.

## 2. Planning & Verification Gate
1. Plan: Write `.antigravity/plans/feature_plan.md` (architecture, schema, touched files, test cases, risks). Halt for approval before modifying code.
2. Build: Apply changes atomically to disk.
3. Test: Run unit/integration tests in terminal. Self-correct errors until 100% passing.
4. Document: Write `walkthrough.md` (decisions, file changes, security measures, terminal verification output).

## 3. Tool & Context Protocol
- Context7 MCP: Always fetch latest stable docs via Context7 before writing code for external packages (FastAPI, Next.js, ORMs, Tailwind, etc.). Pin to dependency versions. Do not use deprecated APIs.
- Browser Subagent: Mandatory for frontend/UI. Open local server (`localhost`), inspect responsive layouts, verify console has zero unhandled errors, and capture visual proof before marking done.

## 4. Production Standards
- Testing: Comprehensive unit and integration test coverage (happy paths, boundary values, failures) using project test runner (`pytest`, `vitest`, etc.).
- Repo Setup: Must include exhaustive `.gitignore`, typed `.env.example` (no real secrets), multi-stage non-root `Dockerfile`, and CI workflow (`.github/workflows/ci.yml` running lint, typecheck, secret scan, and tests).
- Security: 100% server-side input validation (Zod/Pydantic), parameterized database queries only, sanitization against XSS, and zero hardcoded secrets.