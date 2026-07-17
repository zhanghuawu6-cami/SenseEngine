# Production Deployment Hardening Design

## Scope

This hardening closes the four blocking findings from the final deployment review without
changing `src/`, persistence behavior, or the public product experience.

## Production Authentication

Production must never use development credentials or signing keys. The Web runtime will
validate `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `SESSION_SECRET` before the Docker runner imports
the standalone Next.js server. A second guard in the authentication module will reject missing
production values if the module is used outside that runner. Development keeps the existing
local defaults so contributor workflows remain usable.

Tests must prove that each missing or whitespace-only production value fails closed, that no
public fallback authenticates in production, that non-production defaults still work, and that
the final container starts only when all three values are present.

## Commit-Pinned Render Release

`CIRCLE_SHA1` is a required release input and must be a lowercase or uppercase 40-character Git
SHA. Both Render create-deploy requests will include `commitId`. The release controller will
also inspect the Render deployment payload while polling and refuse to accept a `live` deploy
whose commit is missing or differs from the expected SHA.

The CircleCI deploy command will pass `CIRCLE_SHA1` explicitly. Rollback deploys remain bound to
the previously recorded deploy IDs and do not require a commit SHA.

## Interrupt-Safe Rollback

The release CLI will install temporary SIGINT and SIGTERM handlers. A signal raises a sanitized
`ReleaseInterrupted` exception, which enters the existing fail-closed Web-then-API rollback and
post-rollback health-check path. Previous handlers are restored when `main()` returns. A signal
before a new deployment begins fails without rollback; a signal after deployment begins must
attempt both rollbacks and return non-zero.

## CircleCI Context Boundary

The `senseorder-production` context is an external security boundary, not something repository
YAML can enforce. Production deployment remains disabled until an operator verifies both:

- a project restriction for `gh/zhanghuawu6-cami/SenseEngine`; and
- an expression restriction allowing only `pipeline.git.branch == "main"`.

The runbook must state that main-only job filters do not protect context secrets from a modified
branch config. It must include a negative feature-branch access check and a positive main access
check. Repository tests will keep these requirements from disappearing. The actual CircleCI
setting requires an authenticated organization administrator and is an external release
prerequisite.

## Verification

Each behavior change follows Red, Green, Refactor. Targeted tests run after each task, followed by
the complete Python, Web, type, lint, production build, browser, container, CircleCI validation,
Git boundary, and independent final-review gates.
