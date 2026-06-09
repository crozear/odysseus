"""Regression tests for Anthropic prompt-cache breakpoints in _build_anthropic_payload (#791)."""
from src import llm_core


def _payload(system="sys", user="hi", tools=None):
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    return llm_core._build_anthropic_payload("claude", messages, 0.0, 1000, stream=True, tools=tools)


def test_agentic_caches_system_and_last_tool():
    tools = [
        {"type": "function", "function": {"name": "a", "description": "x", "parameters": {}}},
        {"type": "function", "function": {"name": "b", "description": "y", "parameters": {}}},
    ]
    p = _payload(system="SYS PROMPT " * 50, tools=tools)
    assert isinstance(p["system"], list)
    assert p["system"][0].get("cache_control") == {"type": "ephemeral"}
    assert "cache_control" not in p["tools"][0], "only the LAST tool is a breakpoint"
    assert p["tools"][-1].get("cache_control") == {"type": "ephemeral"}
    breakpoints = sum("cache_control" in b for b in p["system"]) + sum("cache_control" in t for t in p["tools"])
    assert breakpoints == 2


def test_tiny_tool_less_prompt_not_cached():
    p = _payload(system="hi", tools=None)
    assert isinstance(p["system"], list)
    assert "cache_control" not in p["system"][0]


def test_large_system_only_is_cached():
    p = _payload(system="z" * 5000, tools=None)
    assert p["system"][0].get("cache_control") == {"type": "ephemeral"}


def test_multiple_system_blocks_cache_only_last():
    """Custom + about-user + persona arrive as SEPARATE system blocks, in order,
    with the single cache breakpoint on the LAST one (the stable-prefix tail)."""
    messages = [
        {"role": "system", "content": "CUSTOM " * 700},  # >4000 chars total
        {"role": "system", "content": "About the user:\nAlice"},
        {"role": "system", "content": "The user is roleplaying as Bob."},
        {"role": "user", "content": "hi"},
    ]
    p = llm_core._build_anthropic_payload("claude", messages, 0.0, 1000, stream=True)
    assert isinstance(p["system"], list)
    assert [b["text"] for b in p["system"]] == [
        "CUSTOM " * 700,
        "About the user:\nAlice",
        "The user is roleplaying as Bob.",
    ]
    assert sum("cache_control" in b for b in p["system"]) == 1, "exactly one breakpoint"
    assert p["system"][-1].get("cache_control") == {"type": "ephemeral"}


def test_breakpoint_follows_last_present_block_when_persona_missing():
    """With the persona absent, the breakpoint falls on whatever block is last
    (here 'About the user'), so the stable prefix is still fully cached."""
    messages = [
        {"role": "system", "content": "CUSTOM " * 700},
        {"role": "system", "content": "About the user:\nAlice"},
        {"role": "user", "content": "hi"},
    ]
    p = llm_core._build_anthropic_payload("claude", messages, 0.0, 1000, stream=True)
    assert len(p["system"]) == 2
    assert "cache_control" not in p["system"][0]
    assert p["system"][-1].get("cache_control") == {"type": "ephemeral"}


def test_marked_anchor_keeps_volatile_tail_uncached():
    """When the producer marks the stable-prefix tail (cache_control on the
    persona), volatile context appended AFTER it (memory/RAG/web) becomes its own
    system block but stays OUTSIDE the cached region — the breakpoint lands on the
    marked block, not the last one."""
    messages = [
        {"role": "system", "content": "CUSTOM " * 700},          # 0: stable
        {"role": "system", "content": "About the user:\nAlice"},  # 1: stable
        {"role": "system", "content": "The user is roleplaying as Bob.",
         "cache_control": {"type": "ephemeral"}},                 # 2: stable tail (marked)
        {"role": "system", "content": "Relevant documents:\n" + "z" * 3000},  # 3: volatile
        {"role": "user", "content": "hi"},
    ]
    p = llm_core._build_anthropic_payload("claude", messages, 0.0, 1000, stream=True)
    assert len(p["system"]) == 4, "volatile context survives to the wire as its own block"
    assert sum("cache_control" in b for b in p["system"]) == 1, "exactly one breakpoint"
    assert p["system"][2].get("cache_control") == {"type": "ephemeral"}, "breakpoint on the marked tail"
    assert "cache_control" not in p["system"][3], "volatile tail is NOT cached"


def test_marked_tiny_prefix_not_cached_even_with_large_volatile_tail():
    """The size gate counts only the stable prefix (up to the marker), so a tiny
    pinned prefix doesn't get a pointless cache write just because a big volatile
    block follows it."""
    messages = [
        {"role": "system", "content": "Hi.", "cache_control": {"type": "ephemeral"}},  # tiny anchor
        {"role": "system", "content": "Relevant documents:\n" + "z" * 5000},           # large volatile
        {"role": "user", "content": "hi"},
    ]
    p = llm_core._build_anthropic_payload("claude", messages, 0.0, 1000, stream=True)
    assert len(p["system"]) == 2
    assert all("cache_control" not in b for b in p["system"]), "tiny prefix → no cache"


def test_marked_anchor_caches_when_tools_present_regardless_of_size():
    """An agentic call (tools present) always reuses the prefix, so the marked
    anchor is cached even when the stable prefix is small."""
    tools = [{"type": "function", "function": {"name": "a", "description": "x", "parameters": {}}}]
    messages = [
        {"role": "system", "content": "Short prompt.", "cache_control": {"type": "ephemeral"}},
        {"role": "system", "content": "Memory context.\n- something"},  # volatile
        {"role": "user", "content": "hi"},
    ]
    p = llm_core._build_anthropic_payload("claude", messages, 0.0, 1000, stream=True, tools=tools)
    assert p["system"][0].get("cache_control") == {"type": "ephemeral"}
    assert "cache_control" not in p["system"][1]


# ── Explicit per-preset cache controls (system / chat history + 5m/1h TTLs) ──

_TOOLS = [
    {"type": "function", "function": {"name": "a", "description": "x", "parameters": {}}},
    {"type": "function", "function": {"name": "b", "description": "y", "parameters": {}}},
]


def _convo(turns=3):
    """system + `turns` user/assistant pairs + a trailing user message."""
    msgs = [{"role": "system", "content": "sys prompt"}]
    for i in range(turns):
        msgs.append({"role": "user", "content": f"question {i}"})
        msgs.append({"role": "assistant", "content": f"answer {i}"})
    msgs.append({"role": "user", "content": "latest question"})
    return msgs


def _count_breakpoints(p):
    n = sum("cache_control" in b for b in p.get("system", []))
    n += sum("cache_control" in t for t in p.get("tools", []))
    for m in p["messages"]:
        if isinstance(m.get("content"), list):
            n += sum("cache_control" in b for b in m["content"] if isinstance(b, dict))
    return n


def test_explicit_cache_system_true_overrides_size_gate():
    """cache_system=True caches even a tiny tool-less prompt (no heuristic)."""
    p = llm_core._build_anthropic_payload(
        "claude", [{"role": "system", "content": "hi"}, {"role": "user", "content": "q"}],
        0.0, 1000, cache_system=True,
    )
    assert p["system"][0].get("cache_control") == {"type": "ephemeral"}


def test_explicit_cache_system_false_overrides_heuristic():
    """cache_system=False disables system caching even when tools + big prompt
    would have auto-cached it. The tools breakpoint is independent and stays."""
    messages = [{"role": "system", "content": "z" * 5000}, {"role": "user", "content": "q"}]
    p = llm_core._build_anthropic_payload(
        "claude", messages, 0.0, 1000, tools=_TOOLS, cache_system=False,
    )
    assert all("cache_control" not in b for b in p["system"])
    assert p["tools"][-1].get("cache_control") == {"type": "ephemeral"}


def test_system_1h_ttl():
    p = llm_core._build_anthropic_payload(
        "claude", _convo(), 0.0, 1000, cache_system=True, cache_system_ttl="1h",
    )
    assert p["system"][0].get("cache_control") == {"type": "ephemeral", "ttl": "1h"}


def test_chat_history_breakpoints_skip_newest_turn():
    """cache_chat drops exactly two rolling breakpoints in the history and
    never marks the newest user turn (it changes every request)."""
    p = llm_core._build_anthropic_payload(
        "claude", _convo(turns=3), 0.0, 1000, cache_chat=True,
    )
    marked = [
        i for i, m in enumerate(p["messages"])
        if isinstance(m.get("content"), list)
        and any("cache_control" in b for b in m["content"] if isinstance(b, dict))
    ]
    assert len(marked) == 2
    assert (len(p["messages"]) - 1) not in marked, "newest user turn must stay uncached"
    assert all("cache_control" not in b for b in p.get("system", [])), "system toggle off"


def test_chat_history_skips_trailing_assistant_prefill():
    """A trailing assistant message (prefill) is never a breakpoint."""
    msgs = _convo(turns=3) + [{"role": "assistant", "content": "prefill:"}]
    p = llm_core._build_anthropic_payload("claude", msgs, 0.0, 1000, cache_chat=True)
    last = p["messages"][-1]
    assert isinstance(last.get("content"), str) or all(
        "cache_control" not in b for b in last["content"] if isinstance(b, dict)
    )


def test_ttl_ordering_promotes_system_and_tools_to_1h():
    """Chat=1h with system=5m and tools present: Anthropic forbids a longer TTL
    after a shorter one (order tools → system → messages), so system and tools
    are promoted to 1h."""
    p = llm_core._build_anthropic_payload(
        "claude", _convo(), 0.0, 1000, tools=_TOOLS,
        cache_system=True, cache_system_ttl="5m",
        cache_chat=True, cache_chat_ttl="1h",
    )
    assert p["tools"][-1]["cache_control"] == {"type": "ephemeral", "ttl": "1h"}
    assert p["system"][0]["cache_control"] == {"type": "ephemeral", "ttl": "1h"}
    for m in p["messages"]:
        if isinstance(m.get("content"), list):
            for b in m["content"]:
                if isinstance(b, dict) and "cache_control" in b:
                    assert b["cache_control"] == {"type": "ephemeral", "ttl": "1h"}


def test_ttl_ordering_system_1h_chat_5m_is_not_demoted():
    """system=1h, chat=5m is legal as-is (non-increasing): tools+system 1h, chat 5m."""
    p = llm_core._build_anthropic_payload(
        "claude", _convo(), 0.0, 1000, tools=_TOOLS,
        cache_system=True, cache_system_ttl="1h",
        cache_chat=True, cache_chat_ttl="5m",
    )
    assert p["tools"][-1]["cache_control"] == {"type": "ephemeral", "ttl": "1h"}
    assert p["system"][0]["cache_control"] == {"type": "ephemeral", "ttl": "1h"}
    for m in p["messages"]:
        if isinstance(m.get("content"), list):
            for b in m["content"]:
                if isinstance(b, dict) and "cache_control" in b:
                    assert b["cache_control"] == {"type": "ephemeral"}, "chat stays 5m"


def test_breakpoint_budget_is_at_most_four():
    """tools + system + chat all on: exactly 4 breakpoints (Anthropic's limit)."""
    p = llm_core._build_anthropic_payload(
        "claude", _convo(turns=4), 0.0, 1000, tools=_TOOLS,
        cache_system=True, cache_chat=True,
    )
    assert _count_breakpoints(p) == 4


def test_chat_marker_never_lands_on_thinking_block():
    """The depth marker walks back past thinking/redacted_thinking blocks."""
    msg = {"role": "assistant", "content": [
        {"type": "text", "text": "visible answer"},
        {"type": "thinking", "thinking": "private", "signature": "s"},
    ]}
    assert llm_core._mark_last_block_cacheable(msg, "5m") is True
    assert "cache_control" not in msg["content"][1]
    assert msg["content"][0].get("cache_control") == {"type": "ephemeral"}

    only_thinking = {"role": "assistant", "content": [{"type": "thinking", "thinking": "x"}]}
    assert llm_core._mark_last_block_cacheable(only_thinking, "5m") is False


def test_chat_marker_does_not_mutate_caller_blocks():
    """Marking copies the block — cache_control must not leak into the caller's
    original content blocks (they can be shared with the session history)."""
    shared_block = {"type": "text", "text": "from history"}
    # 3 messages: the depth-2 breakpoint lands exactly on the shared block.
    msgs = [
        {"role": "user", "content": [shared_block]},
        {"role": "assistant", "content": "a"},
        {"role": "user", "content": "b"},
    ]
    p = llm_core._build_anthropic_payload("claude", msgs, 0.0, 1000, cache_chat=True)
    wire_block = p["messages"][0]["content"][0]
    assert wire_block.get("cache_control") == {"type": "ephemeral"}, "breakpoint placed on the wire"
    assert "cache_control" not in shared_block, "caller's block must stay clean"


def test_tool_result_blocks_are_cacheable_breakpoints():
    """Agent-loop histories: a depth breakpoint landing on a tool_result/tool_use
    message is valid (both block types are cacheable)."""
    msgs = [
        {"role": "user", "content": "do the thing"},
        {"role": "assistant", "content": "", "tool_calls": [
            {"id": "t1", "function": {"name": "a", "arguments": "{}"}},
        ]},
        {"role": "tool", "tool_call_id": "t1", "content": "result"},
        {"role": "assistant", "content": "done; next?"},
        {"role": "user", "content": "continue"},
    ]
    p = llm_core._build_anthropic_payload(
        "claude", msgs, 0.0, 1000, tools=_TOOLS, cache_chat=True,
    )
    marked_types = []
    for m in p["messages"]:
        if isinstance(m.get("content"), list):
            for b in m["content"]:
                if isinstance(b, dict) and "cache_control" in b:
                    marked_types.append(b.get("type"))
    assert marked_types, "expected at least one history breakpoint"
    assert all(t not in ("thinking", "redacted_thinking") for t in marked_types)
