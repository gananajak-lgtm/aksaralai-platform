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
