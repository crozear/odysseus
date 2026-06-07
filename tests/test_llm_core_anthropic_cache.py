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
