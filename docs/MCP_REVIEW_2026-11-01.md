# MCP review and continuation — 2026-11-01

Reviewed main b948d7cec658fe9512243ab4fe55ed12b39da7a7.

## Corrections prepared
- Bind novel ID, count and offset to read_chapters SQL. Earlier mocks concealed the missing novel-ID parameter.
- Never advertise or execute write tools for a novels:read bearer, even with AKSARALAI_MCP_CHAPTER_EDIT_ENABLED=true. Current OAuth issuance is still strictly read-only; write access intentionally remains unavailable until a separate write-consent flow and schema are implemented.
- Interpret large chapter calls as JSON-RPC tools/call with params.name, rather than treating the tool name as the RPC method.
- Recheck latest edit history within the undo transaction, record a reversal snapshot, and update novel timestamps on save/undo. This prevents stale undo after concurrent revisions with matching body text and preserves a rollback audit trail.
- Exercise real SQLite statements, atomic rollback and owner isolation using an in-memory D1 adapter. No production manuscript was modified.

## Validation
- Local npm test: 165/165 passed (Node 24).
- Browser scripts parse successfully.
- Real-SQL fixtures apply all current migrations, including 0011.
- Remote CI and deployment status must be checked on the resulting commit.

## Outstanding live work
1. Cloudflare Dashboard requires sign-in in the Work cloud browser. The local Browser extension is unavailable in this conversation.
2. Inspect D1 migration records and existing deployment/flags through Dashboard. Do not duplicate applied SQL or enable write tools with read-only grants.
3. Register the exact client ID/callback provided by ChatGPT; do not guess callback URLs. Current server uses manual OAuth client registration and PKCE, with no refresh tokens or dynamic registration.
4. Verify OAuth discovery, logged-in writer consent and token exchange, then list novels and read chapter 1 via MCP against production. These live authenticated checks are NOT yet complete.
5. Implement explicit write scope across consent, grant storage and token validation before enabling writes. Never edit real manuscripts during tests without the owner's confirmation.

Keep existing reader/writer accounts and interfaces unchanged. The user explicitly requested Dashboard migration/deployment verification; do not substitute an unreported automatic deployment for that check.
