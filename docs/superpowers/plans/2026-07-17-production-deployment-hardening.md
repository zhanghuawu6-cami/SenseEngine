# Production Deployment Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all blocking production deployment review findings before the feature branch is pushed.

**Architecture:** Fail closed at both the Web container entrypoint and authentication boundary, bind each Render deployment to the verified CircleCI revision, convert process interrupts into the existing rollback path, and make the external CircleCI context restrictions an explicit tested release prerequisite.

**Tech Stack:** Next.js 16, Node.js 22, TypeScript, Vitest, Python 3.12, pytest, CircleCI, Render, Docker.

---

### Task 1: Fail-Closed Production Authentication

**Files:**
- Create: `web/scripts/start-production.mjs`
- Modify: `web/lib/auth.ts`
- Modify: `web/Dockerfile`
- Test: `web/tests/lib/auth.test.ts`
- Test: `web/tests/scripts/start-production.test.ts`
- Test: `tests/deployment/test_container_contract.py`

- [ ] **Step 1: Write failing production configuration tests**

Add tests that remove each of `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `SESSION_SECRET`, set
`NODE_ENV=production`, and assert the production runner exits non-zero without importing the
server. Add an authentication test proving the public development credentials are rejected in
production.

- [ ] **Step 2: Run tests and verify Red**

Run: `npm --prefix web test -- --run tests/lib/auth.test.ts tests/scripts/start-production.test.ts`

Expected: FAIL because production still accepts fallback values and no production entrypoint
exists.

- [ ] **Step 3: Implement the minimum fail-closed boundary**

Create a production entrypoint that trims and validates all three required values before
importing `../server.js`. In `auth.ts`, return development defaults only when
`NODE_ENV !== "production"`; missing production values must throw a sanitized configuration
error or reject credentials. Copy the entrypoint into the final runner and use it as `CMD`.

- [ ] **Step 4: Verify Green and refactor**

Run the focused Vitest files, `tests/deployment/test_container_contract.py`, TypeScript, ESLint,
and a real Docker start with and without required production values.

- [ ] **Step 5: Commit**

Commit message: `security: fail closed on missing production auth`

### Task 2: Pin Render Deployments to the Verified Commit

**Files:**
- Modify: `scripts/render_release.py`
- Modify: `.circleci/config.yml`
- Test: `tests/deployment/test_render_release.py`
- Test: `tests/deployment/test_circleci_config.py`

- [ ] **Step 1: Write failing commit-pin tests**

Assert `CIRCLE_SHA1` is required and validated, create-deploy bodies equal
`{"commitId": CIRCLE_SHA1}`, both services receive that SHA, a live response with a missing or
mismatched commit fails closed, and CircleCI passes the built-in revision explicitly.

- [ ] **Step 2: Run tests and verify Red**

Run: `.venv/bin/uv run pytest tests/deployment/test_render_release.py tests/deployment/test_circleci_config.py -q`

Expected: FAIL because deployments currently send `{}` and never inspect a commit.

- [ ] **Step 3: Implement the minimum commit pin**

Add `CIRCLE_SHA1` to required release environment, validate it as a 40-character hexadecimal
SHA, include it as `commitId`, and require Render's live deployment payload to report the same
commit. Preserve deploy-ID rollback behavior.

- [ ] **Step 4: Verify Green and refactor**

Run focused pytest, mypy, Ruff, YAML parsing, and CircleCI CLI config validation.

- [ ] **Step 5: Commit**

Commit message: `security: pin Render release to verified commit`

### Task 3: Route INT and TERM Through Rollback

**Files:**
- Modify: `scripts/render_release.py`
- Test: `tests/deployment/test_render_release.py`

- [ ] **Step 1: Write failing interruption tests**

Trigger the installed SIGINT and SIGTERM handlers during API wait, Web wait, and public smoke.
Assert Web rollback, API rollback, and the health check always run in that order; assert `main()`
returns non-zero and restores the previous handlers.

- [ ] **Step 2: Run tests and verify Red**

Run: `.venv/bin/uv run pytest tests/deployment/test_render_release.py -q`

Expected: FAIL because no handlers are installed and `BaseException` interrupts bypass rollback.

- [ ] **Step 3: Implement the minimum interrupt bridge**

Add a sanitized `ReleaseInterrupted` exception and temporary SIGINT/SIGTERM handlers around
`release()` in `main()`. Let the existing `except Exception` deployment path perform rollback.

- [ ] **Step 4: Verify Green and refactor**

Run focused pytest, mypy, Ruff, and one subprocess signal test that checks the sanitized exit.

- [ ] **Step 5: Commit**

Commit message: `fix: rollback interrupted Render releases`

### Task 4: Lock the External Context Prerequisite

**Files:**
- Modify: `README.md`
- Test: `tests/deployment/test_release_documentation.py`

- [ ] **Step 1: Write a failing runbook contract test**

Require the runbook to name the repository project restriction, the expression
`pipeline.git.branch == "main"`, the feature-branch negative check, the main positive check, and
an explicit production STOP condition until both restrictions are verified.

- [ ] **Step 2: Run the test and verify Red**

Run: `.venv/bin/uv run pytest tests/deployment/test_release_documentation.py -q`

Expected: FAIL because the current runbook lists variables but not context restrictions.

- [ ] **Step 3: Document the external security gate**

Add exact CircleCI UI/CLI verification steps without exposing secret values. State that this
cannot be proven by `.circleci/config.yml` and must be completed by an authenticated organization
administrator before enabling production deploys.

- [ ] **Step 4: Verify Green**

Run the focused documentation tests, Ruff, and `git diff --check`.

- [ ] **Step 5: Commit**

Commit message: `docs: require protected production context`

### Task 5: Final Verification and Review

**Files:**
- Verify only; no planned product changes.

- [ ] **Step 1: Run all repository quality gates**

Run Python tests/mypy/Ruff; Web API contract,  unit tests/typecheck/lint/build; Playwright E2E;
release image builds; non-root dual-service smoke; CircleCI validation; Git and secret audits.

- [ ] **Step 2: Request final independent review**

Review `69c694a^..HEAD` against the production deployment requirements. Resolve every Critical or
Important finding before proceeding.

- [ ] **Step 3: Push the feature branch**

Push `feat/web-demo-implementation`, observe the feature-branch CI quality jobs, and verify the
main-only Render deploy job does not run.
