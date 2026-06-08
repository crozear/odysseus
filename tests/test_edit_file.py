"""edit_file: filesystem-write permission policy + behavior."""
import json
import os
import tempfile

import pytest

from src.tool_execution import _do_edit_file
from src.agent_tools import ToolBlock


# ── Behavior ──────────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_edit_file_success():
    p = os.path.join("/tmp", "ef_ok.py")
    open(p, "w").write("def f():\n    return 1\n")
    res = await _do_edit_file(json.dumps({"path": p, "old_string": "return 1", "new_string": "return 2"}))
    assert res["exit_code"] == 0
    assert open(p).read() == "def f():\n    return 2\n"
    assert res["diff"]["added"] == 1 and res["diff"]["removed"] == 1 and res["diff"]["file"] == "ef_ok.py"
    os.unlink(p)


@pytest.mark.asyncio
async def test_edit_file_not_found():
    p = os.path.join("/tmp", "ef_nf.txt")
    open(p, "w").write("hello\n")
    res = await _do_edit_file(json.dumps({"path": p, "old_string": "nope", "new_string": "x"}))
    assert res["exit_code"] == 1 and "not found" in res["error"]
    os.unlink(p)


@pytest.mark.asyncio
async def test_edit_file_non_unique():
    p = os.path.join("/tmp", "ef_dup.txt")
    open(p, "w").write("x\nx\n")
    res = await _do_edit_file(json.dumps({"path": p, "old_string": "x", "new_string": "y"}))
    assert res["exit_code"] == 1 and "not unique" in res["error"]
    # replace_all resolves it
    res = await _do_edit_file(json.dumps({"path": p, "old_string": "x", "new_string": "y", "replace_all": True}))
    assert res["exit_code"] == 0 and open(p).read() == "y\ny\n"
    os.unlink(p)


@pytest.mark.asyncio
async def test_edit_file_outside_allowed_roots():
    res = await _do_edit_file(json.dumps({"path": "/etc/hosts", "old_string": "x", "new_string": "y"}))
    assert res["exit_code"] == 1 and ("outside the allowed roots" in res["error"] or "sensitive" in res["error"])
