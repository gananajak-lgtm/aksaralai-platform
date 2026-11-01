# ChatGPT read-only MCP connection via CIMD

## Root cause
The production oauth_clients table had no registered clients. The existing authorization and token endpoints only resolved that table. Plugin packaging supports OAuth client mode `cimd`; no manual callback entry screen is needed for that mode.

## Change
Advertise `client_id_metadata_document_supported`. Resolve only exact HTTPS `chatgpt.com/oauth/client.json` or callback-specific `chatgpt.com/oauth/<id>/client.json` documents, with no redirects, a five-second deadline and a 16 KiB response limit. Validate the document's exact client_id, public-client `none` support and ChatGPT-only callback paths. Persist validated client metadata for existing foreign-key constraints. Never fetch URLs supplied by other clients; existing manually registered clients still work.

Callback values come from the fetched document and must match exactly. No wildcard redirect registration, arbitrary DCR, token extraction, or authentication bypass is introduced. Authorization still requires a signed-in writer, explicit consent, session-bound single-use nonce, S256 PKCE and the read-only scope. The token endpoint accepts only the server's single canonical `/api/mcp` resource when supplied. Issued tokens remain bound to this single resource server and writer.

## Verification
Local suite: 168 passed. Syntax checks and browser-script parsing passed. New SQLite tests cover client foreign keys, valid PKCE exchange, replay, invalid verifier, forged callbacks, write scopes, untrusted client URL fetch prevention, malformed/oversized metadata and network failures. Test manuscripts remain unchanged.

## Connection still requires verification
Create/install the private plugin with remote MCP URL `https://aksaralai-platform.gananajak.workers.dev/api/mcp`, OAuth client mode `cimd` and `novels:read`. Complete the host's supported OAuth login/consent flow, then invoke list_novels, list_chapters and read_chapters through the connected MCP tools. Package creation, CI and direct D1 reads alone do not prove an authenticated MCP connection.

Reference: https://developers.openai.com/plugins/build/auth
