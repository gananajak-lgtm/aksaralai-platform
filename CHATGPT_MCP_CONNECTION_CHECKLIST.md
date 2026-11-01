# Aksaralai → ChatGPT: OAuth/MCP connection checklist

## Verified state (2026-11-01)
- Production Worker: https://aksaralai-platform.gananajak.workers.dev
- MCP endpoint: https://aksaralai-platform.gananajak.workers.dev/api/mcp
- OAuth metadata: /.well-known/oauth-authorization-server
- Read-only scope: `novels:read`; authorization code + PKCE S256.
- D1 `oauth_clients` requires **manual** client registration.
- Do not enable `AKSARALAI_MCP_CHAPTER_EDIT_ENABLED` during read-only onboarding.

## Blocker
The client application's **exact redirect URI** must be supplied by the ChatGPT integration provider. Plugin Creator's tools do not currently expose this URI. Do not guess it, substitute a callback URL from another product, or disable redirect matching.

## Register after the provider supplies its actual redirect URI
In Cloudflare D1 Console, after independently verifying the URI against the app's authentication setup, register the public client. Replace the placeholders with actual provider values; do not run this example verbatim.

```sql
INSERT INTO oauth_clients (client_id, display_name, redirect_uris_json, created_at)
VALUES (
  '<generate-a-unique-public-client-id>',
  'Aksaralai ChatGPT read-only',
  json_array('<exact-redirect-uri-from-client>'),
  unixepoch()
);
```

The `client_id` is a public identifier, not a password. Keep the client scoped to the verified callback. Never post authorization codes, access tokens, passwords, or secrets in chat.

## Read-only smoke test
1. Verify OAuth metadata exposes `authorization_endpoint`, `token_endpoint`, `S256`, and `novels:read`.
2. Configure the plugin with MCP URL, the registered client ID, and authorization-code/PKCE settings.
3. Sign in using the owner's existing Aksaralai account and approve read-only access.
4. Invoke `list_novels`, `list_chapters`, and `read_chapters` to confirm real D1 reads.
5. Verify another user cannot read the owner's manuscripts.
6. Only after a separate security review consider adding write scope and enabling chapter editing.

## Troubleshooting
- `Discovery is disabled`: check **Production runtime** flags, not Build variables.
- `invalid_client`: verify exact registered client ID and that registration exists in production D1.
- `invalid_redirect_uri`: compare the exact callback, including scheme, host, path, and trailing slash.
- HTTP 401 from MCP before authentication is expected.
- A successful metadata request does **not** prove that an OAuth client has been registered or that a novel has been read.
