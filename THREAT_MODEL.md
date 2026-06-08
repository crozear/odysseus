# Threat Model

Odysseus is a **self-hosted AI workspace with privileged local access**. This document states the trust boundary so contributors can reason about security decisions without reading through the full auth and middleware stack.

## Trust Boundary

Odysseus is designed for **trusted users on a private network**, not public exposure. The README describes it as "treat it like an admin console" — that framing is accurate. A logged-in admin can execute shell commands, read and write files, and control model serving. This is intentional. The threat model does not try to prevent admins from doing these things. It does try to prevent:

- Unauthenticated access
- Non-admins reaching admin-only capabilities
- The AI agent acting on instructions injected through untrusted content (web results, emails, fetched pages, memories)
- Internal services (ChromaDB, Ollama, SearXNG, etc.) being reachable from outside the host

## Roles and Capabilities

| Capability | Admin | Non-admin (default) |
|---|---|---|
| Chat with agent | ✓ | ✓ |
| Browser tool | ✓ | ✓ |
| Documents | ✓ | ✓ |
| Research mode | ✓ | ✓ |
| Image generation | ✓ | ✓ |
| Memory management | ✓ | ✓ |
| Shell / Python execution | ✓ | ✗ |
| File read / write | ✓ | ✗ |
| MCP tools | ✓ | ✗ |
| Token / webhook management | ✓ | ✗ |
| Model serving | ✓ | ✗ |
| Vault | ✓ | ✗ |
| Settings | ✓ | ✗ |

This fork runs single-user. The non-admin tool-gating layer (formerly `src/tool_security.py:NON_ADMIN_BLOCKED_TOOLS`) has been removed — the sole owner always has full tool access.

## Authentication

- **Sessions:** bcrypt passwords, 7-day session tokens stored atomically in `data/sessions.json` via `core/atomic_io.py`.
- **2FA:** TOTP with 8 single-use backup codes. Verified after password check, before session issuance.
- **Reserved usernames:** `internal-tool`, `api`, `demo`, `system` cannot be registered or renamed into. Defined in `core/auth.py:RESERVED_USERNAMES`.
  - `internal-tool` is security-critical: `core/middleware.py:require_admin` treats any request where `request.state.current_user == "internal-tool"` as the in-process tool loopback and grants admin unconditionally. A real account with that name would silently pass every `require_admin` check.
- **Orphan sessions:** `validate_token` re-checks that the user record still exists on every call. A deleted user's cookie is dropped on next request rather than continuing to authenticate.

## Internal Tool Loopback

Agent tool calls reach admin-gated HTTP routes over an in-process HTTP loopback. The mechanism:

1. At app startup, `core/middleware.py` generates a random `INTERNAL_TOOL_TOKEN` via `secrets.token_hex(32)`. It is never persisted and never sent to clients.
2. Loopback requests carry `X-Odysseus-Internal-Token: <token>` or have `request.state.current_user` already set to `"internal-tool"` by the auth middleware.
3. `require_admin` recognises either signal and grants access without checking the session user.

Because this fork is single-user, the agent's session owner always resolves to the admin, so there is no per-owner gate on loopback calls.

## Prompt-Injection Hardening

The dedicated untrusted-content wrapper (formerly `src/prompt_security.py`) has been removed in this single-user fork. With no other users to defend against, external content (web results, fetched URLs, memories, skills, notes, tool output) is not wrapped in an untrusted-context envelope. Re-introduce such a layer if this instance is ever exposed to multiple or untrusted users.

## Security Headers

`core/middleware.py:SecurityHeadersMiddleware` sets headers on every response:

- `X-Frame-Options: DENY` + `frame-ancestors 'none'` on all routes except tool-render iframes (which are sandboxed at the HTML level).
- `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer` everywhere.
- **CSP:** nonce-based `script-src 'self' 'nonce-{nonce}' https://cdn.jsdelivr.net`. `style-src 'unsafe-inline'` is intentionally kept — `static/index.html` ships inline `<style>` blocks and JS modules set `style=""` attributes at runtime. Inline styles do not execute script so the risk is visual-only. Removing this requires templating the HTML files and auditing all JS-set style attributes.

## Known Gaps

These are open, acknowledged, and contributor help is welcome:

1. **No shell/filesystem sandbox.** The agent `bash` and `read_file`/`write_file` tools run as the app process user with no network egress filtering or filesystem confinement. A successful prompt-injection reaching a shell-enabled admin session can make outbound requests to internal services. See #1058 for the sandbox proposal.

2. **SSRF via `/api/v1/chat` `base_url` parameter.** A chat-scoped API token can supply an arbitrary `base_url`; the server forwards the LLM request to that host without validating the scheme or address. PR #1039 fixes this.

3. **`src/search/` partial consolidation.** `src.search.core` and `src.search.providers` correctly alias `services.search` via `sys.modules` replacement. `analytics`, `cache`, `content`, `query`, and `ranking` are still independent copies that can drift. The SSRF regression tests in `tests/test_webhook_ssrf_resilience.py` test `src.webhook_manager` directly (separate from search), so the safety net there is intact. See #1058.

4. **Token scopes are coarse.** There is no way to grant a session a subset of the owning user's privileges. Companion/mobile tokens carry either `chat` or `admin` scope with no per-capability granularity.
