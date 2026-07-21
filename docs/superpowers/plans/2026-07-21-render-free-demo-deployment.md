# Render Free Demo Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a payment-free Render Blueprint that publishes the existing SenseOrder Web demo over HTTPS without weakening or changing the production deployment definition.

**Architecture:** Keep `render.yaml` as the production-only private-API and persistent-disk topology. Add `render.demo.yaml` with two Render free Web Services in Singapore: a publicly addressable FastAPI service and the Next.js site. Because Free Web Services cannot receive private-network traffic, the Web server calls the API's public HTTPS URL with a generated shared service key. Store demo SQLite and media data under `/tmp` so the free deployment is explicitly ephemeral.

**Tech Stack:** Render Blueprint YAML, Docker, FastAPI, Next.js, PyYAML, pytest

---

### Task 1: Lock the free-demo deployment contract

**Files:**
- Create: `tests/deployment/test_render_demo_blueprint.py`

- [ ] **Step 1: Write the failing Blueprint contract tests**

Add tests that load `render.demo.yaml` and assert:

```python
DEMO_BLUEPRINT_PATH = ROOT / "render.demo.yaml"
DEMO_SHARED_SECRET_GROUP = "senseorder-demo-shared-secrets"

assert set(services) == {
    "senseengine-api-demo-cami",
    "senseorder-web-demo-cami",
}
assert all(service["type"] == "web" for service in services.values())
assert all(service["plan"] == "free" for service in services.values())
assert all("disk" not in service for service in services.values())
assert web_env["DATABASE_PATH"]["value"].startswith("/tmp/")
assert web_env["MEDIA_ROOT"]["value"].startswith("/tmp/")
assert web_env["SENSE_ENGINE_PRIVATE_URL"] == {
    "key": "SENSE_ENGINE_PRIVATE_URL",
    "value": "https://senseengine-api-demo-cami.onrender.com",
}
```

Also assert that both services share one generated service key, the API exposes only its readiness health check, the Web service exposes `/api/health`, no credential is placed in a `NEXT_PUBLIC_` variable, and all operator secrets are generated rather than committed.

- [ ] **Step 2: Run the focused test and verify Red**

Run:

```bash
.venv/bin/pytest tests/deployment/test_render_demo_blueprint.py -v
```

Expected: FAIL because `render.demo.yaml` does not exist.

### Task 2: Implement the isolated free-demo Blueprint

**Files:**
- Create: `render.demo.yaml`
- Modify: `README.md`

- [ ] **Step 1: Add the minimal Blueprint**

Create two Docker Web Services using `plan: free`, `region: singapore`, and `autoDeployTrigger: "off"`. Use the existing Dockerfiles. Do not declare a disk or private service. Generate `SENSE_ENGINE_SERVICE_KEY`, `ADMIN_PASSWORD`, and `SESSION_SECRET`; use a non-secret demo administrator identifier. Point the Web server at `https://senseengine-api-demo-cami.onrender.com` and store demo runtime files under `/tmp`.

- [ ] **Step 2: Document the demo boundary and launch path**

Add a README section that states:

```text
render.demo.yaml is for public demonstrations only. It uses free instances,
can cold-start after inactivity, and intentionally does not persist SQLite or
uploaded media across restarts or deploys. Production remains defined only by
render.yaml.
```

Document the Render fields `Branch=main` and `Blueprint Path=render.demo.yaml`; the Blueprint is created only after the verified feature branch is integrated.

- [ ] **Step 3: Verify Green**

Run:

```bash
.venv/bin/pytest tests/deployment/test_render_demo_blueprint.py -v
.venv/bin/pytest tests/deployment/test_render_blueprint.py tests/deployment/test_release_documentation.py -v
```

Expected: all focused deployment tests pass and the production Blueprint contract remains unchanged.

- [ ] **Step 4: Refactor without changing behavior**

Review service and environment names for clarity, remove duplicated or unused declarations, then rerun both focused commands.

### Task 3: Run release-quality verification

**Files:**
- No additional source files

- [ ] **Step 1: Run Python quality gates**

```bash
.venv/bin/pytest
.venv/bin/mypy
.venv/bin/ruff check .
```

Expected: 0 failures and 0 static-analysis errors.

- [ ] **Step 2: Run Web quality gates**

```bash
npm --prefix web run check:api
npm --prefix web run test
npm --prefix web run typecheck
npm --prefix web run lint
DATABASE_PATH=/tmp/senseorder-release-build.db npm --prefix web run build
npm --prefix web run test:e2e
```

Expected: every command exits 0.

- [ ] **Step 3: Commit the free-demo deployment**

```bash
git add render.demo.yaml README.md tests/deployment/test_render_demo_blueprint.py docs/superpowers/plans/2026-07-21-render-free-demo-deployment.md
git commit -m "feat: add free Render demo deployment"
```

### Task 4: Publish and verify the HTTPS demo

**Files:**
- No local source changes

- [ ] **Step 1: Integrate the verified feature branch**

Merge `feat/web-demo-implementation` into `main`, rerun the focused deployment tests on the merged result, and push `main` without force.

- [ ] **Step 2: Create the Render Blueprint instance**

In Render, select `zhanghuawu6-cami/SenseEngine`, set `Branch=main`, set `Blueprint Path=render.demo.yaml`, and review that both services are Free with no disk before clicking the final deploy action.

- [ ] **Step 3: Verify the public deployment**

Check the public Web HTTPS URL with:

```bash
curl --fail --silent --show-error "$DEMO_WEB_URL/api/health"
curl --fail --silent --show-error --request POST "$DEMO_WEB_URL/api/demo/run" \
  | npm --prefix web run validate:demo-response
```

Open the homepage and `/experience` at desktop and mobile sizes. Confirm that the page renders, the three demo scenarios run, the API service key is absent from browser-visible output, and the share URL uses HTTPS.
