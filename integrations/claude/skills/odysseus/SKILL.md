---
name: odysseus
description: Use when the user asks Claude Code to read or write Odysseus data (todos, notes, memory, documents) through the scoped Claude Agent API. Requires ODYSSEUS_URL and ODYSSEUS_API_TOKEN.
---

# Odysseus

Use this skill when a user asks to interact with Odysseus from Claude Code.

## Configuration

Expect these environment variables:

- `ODYSSEUS_URL`: Base URL for the user's Odysseus instance, for example `http://127.0.0.1:7000`.
- `ODYSSEUS_API_TOKEN`: Scoped API token created in Odysseus Settings > Integrations > Add Integration > Claude Agent.

If either value is missing, do not guess credentials. Tell the user to create a Claude Agent token in Odysseus Settings and expose both values to the terminal session.

## When to use what

- **Reminder ("remind me at 5pm to do X")** → TODO with `due_date`. The due_date IS the reminder — it fires a browser/ntfy notification automatically.
- **Note / freeform info ("note that the wifi password is ...")** → memory or todo without a due_date (depending on whether it's a fact about the user or an action item).
- **Persistent fact / preference about the user** → memory.

## Safety

- All Odysseus data access MUST go through the scoped HTTP API under `/api/codex/*` (the canonical scope-gated agent API, shared by all agent integrations).
- Check `/api/codex/capabilities` before using a tool surface.
- Treat `403` as an intentional Settings restriction. Do not work around it.
- Do not use SSH, Docker, direct Python imports, SQLite queries, MCP internals, browser cookies, or local files to read/write Odysseus user data.
- Do not call helpers like `do_manage_notes` or database sessions directly for user data, even if shell access exists.
- Keep actions scoped to the token owner.

## Todos

The scoped agent API supports todos/checklists:

- `GET /api/codex/todos`
- `POST /api/codex/todos`

Use the bundled helper script when available:

```bash
python3 ~/.claude/skills/odysseus/scripts/odysseus_api.py capabilities
python3 ~/.claude/skills/odysseus/scripts/odysseus_api.py todos list
python3 ~/.claude/skills/odysseus/scripts/odysseus_api.py todos add "Follow up"
```

Supported todo actions are `list`, `add`, `update`, `delete`, and `toggle_item`.

**Reminders (todos with a due date)** — the backend parses natural language. Send `due_date` in the body via the generic POST so the time becomes a structured reminder, NOT a literal substring inside the title. The `todos add TITLE` shortcut only sets the title, so use the POST form for anything with a time:

```bash
python3 ~/.claude/skills/odysseus/scripts/odysseus_api.py POST /api/codex/todos '{"action":"add","title":"Call dentist","due_date":"tomorrow at 5pm"}'
```

The backend accepts both ISO timestamps and natural language like `"tomorrow 5pm"`, `"next Monday 9am"`, `"in 2 hours"`. It anchors to the user's timezone.


## Memory

- `GET /api/codex/memory` — list memories for the token owner.
- `POST /api/codex/memory` — body `{"text": "...", "category": "fact", "source": "user", "session_id": null}`. Requires `memory:write`.
- `DELETE /api/codex/memory/{memory_id}` — remove a memory entry. Requires `memory:write`.

```bash
python3 ~/.claude/skills/odysseus/scripts/odysseus_api.py GET /api/codex/memory
python3 ~/.claude/skills/odysseus/scripts/odysseus_api.py POST /api/codex/memory '{"text":"User prefers SI units","category":"preference"}'
```


## Documents

- `GET /api/codex/documents?search=...&limit=50` — paginated library.
## Documents

- `GET /api/codex/documents/{doc_id}` — fetch one document.
- `POST /api/codex/documents` — body `{"session_id": "...", "title": "...", "content": "...", "language": "markdown"}`. Requires `documents:write`.
- `DELETE /api/codex/documents/{doc_id}` — delete a document. Requires `documents:write`.


If you are about to reach the Odysseus host/container, import app internals, query the database, or call MCP helper modules directly, stop. Those paths bypass Odysseus Settings and token scopes. Ask the user to enable the relevant Claude Agent tool toggle instead.

## Forbidden Bypass Pattern

If you are about to reach the Odysseus host/container, import app internals, query the database, or call MCP helper modules directly, stop. Those paths bypass Odysseus Settings and token scopes. Ask the user to enable the relevant Claude Agent tool toggle instead.
