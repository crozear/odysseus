"""Codex integration routes — Claude Code skill bundle delivery."""

import zipfile
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from src.auth_helpers import require_user


def setup_claude_routes() -> APIRouter:
    """Serve the Claude Code skill bundle.

    Claude Code uses the same scope-gated `/api/codex/*` endpoints at runtime;
    this router only exists to deliver the skill zip via `/api/claude/plugin.zip`
    so the user-facing setup commands stay in the Claude namespace.
    """
    router = APIRouter(prefix="/api/claude", tags=["claude"])

    @router.get("/plugin.zip")
    def plugin_zip(request: Request):
        require_user(request)
        # Only ship the skills/ subtree so extracting at ~/.claude/ doesn't dump
        # README.md or other bundle metadata into the user's claude config dir.
        skills_root = Path(__file__).resolve().parent.parent / "integrations" / "claude" / "skills"
        if not skills_root.exists():
            raise HTTPException(404, "Claude skill bundle not found")
        bundle_root = skills_root.parent
        buf = BytesIO()
        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for path in sorted(skills_root.rglob("*")):
                if path.is_dir() or "__pycache__" in path.parts or path.suffix == ".pyc":
                    continue
                zf.write(path, path.relative_to(bundle_root))
        buf.seek(0)
        headers = {"Content-Disposition": 'attachment; filename="odysseus-claude-skill.zip"'}
        return StreamingResponse(buf, media_type="application/zip", headers=headers)

    return router
