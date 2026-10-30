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

## Session-bound OAuth consent form GET (2026-10-25)
- 2c9661f wires an independently gated consent form into GET /api/oauth/authorize. It requires an authenticated writer, validates client/redirect/PKCE, creates a random nonce, persists its hash and session-bound context hash with 300-second expiry, and renders approve/deny buttons.
- 44be383 adds static route tests for nonce/session binding and the independent feature gate.
- AKSARALAI_OAUTH_CONSENT_FORM_ENABLED must remain unset/false until POST /api/oauth/consent is implemented, tested and deployed. AKSARALAI_OAUTH_PREVIEW_ENABLED remains the separate outer gate. No authorization code/token is issued yet.
- CI, database migration status and deployment are not verified.

## OAuth form request preservation (2026-10-25)
- 0134bf7 and 05d948f: the consent form now includes hidden OAuth authorization request fields (response_type=code, client_id, redirect_uri, code_challenge, code_challenge_method=S256, scope, state), alongside the consent nonce and explicit decision. HTML attribute values are escaped.
- f589f66 updates the form tests with a complete validated request and assertions for the hidden parameters.
- The POST endpoint MUST independently revalidate these client-controlled fields against the registered client and verify the nonce's canonical context hash, authenticated user, and browser session before accepting a decision. Never trust hidden inputs as authorization by themselves.
- POST consent handling, authorization code issuance and token exchange remain incomplete. Keep consent form/OAuth/MCP gates disabled. CI and deploy not verified.

## Consent POST payload validation (2026-10-26)
- 7d044df: require exact nine-field OAuth consent form payload (decision, nonce and seven OAuth authorization request parameters).
- 7ad6537: verification compares posted request values with the independently validated OAuth request before nonce consumption.
- 3bbc115 and 63ffe7c: update unit tests to send complete form fields.
- Attempted POST /api/oauth/consent route update was blocked by connector safety controls. It has NOT been committed; no code issuance or denial route is live. Keep feature flags disabled. CI/deploy unverified.

## AI rewrite input limit (2026-10-26)
- 152861e raises POST /api/admin/rewrite-text input cap from 4,500 to 40,000 characters, raises requested output tokens to 16,384 and edited result character cap to 80,000.
- 9a837f8 updates editor validation and clarifies that AI paragraph formatting remains limited to 4,500 characters.
- ffc244d adds static regression tests for UI/API rewrite limits and separate formatter cap.
- Important: A single gpt-4o-mini completion may not return a complete 40,000-character rewrite. End-to-end large-document testing and likely chunked rewrite processing are required before promising complete output. CI/deployment not verified.

## OAuth consent POST denial route (2026-10-27)
- ef46a2b: src/oauth-consent-route.js implements a denial-only POST flow with strict Origin, content-type, payload size, duplicate field rejection, registered-client validation, session/request-bound one-time nonce verification, and 303 access_denied redirect with state.
- 04c9c6b: Worker wires POST /api/oauth/consent under both AKSARALAI_OAUTH_PREVIEW_ENABLED and AKSARALAI_OAUTH_CONSENT_FORM_ENABLED, with authenticated writer and session hash.
- 3fdca6e: tests for cross-origin, duplicate fields and oversized payload rejection.
- Approval intentionally returns 503 BEFORE nonce consumption. Authorization code issuance and token exchange are not implemented. Feature gates must remain disabled until these paths and end-to-end tests are complete.
- CI, D1 migration status and deployment are unverified.

## OAuth consent POST integration regression (2026-10-27)
- e306016 adds test/oauth-consent-post-flow.test.js exercising the registered-client denial path, 303 access_denied callback preserving state, one-time nonce replay rejection, and approval fail-closed (503 before nonce consumption).
- The live POST implementation was already committed concurrently in ef46a2b and 04c9c6b. This change adds coverage without overwriting the concurrent implementation.
- Still required: authorization-code issuance, PKCE token exchange, migrations and end-to-end security tests. Keep OAuth consent and MCP gates disabled. Tests/CI/deployment not yet verified.

## OAuth authorization code issuance primitive (2026-10-29)
- 40fe6ba adds src/oauth-code-issuance.js: a five-minute authorization code persisted only by SHA-256 hash, scoped to novels:read and bound to registered client, writer, redirect URI and PKCE challenge. It returns the raw code only after successful DB insert.
- c189479 adds tests for hash-only persistence, expiry, invalid scope and failure-closed storage.
- This primitive is NOT wired to the consent POST yet. The existing denial-only route remains unchanged. Integration must consume the request/session-bound nonce before issuance and handle failures safely; do not return an unpersisted grant. A cryptographically secure 32-byte random base64url generator must be passed by the caller.
- Token exchange, full end-to-end tests, CI and deploy remain unverified. Keep OAuth/MCP gates disabled.

## Requested next capability: chapter editing via ChatGPT
The owner requests both chapter reading and editing. Keep existing read-only OAuth and MCP gates disabled until the authorization flow is complete. Design separate explicit write consent, chapter ownership verification, an edit preview, revision conflict protection, confirmation before saving, and rollback history. No write endpoint is enabled by this note.

## Implementation checkpoint 2026-10-30
Fresh HEAD 45c1403; OAuth consent POST remains denial-only. Next: gated approval after nonce verification and hashed code issuance, then PKCE token endpoint; separate novels:write consent and owner-checked chapter revisions only after read flow passes tests. Do not enable feature flags until end-to-end verification.

## OAuth consent approval implementation (2026-10-30)
- f052cfd updates src/oauth-consent-route.js to support explicit approval after origin, form, registered client, nonce, user and session-context verification. A fresh random 32-byte code is persisted only by SHA-256 hash and returned via registered redirect with state.
- Approval remains disabled by default: handleOAuthConsentDenial receives allowIssuance=false and the index.js caller does not enable it. Do not turn on until PKCE token exchange, integration tests, and deployment validation are ready.
- Remaining: token exchange endpoint, write-scope design, ownership-checked chapter edit preview/confirm/revision history, CI and deploy verification.

## OAuth checkpoint (2026-10-30)
- 8c5180c: Added src/oauth-token-issuance.js to redeem a validated read-only authorization grant, persist a hashed random bearer token, and return a one-hour novels:read token.
- 5c26d00: Reject timestamps whose one-hour expiration is not a safe integer.
- The public token route has NOT been created: GitHub rejected the attempted file creation. No OAuth token endpoint is wired in src/index.js; consent approval is still disabled by default.
- Next: implement and test token endpoint request parsing, client redirect allowlist, PKCE and replay protections; only then enable feature gates. CI and deploy not verified.

## OAuth token exchange and consent integration (2026-10-30)
- 963022b adds POST form handler src/oauth-token-route.js: registered client and exact redirect validation, PKCE S256 verification, one-time code redemption, 3600s read-only bearer token, SHA-256 hash-only storage, strict duplicate/oversize rejection.
- 9217eb0 wires POST /api/oauth/token behind AKSARALAI_OAUTH_TOKEN_ENABLED=true and consent approval behind independent AKSARALAI_OAUTH_ISSUANCE_ENABLED=true. Existing preview and consent-form gates remain. Cross-origin token/MCP requests are exempt from global same-origin blocking; both require their own bearer/PKCE authorization.
- d8929c adds test/oauth-token-route.test.js for exchange, replay and malformed grants. CI status NOT confirmed.
- IMPORTANT: Production integration is NOT complete: no OAuth discovery/registration metadata, no ChatGPT remote connector end-to-end verification, no live D1 migration/deploy verification, and no complete security review. Do not turn on feature gates until these pass. Test token endpoint and MCP with a registered client and an actual writer session. MCP remains strictly read-only.

## OAuth discovery checkpoint (2026-10-30)
- 20bbea5: src/oauth-metadata.js publishes OAuth authorization-server and MCP protected-resource metadata. PKCE S256 and novels:read only; no dynamic client registration. Registered client redirect URIs must be configured manually in oauth_clients.
- f32091a: routes /.well-known/oauth-authorization-server, /.well-known/oauth-authorization-server/api/mcp, /.well-known/oauth-protected-resource, /.well-known/oauth-protected-resource/api/mcp.
- 2813504: MCP 401 now returns WWW-Authenticate Bearer with resource_metadata URL.
- 8727281: discovery metadata tests.
- Not production ready: verify all tests in actual Node/CI, run remote D1 migrations, register approved ChatGPT OAuth client_id/redirect URIs, confirm compatibility with ChatGPT connector, perform live OAuth/MCP end-to-end security test and deploy. Never claim those steps complete without evidence. All OAuth/MCP feature flags stay off until verified.

## Token exchange consolidation (2026-10-30)
- b3ffb8b refactors src/oauth-token-route.js to reuse existing redeemReadOnlyGrant from src/oauth-token-issuance.js instead of duplicating redemption/token storage. The helper rejects unsafe expiry arithmetic before consuming an authorization code.
- 74e1fc8 adds regression coverage for unsafe expiration timestamps; checks no grant consumed and no token stored.
- Must still run npm test and validate GitHub Actions; remote D1 migrations, OAuth client registration, live ChatGPT connector test and deploy are NOT verified. Keep all OAuth and MCP feature gates disabled.

## CI and staging release gates (2026-10-30)
- 44f5a7f updates GitHub Actions to syntax-check every src/test JS file, run npm test, install Wrangler and dry-run bundle. Workflow execution status was not yet returned by GitHub.
- 0a31733 adds OAUTH_MCP_RELEASE_CHECKLIST.md with staging-only migration, manual OAuth client registration, exact callback, negative tests, feature flags and rollout/rollback steps.
- No Cloudflare deploy, remote D1 migration, or live ChatGPT connector test was performed. Do not claim production readiness.

## Discovery fail-closed hardening (2026-10-30)
- b8e25ed gates both OAuth authorization-server metadata and MCP protected-resource metadata on **all five** flags: AKSARALAI_OAUTH_PREVIEW_ENABLED, AKSARALAI_OAUTH_CONSENT_FORM_ENABLED, AKSARALAI_OAUTH_ISSUANCE_ENABLED, AKSARALAI_OAUTH_TOKEN_ENABLED, AKSARALAI_MCP_ENABLED. Metadata now responds 503 when the read-only integration is not fully enabled.
- ca071e8 adds worker-level tests checking all four metadata paths, every missing flag, and fully enabled responses.
- No CI green, live migration, OAuth client registration, or real ChatGPT connector verification established; do not enable flags in production yet.

## MCP bearer integration regression tests (2026-10-30)
- e3c406a and 552a83a add test/mcp-bearer-integration.test.js using mocked D1 to exercise the Worker MCP endpoint: no cookie-only access, valid bearer list_novels and read_chapters, expired/revoked/non-writer denial, and cross-writer ownership denial.
- Tests have been committed but **not executed/verified** here. GitHub Actions status and live D1/ChatGPT OAuth-to-MCP integration remain outstanding. All feature flags remain disabled by default.

## MCP request hardening (2026-10-30)
- 3e3aae0 limits authenticated MCP JSON-RPC requests to 65,536 bytes, checking both content-length and actual UTF-8 bytes, and rejects malformed/non-object JSON before dispatch. This avoids the generic 1.5 MB manuscript upload limit for control messages.
- 040d64d adds regression cases for oversized and malformed authenticated MCP requests.
- Changes committed but tests, CI, remote migrations and live ChatGPT connector deployment are not verified. Keep production OAuth/MCP flags off.

## 2026-10-30 token helper checkpoint
- Commit 8c5180c added src/oauth-token-issuance.js: hashed, one-hour, novels:read access-token issuance after code redemption.
- Commit b01fb74 limits redemption arguments and checks expiry arithmetic.
- The HTTP token route is not yet connected. Consent approval remains disabled by default. No CI or deployment validation has been completed for these commits.
- Next work: route-level registered-client and redirect validation, request validation, token redemption tests, and only then gated integration. Chapter write access remains future work.
