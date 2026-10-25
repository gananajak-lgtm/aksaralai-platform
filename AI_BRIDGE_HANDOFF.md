# Aksaralai AI Bridge — implementation status

## Current scope
The existing authenticated writer API exposes read-only routes:
- GET /api/bridge/novels
- GET /api/bridge/novels/:novelId/chapters
- GET /api/bridge/novels/:novelId/read?start=1&count=1 (1–5 chapters; maximum 100,000 characters)
- GET /api/bridge/novels/:novelId/search?q=...

All endpoints require an existing writer session and verify novel ownership. These are **not** public endpoints. Never send cookies, passwords, or session tokens in a ChatGPT conversation.

## Important limitations
These routes are not yet an MCP server and cannot be invoked directly by ChatGPT in this conversation. Existing browser cookie sessions are not a suitable OAuth authorization mechanism for a remote MCP connector.

## Next milestones
1. Automated tests for authentication, ownership, pagination, output limits, and Unicode search.
2. A remote MCP endpoint implementing tool discovery and invocation, with robust protocol validation.
3. OAuth 2.1 authorization-code flow with PKCE, scoped read-only access, token revocation and expiry; verify compatibility with ChatGPT's supported app connection workflow.
4. Security review (CORS, rate limits, least privilege, audit events) and CI/deployment verification.
5. End-to-end connection test from ChatGPT, with explicit account authorization.

Never enable anonymous manuscript reads, reuse a user's browser session as an external integration secret, or permit writes without separate approval.

## 2026-10-23 hardening
- Commit 6988b95: strict positive integer validation for read pagination; SQL-level search excerpts avoid transferring full chapter bodies for searches.
- Deployment and live authenticated end-to-end tests remain unverified.
- OAuth/MCP are not yet implemented; do not claim ChatGPT can connect to the novel directly.

## 2026-10-23 MCP foundation
- Commit 5caa526: POST /api/mcp implements initialize, notifications/initialized, tools/list and tools/call for four read-only tools, with existing writer session and per-novel ownership checks.
- This is a JSON-RPC foundation, not a verified interoperable remote MCP implementation. Protocol compliance, streaming transport, OAuth 2.1 and ChatGPT account connection are outstanding.
- Never paste session cookies into ChatGPT or expose the MCP endpoint anonymously.
- Run node --check, npm test, and authenticated end-to-end tests before treating this as production-ready.

## 2026-10-23 protocol follow-up
- Commit 60c4738: require request IDs for JSON-RPC requests except initialized notification; validate initialize protocolVersion; add ping.
- GitHub connector's commit-workflow-runs query returned no runs for commit 5caa526; this does NOT establish CI success or failure (the query is PR-filtered).
- Still missing full remote MCP transport compliance, OAuth authorization-code + PKCE, and authenticated integration tests. Keep bridge private and read-only.

## 2026-10-23 regression tests
- Commit 142f58e rejects unsupported MCP versions and non-integer numeric JSON-RPC IDs.
- Commit 22793eb adds test/ai-bridge.test.js with static security/protocol regression assertions. These do not substitute for mocked D1 HTTP tests or live MCP client integration tests.
- CI and deployment are not confirmed in this chat. Next: run npm test and node --check; add real HTTP integration tests, then OAuth 2.1 PKCE and remote MCP transport verification.

## 2026-10-23 JSON negotiation
- Commit 735e71e: MCP endpoint checks Accept for application/json or */* and rejects unsupported representations with HTTP 406.
- Commit 97ac2a0: static regression test for this negotiation guard.
- This is not a complete MCP Streamable HTTP transport: still requires standards-based OAuth authorization and verified remote client integration. CI/deploy not independently confirmed.

## 2026-10-23 JSON-RPC ID correctness
- Commit 93f7ba8 rejects null request IDs and notifications that incorrectly include IDs.
- Commit 41e0975 adds a static regression assertion.
- GitHub combined commit status returned no status contexts for 41e0975; no claim of passing CI or deployment. OAuth and remote MCP connection remain outstanding.

## 2026-10-23 MCP safety gate
- Commit c11acb0: /api/mcp returns 503 unless AKSARALAI_MCP_ENABLED is explicitly set to string 'true'. This variable MUST remain unset in production until OAuth and protocol conformance are completed.
- Commit 487fd3b: static regression assertion for default-disabled gate.
- This does not implement OAuth or permit direct ChatGPT access. Do not enable the gate with cookie authentication as a substitute for OAuth.

## OAuth PKCE foundation (2026-10-23)
- 4b58197: isolated PKCE S256 verification and exact redirect allowlist module.
- 16ed9da: RFC 7636 vector and redirect validation tests.
- No OAuth token endpoint, consent screen, or external account connection exists yet. Keep MCP disabled.
- Next: authorization code persistence, consent, token lifecycle, bearer authentication, HTTP integration tests, CI and deployment verification.

## OAuth authorization request validation (2026-10-23)
- Commit 2ea0e66: src/oauth-authorization.js validates registered client ID, exact allowlisted redirect URI, authorization-code response type, S256 PKCE, read-only novels:read scope and state; constructs authorization redirects only from validated grants.
- Commit b37baa8: test/oauth-authorization.test.js covers valid requests, unsafe redirects, wrong client, expanded scope, missing state and plain PKCE.
- These are isolated pure helpers, NOT live OAuth endpoints. Next: persistent client registry, consent UI, one-time authorization code storage/atomic redemption, hashed access tokens, expiration and revocation; then MCP bearer auth and end-to-end tests.
- Keep AKSARALAI_MCP_ENABLED unset until OAuth is complete. CI/deploy not verified.

## OAuth D1 persistence groundwork (2026-10-23)
- Migration migrations/0008_oauth_readonly.sql (38fe408, fixed SQL comment syntax 3e8eba7): registered clients, SHA-256-hashed authorization codes and access tokens, expiry/consumption/revocation fields, novels:read-only scope.
- Commit cf519b2: src/oauth-storage.js adds atomic compare-and-set one-time code consumption, access-token lookup and revocation helpers.
- CRITICAL: These helpers are NOT connected to any public routes. Authorization-code redemption MUST validate client ID, exact redirect URI and PKCE verifier before consuming a code and issuing a token; implement carefully to avoid denial of service or replay. OAuth migration has not been verified against production D1; inspect migration numbering before deployment. Do not enable MCP yet.
- Next: unit/integration tests, verified migration sequence, consent UI, safe authorization/token flow and bearer-token auth; verify CI and deployment.

## OAuth code redemption validation (2026-10-23)
- Commit c5e7946: redeemAuthorizationCode validates client, redirect URI and PKCE S256 before atomic single-use consumption.
- Commits 6ac3521 and c75c1e6: mocked D1 unit tests for successful redemption, replay prevention, invalid verifier/client/redirect and token revocation.
- IMPORTANT: OAuth routes, consent, client registration, token issuance and MCP bearer auth are NOT implemented. CI and D1 migration status are unverified. Keep MCP disabled until full end-to-end authorization tests pass.

## OAuth bearer verification groundwork (2026-10-23)
- Commit 72a6e1a adds src/oauth-bearer.js: strict Bearer parsing, SHA-256 token hashing, active read-only token lookup without cookie fallback.
- Commit faa4557 adds test/oauth-bearer.test.js for parsing, hashing, DB lookup, scope rejection.
- Not wired into /api/mcp yet. OAuth consent, issuance, client registry and full token lifecycle are incomplete. Keep AKSARALAI_MCP_ENABLED unset. CI, migration and deploy not verified.

## MCP bearer-only route (2026-10-23)
- Commits 2be8e91, 21e1e87, e238fe3 and a90a333: MCP now resolves a writer using explicit OAuth Bearer grants and never authenticates from browser session cookies. Added unit tests and updated static regression checks.
- OAuth token issuance, user consent and client registration remain incomplete. MCP remains default-disabled behind AKSARALAI_MCP_ENABLED. Do not enable it yet.
- GitHub CI/deployment status and authenticated live integration remain unverified for these commits.

## Registered OAuth consent validation (2026-10-23)
- Commit b63185f adds src/oauth-consent.js, a pure preparation helper that looks up registered clients, parses their allowed redirect URIs and validates PKCE, scope, state and callback with existing authorization validation.
- Commit 0fa9f9f adds unit tests for registered and unknown clients, redirect mismatch, malformed registration, scope and state.
- No authorization UI or OAuth HTTP routes are exposed yet; no code or token is issued. MCP remains disabled by default.
- CI and live deployment for these commits have not been verified.

## OAuth consent preview (2026-10-23)
- Commit 8115ec9 adds a Thai-language, escaped HTML consent preview with explicit read-only scope and registered redirect destination. It deliberately has no approval button or token issuance.
- Commit deaaf21 adds tests for XSS escaping, read-only display, absence of approval actions, and refusal of unvalidated input.
- Still not routed through Worker HTTP and not production-ready. Next: authenticated authorization endpoint, CSRF-protected explicit user approval, short-lived one-time authorization code, PKCE token exchange, and revocation.
- CI and deployment remain unverified; do not enable MCP.

## Authenticated OAuth consent preview route (2026-10-24)
- Commit c5ad1fa adds GET /api/oauth/authorize, gated by AKSARALAI_OAUTH_PREVIEW_ENABLED='true', existing authenticated writer session, registered client validation, and strict response security headers (CSP, no-store, no-referrer, no framing).
- Commit 5d17241 adds static route regression tests. This route is preview-only: no approval form, no code issuance, no access token exchange, no live ChatGPT connection.
- Do not enable preview without verifying deployment, migrations, tests, and registered OAuth clients. MCP remains default-disabled.
- CI and production deployment are not independently verified.

## One-time OAuth consent nonce groundwork (2026-10-24)
- Commit eb8fe81 adds cryptographically random 256-bit consent nonces, SHA-256 hashing, and atomic user-bound, expiry-checked consume primitives.
- Commit 6b481b9 adds migration 0009_oauth_consent_nonces.sql; commit 97b80c0 adds unit tests.
- These primitives are NOT yet wired to an authorization request or approval POST. They do not themselves provide full CSRF protection; the eventual flow must bind nonce to the precise OAuth request and browser session, verify Origin/CSRF, and obtain explicit consent before issuing one-time codes.
- No migration application, CI pass, deployment, or live OAuth test verified. Keep OAuth and MCP disabled by default.

## Consent request/session binding (2026-10-24)
- Commit fdaaadb adds canonical SHA-256 consent context hashing across writer ID, session token hash, client ID, redirect URI, PKCE challenge, read-only scope and OAuth state; includes bound insert and atomic consume primitives.
- Commit 0274f32 adds migration 0010_oauth_consent_binding.sql with context_hash column. Existing unbound nonce records must not be accepted by the new bound consume path.
- Commit b899f74 adds tests for context changes, session changes, bound SQL and malformed input.
- These helpers are not wired to the HTTP approval flow. Must ensure browser session binding, CSRF validation, explicit consent, one-time code issuance and transactional semantics before enabling.
- CI, migration application and deployment remain unverified. Keep MCP/OAuth feature gates disabled.

## OAuth authorization parameter ambiguity (2026-10-24)
- Commit 7315a20 rejects duplicate query parameter names on GET /api/oauth/authorize before registered-client validation, preventing silent Object.fromEntries overwrites.
- Commit 92bde50 adds static regression coverage.
- A preliminary experiment to issue a nonce on the preview GET (ea87497) was immediately reverted in 6788fb0 because the preview has no usable approval form or POST endpoint; do not treat those ephemeral changes as an active consent workflow.
- Next implement a real, session-bound consent form and POST flow with CSRF and one-time code issuance. MCP/OAuth gates remain disabled. CI/deployment not verified.

## OAuth consent decision redirect helper (2026-10-25)
- Commit fdbb120 adds src/oauth-consent-decision.js for validated approval/denial callbacks; denial sends error=access_denied and state without a code, approval requires an externally issued well-formed code.
- Commit 5c12f19 adds tests for state preservation, denial, approval, unsafe callbacks and conflicting query fields.
- Helper is NOT wired to an HTTP approval/denial route and does not issue or persist authorization codes. Caller must revalidate the registered client, enforce explicit consent, browser session/CSRF binding, one-time nonce and code persistence before redirect.
- CI, deployment and live OAuth integration remain unverified. Feature gates remain disabled.

## Explicit consent POST validation groundwork (2026-10-25)
- Commit 4672c37 adds src/oauth-consent-submit.js to validate exactly {decision:'approve'|'deny',nonce:<43-char base64url>} and require an exact same-origin Origin header; cross-site Fetch Metadata is rejected.
- Commit 0338c28 adds tests for valid/invalid decisions, missing/invalid nonce, missing/cross-site Origin and cross-site Fetch Metadata.
- This is a standalone validation helper only. No POST /api/oauth/consent route exists, no browser form is enabled, and no authorization code is issued. Full CSRF defense still requires binding a generated nonce to the exact request, session and user, then consuming it atomically.
- CI/deployment/migrations not verified. Keep OAuth and MCP feature gates disabled.

## OAuth consent verification and callback hardening (2026-10-25)
- 02f820b: standalone request/session-bound nonce verification helper; 9c8cc0e: replay and origin tests.
- 6811d47: callback redirect now rejects preexisting error_description and error_uri, alongside code, state, and error.
- 2433ec0: regression tests for reserved OAuth error fields.
- Not yet wired to HTTP consent form or POST route; no authorization code/token issuance. OAuth and MCP remain gated. CI and deployment unverified.

## Consent form renderer (2026-10-25)
- cc157e7 adds src/oauth-consent-form.js: a server-rendered form with explicit approve/deny buttons and a hidden 43-character nonce; HTML escaping protects client-provided text.
- 1f4a088 adds tests for decisions, nonce validation and HTML escaping.
- Not wired into GET /api/oauth/authorize or POST /api/oauth/consent. Do not enable OAuth/MCP until nonce issuance, session binding, one-time code issuance and token exchange are implemented and verified.
- CI/deployment not verified.
