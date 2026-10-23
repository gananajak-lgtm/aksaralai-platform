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
