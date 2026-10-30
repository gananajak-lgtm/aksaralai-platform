# Aksaralai OAuth/MCP release checklist

**Status:** Not deployed or end-to-end verified. Do not enable production gates by default. Current scope is **novels:read only**. No chapter write/edit MCP capability exists.

## 1. CI prerequisites
- Confirm the **Aksaralai checks** workflow is green on the target commit. It runs JavaScript syntax checks, `npm test`, and a Wrangler dry-run bundle.
- Review OAuth tests for consent binding, origin, nonce replay, PKCE invalid verifier, code replay, token expiry, and writer ownership.
- CI bundle success is not proof of a live deployment or working D1 migrations.

## 2. Database and OAuth client
- Back up D1 before applying schema migrations.
- Run `npm run db:remote` only from an authorized Cloudflare environment after reviewing migrations 0008–0010.
- Register an OAuth client **manually** with an exact, trusted callback URI provided by the connector. Do not guess ChatGPT redirect URIs, register wildcard callbacks, or enable arbitrary client registration.
- Example SQL shape (substitute the exact approved values, never literal placeholders):

```sql
INSERT INTO oauth_clients (client_id, display_name, redirect_uris_json, created_at)
VALUES ('<APPROVED_CLIENT_ID>', 'ChatGPT Aksaralai Reader', '["<EXACT_APPROVED_HTTPS_CALLBACK>"]', unixepoch());
```

## 3. Staging verification
1. Confirm `GET /.well-known/oauth-authorization-server` and `GET /.well-known/oauth-protected-resource/api/mcp` return the intended production origin, endpoints and `novels:read` scope.
2. With a logged-in **writer**, request `GET /api/oauth/authorize` with registered client ID, exact callback, state, S256 challenge and `novels:read`.
3. Confirm denial redirects with `access_denied`, and that a reused or cross-session nonce fails.
4. Explicitly approve and exchange the one-time code using the original PKCE verifier; confirm replay and wrong verifier fail.
5. Call `POST /api/mcp` with the bearer token. Verify `initialize`, `tools/list`, `list_novels`, `list_chapters`, `read_chapters`, and `search_novel` on a test writer.
6. Verify a second writer cannot access the first writer's novels, anonymous/cookie-only MCP requests fail, and expired/revoked tokens fail.
7. Validate the connector's actual OAuth client registration support and required MCP protocol version; this server has **no dynamic client registration or refresh tokens**.

## 4. Staged flags
Configure only in the intended staging environment, after migrations and a registered client:
- `AKSARALAI_OAUTH_PREVIEW_ENABLED=true`
- `AKSARALAI_OAUTH_CONSENT_FORM_ENABLED=true`
- `AKSARALAI_OAUTH_ISSUANCE_ENABLED=true`
- `AKSARALAI_OAUTH_TOKEN_ENABLED=true`
- `AKSARALAI_MCP_ENABLED=true`

Keep production flags disabled until the staging and connector checks pass. Roll back by disabling the flags; revoke previously issued tokens if needed.

## 5. Known limitations
- This is a manually registered, read-only OAuth client flow; actual ChatGPT connector compatibility is unverified.
- No automatic OAuth refresh, no user-facing token management/revocation screen, and no approved write scope.
- Do not claim ChatGPT can read novels until a real connected-client test succeeds.
