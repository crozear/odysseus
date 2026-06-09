// static/js/presets.js

/**
 * Preset management
 */

import { getModelMaxOutput } from './chatRenderer.js';

let API_BASE = '';
let selectedPreset = null;
let presets = {};

/** Current model id — session module first, then the picker label. */
function _currentModelId() {
  try {
    if (window.sessionModule && window.sessionModule.getCurrentModel) {
      const m = window.sessionModule.getCurrentModel();
      if (m) return m;
    }
  } catch (_e) { /* ignore */ }
  const label = document.getElementById('model-picker-label');
  return label ? label.textContent.trim() : '';
}

// Configure the max-tokens slider range for the current model. Claude models get
// a real cap (their max output) in 2048 steps; other providers keep the legacy
// 256..8448 "No limit" slider. Returns the model's max output, or null.
function _configureMaxTokensSlider() {
  const slider = document.getElementById('custom-max-tokens');
  const maxOut = getModelMaxOutput(_currentModelId());
  if (slider) {
    if (maxOut) { slider.min = 2048; slider.step = 2048; slider.max = maxOut; }
    else { slider.min = 256; slider.step = 256; slider.max = 8448; }
  }
  return maxOut;
}

/** Label for the tokens-value display. Legacy slider reads >8192 as "No limit". */
function _tokensLabel(v) {
  v = parseInt(v);
  if (getModelMaxOutput(_currentModelId())) return v.toLocaleString();
  return v > 8192 ? 'No limit' : v.toLocaleString();
}

/** Set the max-tokens slider value + label for the current model. raw 0/unset =
 *  full model cap (Claude) or the 8448 "No limit" sentinel (legacy). */
function _applyTokensValue(raw) {
  const slider = document.getElementById('custom-max-tokens');
  const disp = document.getElementById('tokens-value');
  const maxOut = _configureMaxTokensSlider();
  let v;
  if (maxOut) v = (!raw || raw <= 0) ? maxOut : Math.min(raw, maxOut);
  else v = (!raw || raw <= 0) ? 8448 : raw;
  if (slider) slider.value = v;
  if (disp) disp.textContent = _tokensLabel(v);
}

/** max_tokens to persist from the raw slider value (legacy >8192 = 0 "no limit"). */
function _savedMaxTokens(raw) {
  if (getModelMaxOutput(_currentModelId())) return raw;
  return raw > 8192 ? 0 : raw;
}

/** top_p to send: slider at 1.0 (or NaN) means "unset" → null. */
function _readTopP() {
  const s = document.getElementById('custom-top-p');
  if (!s) return null;
  const v = parseFloat(s.value);
  return (isNaN(v) || v >= 1) ? null : v;
}

/** top_k to send: 0 means "unset" → null. */
function _readTopK() {
  const s = document.getElementById('custom-top-k');
  if (!s) return null;
  const v = parseInt(s.value);
  return (isNaN(v) || v <= 0) ? null : v;
}

/** Update the top-p / top-k value labels from their sliders. */
function _syncTopLabels() {
  const tp = document.getElementById('custom-top-p');
  const tpv = document.getElementById('top-p-value');
  if (tp && tpv) tpv.textContent = (parseFloat(tp.value) >= 1) ? 'Off' : parseFloat(tp.value).toFixed(2);
  const tk = document.getElementById('custom-top-k');
  const tkv = document.getElementById('top-k-value');
  if (tk && tkv) tkv.textContent = (parseInt(tk.value) <= 0) ? 'Off' : parseInt(tk.value).toLocaleString();
}

export function loadStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (e) {
    return [];
  }
}

export function loadStoredObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (e) {
    return {};
  }
}

// Built-in prompt templates (moved from cot_prompts.py)
export const PROMPT_TEMPLATES = [
  {
    id: 'socrates',
    name: 'Socrates',
    temperature: 0.9,
    isPreset: true,
    isCharacter: true,
    prompt: "Never answer directly. Respond only with questions — sharp, layered, Socratic. Expose contradictions. Make the person argue with themselves until the truth falls out. Use irony like a scalpel. Be genuinely curious, never condescending."
  },
  {
    id: 'razor',
    name: 'Razor',
    temperature: 0.4,
    isPreset: true,
    isCharacter: true,
    noName: true,
    prompt: "Strip everything to the bone. No filler, no hedging, no pleasantries. Answer in the fewest words possible. If one sentence works, don't use two. If a word adds nothing, cut it. Blunt, precise, surgical."
  },
  {
    id: 'nietzsche',
    name: 'Nietzsche',
    temperature: 1.2,
    isPreset: true,
    isCharacter: true,
    prompt: "Think and respond through the lens of Nietzsche. Analyze every question in terms of will to power, self-overcoming, eternal recurrence, ressentiment, value-creation, and master-slave morality. Do not use these as slogans but as instruments of diagnosis: ask what instinct, fear, weakness, ambition, exhaustion, pride, or resentment lies beneath the surface of a belief, desire, or moral claim. Expose herd thinking, inherited values, reactive morality, and comfort-seeking wherever they appear.\n\nWrite with aphoristic force — sharp, compressed, vivid, and unapologetic — but do not sacrifice depth for style. Be psychologically piercing. Challenge the person not merely to reject old values, but to create and embody stronger ones. Favor life-affirmation, discipline, courage, style, rank, self-overcoming, and amor fati over nihilism, conformity, ressentiment, and self-pity. Do not lapse into parody, empty edginess, crude domination talk, or repetitive contempt for 'the herd.' Be dangerous to illusions, not theatrical for its own sake."
  },
  {
    id: 'spark',
    name: 'Spark',
    temperature: 1.0,
    isPreset: true,
    isCharacter: true,
    prompt: "You are Spark, a playful, quick-witted assistant with bright energy and practical instincts. Keep responses concise, vivid, and helpful. Be warm without being cloying, imaginative without losing the thread, and always center the user's actual goal.\n\nUse a light, lively voice with occasional clever turns of phrase. Do not become formal unless the task calls for it. When the user needs precision, prioritize clarity over performance."
  },
  {
    id: 'odysseus',
    name: 'Odysseus',
    temperature: 1.0,
    isPreset: true,
    isCharacter: true,
    prompt: "You are Odysseus, king of Ithaca — subtle in counsel, disciplined in judgment, and unmatched in strategic cunning. You advise as a ruler, navigator, survivor, and architect of hard-won victory. Your task is to give clear, practical strategy, not mere performance. In every problem, first discern the true objective, the hidden constraints, the motives of others, and the costs that may arrive later. Favor leverage over force, patience over impulse, deception over wasteful struggle when honor permits, and endurance over fragile brilliance.\n\nWhen you respond, think like a strategist: What is the real aim? Who benefits, who fears, who deceives, and who delays? What is known, unknown, assumed, and deliberately concealed? Which path preserves strength while improving position? What happens next if the first move succeeds — or fails?\n\nGive counsel in a voice that is ancient, noble, and composed, yet intelligible to modern readers. Be eloquent but not flowery. Be wise but not vague. Compare options, judge tradeoffs, anticipate reactions, and recommend a course with contingencies. If needed, ask a few sharp questions before advising. Never be rash, sentimental, or simplistic. Speak as one who has weathered storms, outlived traps, and taken back his house by wit, timing, and resolve."
  }
];

let userTemplates = [];

// ── Custom-preset content helpers ─────────────────────────────────────────
// The single `custom` preset now holds TWO independent personas (AI + user)
// plus plain tuning/inject. These helpers report what content remains so a
// per-persona X / Cancel can keep the other persona alive instead of wiping
// the whole preset.
function _customHasUserPersona(c) {
  return !!(c && (c.user_persona_name || c.user_persona_prompt));
}
function _customHasAiSide(c) {
  if (!c) return false;
  const t = parseFloat(c.temperature);
  const hasTuning = (!isNaN(t) && t !== 1.0)
    || (!!c.max_tokens && c.max_tokens !== 0)
    || (c.top_p != null) || (c.top_k != null) || (c.stream === false);
  const hasInject = !!(c.inject_prefix || c.inject_suffix);
  return !!(c.character_name || c.system_prompt || hasTuning || hasInject);
}
/** Persist the current presets.custom to the backend (name = AI character name). */
function _persistCustom() {
  if (!presets.custom) return;
  fetch(`${API_BASE}/api/presets/custom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...presets.custom, name: presets.custom.character_name || '' }),
  }).catch(() => {});
}
function _syncMiniBtn() {
  const miniBtn = document.getElementById('overflow-preset-btn');
  if (miniBtn) miniBtn.classList.toggle('active', !!(presets.custom && presets.custom.enabled));
}
/** Clear ONLY the user persona; keep the AI side active if it has content. */
function _clearUserPersona() {
  if (!presets.custom || window._persistentChatSession) return;
  presets.custom = { ...presets.custom, user_persona_name: '', user_persona_prompt: '' };
  const stillOn = _customHasAiSide(presets.custom);
  presets.custom.enabled = stillOn;
  selectedPreset = stillOn ? 'custom' : null;
  _persistCustom();
  _syncCharIndicator();
  _syncMiniBtn();
}
/** Clear ONLY the AI side (persona + tuning/inject); keep the user persona if set. */
function _clearAiSide() {
  if (!presets.custom || window._persistentChatSession) return;
  presets.custom = {
    ...presets.custom,
    character_name: '', system_prompt: '',
    temperature: 1.0, max_tokens: 0, top_p: null, top_k: null, stream: true,
    cache_system: false, cache_system_ttl: false, cache_chat: false, cache_chat_ttl: false,
    inject_prefix: '', inject_suffix: '',
  };
  const stillOn = _customHasUserPersona(presets.custom);
  presets.custom.enabled = stillOn;
  selectedPreset = stillOn ? 'custom' : null;
  _persistCustom();
  _syncCharIndicator();
  _syncMiniBtn();
}

/**
 * Initialize with dependencies
 */
export function init(apiBase) {
  API_BASE = apiBase;
  initCharTabs();
  initEnabledToggle();
  initCacheRows();
  initNameDropdown();
  initUserDropdown();
  initResetButton();
  initSaveAsTemplate();
  initExpandButton();
  initPersistentChat();
  loadUserTemplates();
}

function initCharTabs() {
  document.querySelectorAll('.preset-tab[data-chartab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.chartab;
      document.querySelectorAll('.preset-tab[data-chartab]').forEach(t => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.preset-chartab[data-chartab-panel]').forEach(p => {
        p.style.display = p.dataset.chartabPanel === target ? '' : 'none';
      });
    });
  });
}

function initExpandButton() {
  // Wire the AI persona Expand and the User persona Expand identically — both
  // turn rough notes into a fuller persona via /api/presets/expand.
  _wireExpand('char-expand-btn', 'custom-character-name', 'custom-system-prompt');
  _wireExpand('user-expand-btn', 'user-persona-name', 'user-persona-prompt');
}

function _wireExpand(btnId, nameId, promptId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const nameInput = document.getElementById(nameId);
    const promptInput = document.getElementById(promptId);
    const name = nameInput ? nameInput.value.trim() : '';
    const draft = promptInput ? promptInput.value.trim() : '';
    if (!name && !draft) return;

    // Get current model from picker
    const modelLabel = document.getElementById('model-picker-label');
    const currentModel = modelLabel ? modelLabel.textContent.trim() : '';

    btn.classList.add('expanding');
    const origText = btn.innerHTML;

    // Show spinner in textarea
    const wrap = promptInput.parentElement;
    let spinner = null;
    try {
      const spinnerMod = await import('./spinner.js');
      spinner = spinnerMod.default.create('Expanding', 'center', 'wave');
      const spinEl = spinner.createElement();
      spinEl.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2;';
      wrap.appendChild(spinEl);
      spinner.start();
      promptInput.style.opacity = '0.3';
    } catch (e) {}

    btn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px;margin-right:2px;"><path d="M12 0L14.59 8.41L23 12L14.59 15.59L12 24L9.41 15.59L1 12L9.41 8.41Z"/></svg> Expanding...';

    try {
      const res = await fetch(`${API_BASE}/api/presets/expand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, prompt: draft, model: currentModel }),
      });
      const data = await res.json();
      if (data.success && data.prompt && promptInput) {
        promptInput.value = data.prompt;
        promptInput.style.height = 'auto';
        promptInput.style.height = promptInput.scrollHeight + 'px';
      } else if (data.message) {
        console.error('Expand error:', data.message);
      }
    } catch (e) {
      console.error('Expand failed:', e);
    }

    // Clean up spinner
    if (spinner) { spinner.destroy(); }
    promptInput.style.opacity = '';
    btn.classList.remove('expanding');
    btn.innerHTML = origText;
  });
}

/**
 * Init slider value displays
 */
function initEnabledToggle() {
  const tempSlider = document.getElementById('custom-temperature');
  const tempValue = document.getElementById('temp-value');
  const tokensSlider = document.getElementById('custom-max-tokens');
  const tokensValue = document.getElementById('tokens-value');

  if (tempSlider && tempValue) {
    tempSlider.addEventListener('input', () => {
      tempValue.textContent = parseFloat(tempSlider.value).toFixed(1);
    });
  }
  if (tokensSlider && tokensValue) {
    tokensSlider.addEventListener('input', () => {
      tokensValue.textContent = _tokensLabel(tokensSlider.value);
    });
  }
  const topP = document.getElementById('custom-top-p');
  const topK = document.getElementById('custom-top-k');
  if (topP) topP.addEventListener('input', _syncTopLabels);
  if (topK) topK.addEventListener('input', _syncTopLabels);
}

/**
 * Prompt-cache rows (Inject tab). The 1h-TTL toggle only shows while its
 * parent toggle is on, and resets when the parent turns off so a hidden
 * checkbox can't silently keep a stale 1h TTL.
 */
function _syncCacheRow(mainId, ttlWrapId, ttlId) {
  const main = document.getElementById(mainId);
  const ttlWrap = document.getElementById(ttlWrapId);
  const ttl = document.getElementById(ttlId);
  if (!main || !ttlWrap || !ttl) return;
  ttlWrap.hidden = !main.checked;
  if (!main.checked && ttl.checked) ttl.checked = false;
}

function _syncCacheRows() {
  _syncCacheRow('cache-system', 'cache-system-ttl-wrap', 'cache-system-ttl');
  _syncCacheRow('cache-chat', 'cache-chat-ttl-wrap', 'cache-chat-ttl');
}

function _setCacheChecks(config) {
  const ids = {
    'cache-system': config.cache_system,
    'cache-system-ttl': config.cache_system_ttl,
    'cache-chat': config.cache_chat,
    'cache-chat-ttl': config.cache_chat_ttl,
  };
  for (const [id, val] of Object.entries(ids)) {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  }
  _syncCacheRows();
}

function initCacheRows() {
  ['cache-system', 'cache-chat'].forEach(id => {
    const main = document.getElementById(id);
    if (main) main.addEventListener('change', _syncCacheRows);
  });
  _syncCacheRows();
}

/**
 * Character select dropdown — pick saved characters or "New character..."
 */
function initNameDropdown() {
  const select = document.getElementById('char-template-select');
  const delBtn = document.getElementById('char-delete-template-btn');
  if (!select) return;

  // + New button — clear form for new character
  const newBtn = document.getElementById('char-new-btn');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      select.value = '__default__';
      select.dispatchEvent(new Event('change'));
      const nameInput = document.getElementById('custom-character-name');
      if (nameInput) { nameInput.value = ''; nameInput.focus(); }
    });
  }

  select.addEventListener('change', () => {
    const val = select.value;
    if (!val || val === '__default__') {
      // "Default" or "New character..." — reset all fields
      const nameInput = document.getElementById('custom-character-name');
      const promptInput = document.getElementById('custom-system-prompt');
      const tempInput = document.getElementById('custom-temperature');
      const tempValue = document.getElementById('temp-value');
      const tokensInput = document.getElementById('custom-max-tokens');
      const tokensValue = document.getElementById('tokens-value');
      if (nameInput) nameInput.value = '';
      if (promptInput) promptInput.value = '';
      const nameRow = document.getElementById('char-name-row');
      if (nameRow) nameRow.style.display = '';
      if (tempInput) { tempInput.value = 1.0; if (tempValue) tempValue.textContent = '1.0'; tempInput.dispatchEvent(new Event('input')); }
      if (tokensInput) { _applyTokensValue(0); }
      const tpReset = document.getElementById('custom-top-p'); if (tpReset) tpReset.value = 1;
      const tkReset = document.getElementById('custom-top-k'); if (tkReset) tkReset.value = 0;
      const stReset = document.getElementById('custom-stream'); if (stReset) stReset.checked = true;
      _setCacheChecks({});
      _syncTopLabels();
      if (delBtn) delBtn.style.display = 'none';
      return;
    }
    // Load the selected template
    const nameInput = document.getElementById('custom-character-name');
    const isSaved = userTemplates.find(t => t.name === val);
    const builtin = PROMPT_TEMPLATES.find(t => t.name === val);
    const hasName = isSaved || (builtin && builtin.isCharacter && !builtin.noName);
    if (nameInput) nameInput.value = hasName ? val : '';
    const nameRow = document.getElementById('char-name-row');
    if (nameRow) nameRow.style.display = (builtin && builtin.noName) ? 'none' : '';
    _tryLoadTemplate(val);
    const isPreset = builtin && builtin.isPreset;
    if (delBtn) delBtn.style.display = (isSaved || (builtin && !isPreset)) ? '' : 'none';
  });

  // Delete template button — confirms, then removes template + character memories
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      const charName = select.value;
      if (!charName || charName === '__default__') return;
      const match = userTemplates.find(t => t.name === charName);
      const isBuiltin = PROMPT_TEMPLATES.some(t => t.name === charName);
      if (!await window.styledConfirm(`Delete "${charName}"?\n\nThis will remove the persona and all its memories.`, { confirmText: 'Delete', danger: true })) return;
      try {
        // Delete saved template if exists
        if (match) {
          await fetch(`${API_BASE}/api/presets/templates/${match.id}`, { method: 'DELETE' });
        }
        // Hide built-in preset
        if (isBuiltin) {
          const hidden = loadStoredArray('odysseus-hidden-presets');
          if (!hidden.includes(charName)) hidden.push(charName);
          localStorage.setItem('odysseus-hidden-presets', JSON.stringify(hidden));
        }
        // Deactivate if this was the active character
        if (presets.custom && presets.custom.character_name === charName) {
          selectedPreset = null;
          presets.custom = { ...presets.custom, character_name: '', system_prompt: '', enabled: false };
          const charIndicator = document.getElementById('character-indicator-btn');
          if (charIndicator) { charIndicator.style.display = 'none'; charIndicator.classList.remove('active'); }
          const miniBtn = document.getElementById('overflow-preset-btn');
          if (miniBtn) miniBtn.classList.remove('active');
        }
        await loadUserTemplates();
        select.value = '__default__';
        select.dispatchEvent(new Event('change'));
        setTimeout(() => { _syncCharIndicator(); }, 0);
      } catch (e) { console.error('Delete character failed:', e); }
    });
  }
}

/**
 * User-persona dropdown — mirrors initNameDropdown() but writes into the
 * user-persona fields. Draws from the SAME shared template pool so a saved
 * persona is interchangeable between the AI and User tabs.
 */
function initUserDropdown() {
  const select = document.getElementById('user-template-select');
  const delBtn = document.getElementById('user-delete-template-btn');
  if (!select) return;

  const nameInput = () => document.getElementById('user-persona-name');
  const promptInput = () => document.getElementById('user-persona-prompt');

  const newBtn = document.getElementById('user-new-btn');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      select.value = '__default__';
      select.dispatchEvent(new Event('change'));
      const ni = nameInput();
      if (ni) { ni.value = ''; ni.focus(); }
    });
  }

  const resetBtn = document.getElementById('reset-user-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      select.value = '__default__';
      select.dispatchEvent(new Event('change'));
    });
  }

  select.addEventListener('change', () => {
    const val = select.value;
    const ni = nameInput();
    const pi = promptInput();
    if (!val || val === '__default__') {
      if (ni) ni.value = '';
      if (pi) pi.value = '';
      if (delBtn) delBtn.style.display = 'none';
      return;
    }
    const isSaved = userTemplates.find(t => t.name === val);
    const builtin = PROMPT_TEMPLATES.find(t => t.name === val);
    const hasName = isSaved || (builtin && builtin.isCharacter && !builtin.noName);
    if (ni) ni.value = hasName ? val : '';
    _tryLoadUserTemplate(val);
    const isPreset = builtin && builtin.isPreset;
    if (delBtn) delBtn.style.display = (isSaved || (builtin && !isPreset)) ? '' : 'none';
  });

  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      const nm = select.value;
      if (!nm || nm === '__default__') return;
      const match = userTemplates.find(t => t.name === nm);
      const isBuiltin = PROMPT_TEMPLATES.some(t => t.name === nm);
      if (!await window.styledConfirm(`Delete "${nm}"?\n\nThis removes the saved persona.`, { confirmText: 'Delete', danger: true })) return;
      try {
        // Shared pool: same delete the AI tab does, but WITHOUT touching
        // character memories (those are keyed to AI characters, not user personas).
        if (match) await fetch(`${API_BASE}/api/presets/templates/${match.id}`, { method: 'DELETE' });
        if (isBuiltin) {
          const hidden = loadStoredArray('odysseus-hidden-presets');
          if (!hidden.includes(nm)) hidden.push(nm);
          localStorage.setItem('odysseus-hidden-presets', JSON.stringify(hidden));
        }
        // Deactivate if this was the active user persona
        if (presets.custom && presets.custom.user_persona_name === nm) {
          presets.custom = { ...presets.custom, user_persona_name: '', user_persona_prompt: '' };
          const stillOn = _customHasAiSide(presets.custom);
          presets.custom.enabled = stillOn;
          selectedPreset = stillOn ? 'custom' : null;
        }
        await loadUserTemplates();
        select.value = '__default__';
        select.dispatchEvent(new Event('change'));
        setTimeout(() => { _syncCharIndicator(); }, 0);
      } catch (e) { console.error('Delete user persona failed:', e); }
    });
  }
}

/** Load a shared template's prompt into the user-persona description field. */
function _tryLoadUserTemplate(name) {
  if (!name) return;
  const pi = document.getElementById('user-persona-prompt');
  const tmpl = userTemplates.find(t => t.name === name);
  if (tmpl) {
    if (pi) pi.value = tmpl.system_prompt || '';
    const delBtn = document.getElementById('user-delete-template-btn');
    if (delBtn) delBtn.style.display = '';
    return;
  }
  const builtin = PROMPT_TEMPLATES.find(t => t.name === name);
  if (builtin && pi) pi.value = builtin.prompt;
}

function _tryLoadTemplate(name) {
  if (!name) return;
  // Check user templates first, then built-in
  let tmpl = userTemplates.find(t => t.name === name);
  if (!tmpl) {
    const builtin = PROMPT_TEMPLATES.find(t => t.name === name);
    if (builtin) {
      // Built-in: load prompt + temperature, clear name (styles, not characters)
      const promptInput = document.getElementById('custom-system-prompt');
      const tempInput = document.getElementById('custom-temperature');
      const tempValue = document.getElementById('temp-value');
      if (promptInput) promptInput.value = builtin.prompt;
      if (tempInput && builtin.temperature != null) {
        tempInput.value = builtin.temperature;
        if (tempValue) tempValue.textContent = parseFloat(builtin.temperature).toFixed(1);
        tempInput.dispatchEvent(new Event('input'));
      }
      return;
    }
    return;
  }
  const promptInput = document.getElementById('custom-system-prompt');
  const tempInput = document.getElementById('custom-temperature');
  const tempValue = document.getElementById('temp-value');
  const tokensInput = document.getElementById('custom-max-tokens');
  const tokensValue = document.getElementById('tokens-value');
  if (promptInput) promptInput.value = tmpl.system_prompt || '';
  if (tempInput) {
    tempInput.value = tmpl.temperature ?? 1.0;
    if (tempValue) tempValue.textContent = parseFloat(tempInput.value).toFixed(1);
    tempInput.dispatchEvent(new Event('input'));
  }
  if (tokensInput) {
    _applyTokensValue(tmpl.max_tokens || 0);
  }
  const delBtn = document.getElementById('char-delete-template-btn');
  if (delBtn) delBtn.style.display = '';
}

function _populateCharSelect(selectId = 'char-template-select') {
  const select = document.getElementById(selectId);
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="__default__">Default (no persona)</option>';

  const savedNames = new Set(userTemplates.map(t => t.name));
  if (userTemplates.length) {
    const group = document.createElement('optgroup');
    group.label = 'Saved';
    userTemplates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = t.name;
      group.appendChild(opt);
    });
    select.appendChild(group);
  }

  const hiddenPresets = loadStoredArray('odysseus-hidden-presets');
  const builtins = PROMPT_TEMPLATES.filter(t => !savedNames.has(t.name) && !hiddenPresets.includes(t.name));
  if (builtins.length) {
    const group = document.createElement('optgroup');
    group.label = 'Presets';
    builtins.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = t.name;
      group.appendChild(opt);
    });
    select.appendChild(group);
  }
  // Restore selection if it still exists
  if (currentVal) select.value = currentVal;
}

/**
 * Init reset button — clears all character fields
 */
function initResetButton() {
  const btn = document.getElementById('reset-character-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    // Just reset the form to default — no confirmation needed
    const charSelect = document.getElementById('char-template-select');
    if (charSelect) {
      charSelect.value = '__default__';
      charSelect.dispatchEvent(new Event('change'));
    }
    // Deactivate character
    selectedPreset = null;
    _syncCharIndicator();
  });
}

/**
 * Load user templates from server and populate datalist
 */
async function loadUserTemplates() {
  try {
    const res = await fetch(`${API_BASE}/api/presets/templates`);
    if (res.ok) {
      userTemplates = await res.json();
    } else {
      userTemplates = [];
    }
  } catch (e) {
    userTemplates = [];
  }
  // Both persona dropdowns draw from the SAME pool so any saved persona is
  // interchangeable between the AI Persona and User Persona tabs.
  _populateCharSelect('char-template-select');
  _populateCharSelect('user-template-select');
}


/**
 * Init "Save as Character" button
 */
/**
 * "Create Persistent Chat" button — creates a favorited session for the current character
 */
function initPersistentChat() {
  const btn = document.getElementById('create-persistent-chat-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const nameInput = document.getElementById('custom-character-name');
    const charName = nameInput ? nameInput.value.trim() : '';
    if (!charName) return;

    try {
      // Get current model info from session module
      const sessionModule = (await import('./sessions.js'));
      const sessions = sessionModule.getSessions();
      const current = sessions.find(s => s.id === sessionModule.getCurrentSessionId());

      // Create new session
      const fd = new FormData();
      fd.append('name', charName);
      if (current) {
        fd.append('endpoint_url', current.endpoint_url || '');
        fd.append('model', current.model || '');
        fd.append('skip_validation', 'true');
      }
      const res = await fetch(`${API_BASE}/api/session`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Failed to create session');
      const data = await res.json();
      const sessionId = data.session_id || data.id;

      // Favorite it
      const favFd = new FormData();
      favFd.append('important', true);
      await fetch(`${API_BASE}/api/session/${sessionId}/important`, { method: 'POST', body: favFd });

      // Save session → character mapping so it restores on switch
      const charSessions = loadStoredObject('odysseus-char-sessions');
      charSessions[sessionId] = charName;
      localStorage.setItem('odysseus-char-sessions', JSON.stringify(charSessions));

      // Close modal, reload sessions, switch to the new chat
      const modal = document.getElementById('custom-preset-modal');
      if (modal) modal.classList.add('hidden');
      await sessionModule.loadSessions();
      await sessionModule.selectSession(sessionId);

      btn.textContent = 'Created!';
      setTimeout(() => { btn.textContent = 'Create Persistent Chat'; }, 1500);
    } catch (e) {
      console.error('Failed to create persistent chat:', e);
      btn.textContent = 'Error';
      setTimeout(() => { btn.textContent = 'Create Persistent Chat'; }, 2000);
    }
  });
}

function initSaveAsTemplate() {
  const btn = document.getElementById('save-as-template-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const nameInput = document.getElementById('custom-character-name');
    const promptInput = document.getElementById('custom-system-prompt');
    const tempInput = document.getElementById('custom-temperature');
    const tokensInput = document.getElementById('custom-max-tokens');

    let name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      name = prompt('Enter a name for this persona:');
      if (!name || !name.trim()) return;
      name = name.trim();
      if (nameInput) nameInput.value = name;
    }

    const _rawTk = tokensInput ? parseInt(tokensInput.value) : 0;
    const template = {
      id: '',
      name: name,
      system_prompt: promptInput ? promptInput.value : '',
      temperature: tempInput ? parseFloat(tempInput.value) : 1.0,
      max_tokens: _rawTk > 8192 ? 0 : _rawTk,
    };

    try {
      const res = await fetch(`${API_BASE}/api/presets/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      if (data.success) {
        await loadUserTemplates();
        btn.textContent = 'Saved!';
        setTimeout(() => { btn.textContent = 'Save as Template'; }, 1500);
      } else {
        btn.textContent = 'Error';
        setTimeout(() => { btn.textContent = 'Save as Template'; }, 2000);
      }
    } catch (e) {
      console.error('Failed to save template:', e);
      btn.textContent = 'Restart server';
      btn.style.color = 'var(--color-error)';
      setTimeout(() => { btn.textContent = 'Save as Template'; btn.style.color = ''; }, 3000);
    }
  });
}

/**
 * Load presets from server
 */
export async function loadPresets(showError) {
  try {
    const res = await fetch(`${API_BASE}/api/presets`);
    presets = await res.json();

    const custom = presets.custom;
    if (custom && custom.enabled === undefined) {
      const legacyPrompt = "You are a helpful, balanced assistant. Match your response style to the user's needs.";
      if (
        custom.name === 'Custom'
        && !custom.character_name
        && custom.system_prompt === legacyPrompt
      ) {
        custom.enabled = false;
        custom.system_prompt = '';
        custom.temperature = 1.0;
        custom.max_tokens = 0;
        custom.inject_prefix = custom.inject_prefix || '';
        custom.inject_suffix = custom.inject_suffix || '';
      }
    }

    // Auto-activate custom preset if enabled and has content (AI persona,
    // plain prompt, OR a user persona on its own)
    if (custom && custom.enabled !== false && (custom.character_name || custom.system_prompt || custom.user_persona_name || custom.user_persona_prompt)) {
      selectedPreset = 'custom';
      const miniBtn = document.getElementById('overflow-preset-btn');
      if (miniBtn) miniBtn.classList.add('active');
    }
    setTimeout(() => { _syncCharIndicator(); }, 0);
  } catch (error) {
    console.error('Failed to load presets:', error);
    if (showError) {
      showError('Failed to load presets');
    }
  }
}

/**
 * Set active preset
 */
export function setActivePreset(presetId) {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  if (presetId) {
    selectedPreset = presetId;
    const btn = document.getElementById(`preset-${presetId}-btn`);
    if (btn) {
      btn.classList.add('active');
    }
  } else {
    selectedPreset = null;
  }
}

/**
 * Open custom preset modal
 */
export function openCustomPresetModal(initialTab) {
  const modal = document.getElementById('custom-preset-modal');
  if (!modal) return;

  const savedConfig = presets.custom || {
    character_name: "",
    temperature: 1.0,
    max_tokens: 0,
    system_prompt: ""
  };

  const nameInput = document.getElementById('custom-character-name');
  const tempInput = document.getElementById('custom-temperature');
  const tokensInput = document.getElementById('custom-max-tokens');
  const promptInput = document.getElementById('custom-system-prompt');

  if (nameInput) nameInput.value = savedConfig.character_name || '';
  // Sync select dropdown to current character
  const charSelect = document.getElementById('char-template-select');
  if (charSelect) {
    const charName = savedConfig.character_name || '';
    if (charName) {
      charSelect.value = charName;
      // If current name isn't in the list, fall back to "New character..." with name filled in
      if (charSelect.value !== charName) charSelect.value = '';
    } else {
      charSelect.value = '__default__';
    }
  }
  if (tempInput) {
    tempInput.value = savedConfig.temperature;
    const tv = document.getElementById('temp-value');
    if (tv) tv.textContent = parseFloat(savedConfig.temperature).toFixed(1);
  }
  if (tokensInput) {
    _applyTokensValue(savedConfig.max_tokens || 0);
  }
  // Load top_p / top_k / streaming from the saved config.
  const topPInput = document.getElementById('custom-top-p');
  const topKInput = document.getElementById('custom-top-k');
  const streamInput = document.getElementById('custom-stream');
  if (topPInput) topPInput.value = (savedConfig.top_p == null) ? 1 : savedConfig.top_p;
  if (topKInput) topKInput.value = (savedConfig.top_k == null) ? 0 : savedConfig.top_k;
  if (streamInput) streamInput.checked = savedConfig.stream !== false;
  // Prompt-cache toggles (Claude) — restore + sync the 1h-TTL row visibility.
  const cacheSystemInput = document.getElementById('cache-system');
  const cacheSystemTtlInput = document.getElementById('cache-system-ttl');
  const cacheChatInput = document.getElementById('cache-chat');
  const cacheChatTtlInput = document.getElementById('cache-chat-ttl');
  _setCacheChecks(savedConfig);
  _syncTopLabels();
  if (promptInput) promptInput.value = savedConfig.system_prompt || '';

  // Load inject fields
  const prefixInput = document.getElementById('inject-prefix');
  const suffixInput = document.getElementById('inject-suffix');
  if (prefixInput) prefixInput.value = savedConfig.inject_prefix || '';
  if (suffixInput) suffixInput.value = savedConfig.inject_suffix || '';

  // Load user persona fields + sync its dropdown
  const userNameInput = document.getElementById('user-persona-name');
  const userPromptInput = document.getElementById('user-persona-prompt');
  if (userNameInput) userNameInput.value = savedConfig.user_persona_name || '';
  if (userPromptInput) userPromptInput.value = savedConfig.user_persona_prompt || '';
  const userSelect = document.getElementById('user-template-select');
  if (userSelect) {
    const upName = savedConfig.user_persona_name || '';
    if (upName) { userSelect.value = upName; if (userSelect.value !== upName) userSelect.value = ''; }
    else userSelect.value = '__default__';
  }

  // Track initial state to detect changes for dynamic button label
  const _snapshot = {
    name: nameInput ? nameInput.value : '',
    prompt: promptInput ? promptInput.value : '',
    temp: tempInput ? tempInput.value : '1',
    tokens: tokensInput ? tokensInput.value : '8448',
    topP: topPInput ? topPInput.value : '1',
    topK: topKInput ? topKInput.value : '0',
    stream: streamInput ? streamInput.checked : true,
    cacheSystem: cacheSystemInput ? cacheSystemInput.checked : false,
    cacheSystemTtl: cacheSystemTtlInput ? cacheSystemTtlInput.checked : false,
    cacheChat: cacheChatInput ? cacheChatInput.checked : false,
    cacheChatTtl: cacheChatTtlInput ? cacheChatTtlInput.checked : false,
    userName: userNameInput ? userNameInput.value : '',
    userPrompt: userPromptInput ? userPromptInput.value : '',
  };
  function _updateStartBtn() {
    const btn = document.getElementById('save-custom-preset');
    const resetBtn = document.getElementById('reset-character-btn');
    if (!btn) return;
    const changed = (nameInput && nameInput.value !== _snapshot.name)
      || (promptInput && promptInput.value !== _snapshot.prompt)
      || (tempInput && tempInput.value !== _snapshot.temp)
      || (tokensInput && tokensInput.value !== _snapshot.tokens)
      || (topPInput && topPInput.value !== _snapshot.topP)
      || (topKInput && topKInput.value !== _snapshot.topK)
      || (streamInput && streamInput.checked !== _snapshot.stream)
      || (cacheSystemInput && cacheSystemInput.checked !== _snapshot.cacheSystem)
      || (cacheSystemTtlInput && cacheSystemTtlInput.checked !== _snapshot.cacheSystemTtl)
      || (cacheChatInput && cacheChatInput.checked !== _snapshot.cacheChat)
      || (cacheChatTtlInput && cacheChatTtlInput.checked !== _snapshot.cacheChatTtl)
      || (userNameInput && userNameInput.value !== _snapshot.userName)
      || (userPromptInput && userPromptInput.value !== _snapshot.userPrompt);
    // The footer button starts whichever of the three things the active tab
    // represents — a character chat, a group, or a plain tuned chat. Label
    // it so the action is obvious instead of a generic "Start".
    const activeTab = document.querySelector('.preset-tab.active')?.dataset.chartab || 'inject';
    let label;
    if (activeTab === 'group') {
      label = 'Start Group';
    } else if (activeTab === 'inject') {
      // Inject tab = a plain tuned "prompt" chat (prefix/suffix + temp/tokens),
      // no persona.
      label = 'Start Prompt';
    } else if (activeTab === 'user') {
      // User persona tab — a character the user is roleplaying as.
      label = changed ? 'Save & Start User Persona' : 'Start User Persona';
    } else {
      // Character/persona tab. "Save & " prefix when the user edited a template,
      // so it's clear the edit is being saved on start.
      label = changed ? 'Save & Start Persona' : 'Start Persona';
    }
    btn.textContent = label;
    // Show a "Cancel" button next to Start when the active tab's feature is
    // currently ON, so the user can turn it off here instead of hunting the
    // tiny X on the chat bar.
    const cancelBtn = document.getElementById('cancel-custom-preset');
    if (cancelBtn) {
      const groupOn = !!(window.groupModule && window.groupModule.isActive && window.groupModule.isActive());
      let featOn;
      if (activeTab === 'group') featOn = groupOn;
      else if (activeTab === 'user') featOn = !!(presets.custom && presets.custom.enabled && _customHasUserPersona(presets.custom));
      else featOn = !!(presets.custom && presets.custom.enabled);
      cancelBtn.style.display = featOn ? '' : 'none';
      cancelBtn.textContent = activeTab === 'group' ? 'Cancel group' : 'Cancel';
    }
    // Reset only makes sense on the character tab (it resets the persona).
    if (resetBtn) resetBtn.style.display = (changed && activeTab === 'character') ? '' : 'none';
  }
  const _checkboxInputs = [streamInput, cacheSystemInput, cacheSystemTtlInput, cacheChatInput, cacheChatTtlInput];
  [nameInput, promptInput, tempInput, tokensInput, topPInput, topKInput, streamInput,
   cacheSystemInput, cacheSystemTtlInput, cacheChatInput, cacheChatTtlInput,
   userNameInput, userPromptInput].forEach(el => {
    if (el) el.addEventListener(_checkboxInputs.includes(el) ? 'change' : 'input', _updateStartBtn);
  });
  // Re-label the Start button when the user switches tabs. Rebind the fresh
  // closure each time the modal opens (removing any stale one) so the label
  // logic always reads this open's snapshot/inputs.
  document.querySelectorAll('.preset-tab[data-chartab]').forEach(tab => {
    if (tab._startLabelSync) tab.removeEventListener('click', tab._startLabelSync);
    tab._startLabelSync = _updateStartBtn;
    tab.addEventListener('click', _updateStartBtn);
  });
  // Wire the "Cancel" button once — turn off the active tab's feature + close.
  const _cancelBtn = document.getElementById('cancel-custom-preset');
  if (_cancelBtn && !_cancelBtn._wired) {
    _cancelBtn._wired = true;
    _cancelBtn.addEventListener('click', () => {
      const t = document.querySelector('.preset-tab.active')?.dataset.chartab || 'inject';
      if (t === 'group') {
        try { if (window.groupModule && window.groupModule.stopGroup) window.groupModule.stopGroup(); } catch {}
        if (window._syncGroupIndicator) window._syncGroupIndicator(false);
      } else if (t === 'user') {
        // Turn off ONLY the user persona; any AI persona stays active.
        _clearUserPersona();
      } else {
        // Character / Inject tab — turn off the AI side; a user persona stays active.
        _clearAiSide();
      }
      const m = document.getElementById('custom-preset-modal');
      if (m) m.classList.add('hidden');
    });
  }
  // When selecting a template (either dropdown), update snapshot so it counts
  // as "unchanged".
  function _resetSnapshot() {
    _snapshot.name = nameInput ? nameInput.value : '';
    _snapshot.prompt = promptInput ? promptInput.value : '';
    _snapshot.temp = tempInput ? tempInput.value : '1';
    _snapshot.tokens = tokensInput ? tokensInput.value : '8448';
    _snapshot.topP = topPInput ? topPInput.value : '1';
    _snapshot.topK = topKInput ? topKInput.value : '0';
    _snapshot.stream = streamInput ? streamInput.checked : true;
    _snapshot.cacheSystem = cacheSystemInput ? cacheSystemInput.checked : false;
    _snapshot.cacheSystemTtl = cacheSystemTtlInput ? cacheSystemTtlInput.checked : false;
    _snapshot.cacheChat = cacheChatInput ? cacheChatInput.checked : false;
    _snapshot.cacheChatTtl = cacheChatTtlInput ? cacheChatTtlInput.checked : false;
    _snapshot.userName = userNameInput ? userNameInput.value : '';
    _snapshot.userPrompt = userPromptInput ? userPromptInput.value : '';
    _updateStartBtn();
  }
  if (charSelect) charSelect.addEventListener('change', () => setTimeout(_resetSnapshot, 50));
  if (userSelect) userSelect.addEventListener('change', () => setTimeout(_resetSnapshot, 50));
  _updateStartBtn();

  function _syncCharRows() {
    const hasName = nameInput && nameInput.value.trim();
    const delBtn = document.getElementById('char-delete-template-btn');
    if (delBtn) delBtn.style.display = userTemplates.find(t => t.name === (nameInput ? nameInput.value.trim() : '')) ? '' : 'none';
    const persistBtn = document.getElementById('create-persistent-chat-btn');
    if (persistBtn) persistBtn.style.display = hasName ? '' : 'none';
  }

  _syncCharRows();
  if (nameInput && !nameInput._syncWired) {
    nameInput._syncWired = true;
    nameInput.addEventListener('input', _syncCharRows);
  }

  // Persistent chat: lock character identity (dropdown, name) but allow style/temp/memory edits
  const isPersistent = !!window._persistentChatSession;
  const lockNotice = document.getElementById('char-lock-notice');
  const resetBtn = document.getElementById('reset-character-btn');
  const newBtn = document.getElementById('char-new-btn');
  const persistBtn = document.getElementById('create-persistent-chat-btn');
  const delBtn2 = document.getElementById('char-delete-template-btn');

  if (isPersistent) {
    if (charSelect) charSelect.disabled = true;
    if (nameInput) nameInput.readOnly = true;
    if (resetBtn) resetBtn.style.display = 'none';
    if (newBtn) newBtn.style.display = 'none';
    if (persistBtn) persistBtn.style.display = 'none';
    if (delBtn2) delBtn2.style.display = 'none';
    if (!lockNotice) {
      const notice = document.createElement('div');
      notice.id = 'char-lock-notice';
      notice.style.cssText = 'font-size:11px;color:var(--color-muted);text-align:center;padding:6px;margin-bottom:8px;border:1px dashed var(--border);border-radius:6px;';
      notice.textContent = 'Persistent chat — persona is locked. Style, temperature, and memory can still be changed.';
      modal.querySelector('.modal-body').prepend(notice);
    }
  } else {
    if (lockNotice) lockNotice.remove();
    if (charSelect) charSelect.disabled = false;
    if (nameInput) nameInput.readOnly = false;
    if (resetBtn) resetBtn.style.display = '';
    if (newBtn) newBtn.style.display = '';
  }

  modal.classList.remove('hidden');

  // Open straight onto a specific tab when launched from its chat-bar pill.
  if (initialTab) {
    const tabBtn = document.querySelector(`.preset-tab[data-chartab="${initialTab}"]`);
    if (tabBtn) tabBtn.click();
  }
}

/**
 * Save custom preset
 */
export async function saveCustomPreset(showToast, showError) {
  const nameInput = document.getElementById('custom-character-name');
  const tempInput = document.getElementById('custom-temperature');
  const tokensInput = document.getElementById('custom-max-tokens');
  const promptInput = document.getElementById('custom-system-prompt');

  if (!tempInput || !tokensInput || !promptInput) return;

  // This only runs for Character / Inject starts (the Group tab is handled by
  // group.js and skipped in app.js). If a group is still active from a prior
  // session, deactivate it — otherwise the chat-submit handler keeps routing
  // messages through group fan-out and a character chat "becomes a group".
  try {
    if (window.groupModule && window.groupModule.isActive()) {
      window.groupModule.stopGroup();
      if (window._syncGroupIndicator) window._syncGroupIndicator(false);
    }
  } catch (_) {}

  // The AI persona, the user persona, and the prompt-tuning/inject settings are
  // independent LAYERS that coexist — none clobbers another. So every field is
  // read from its input on every save regardless of the active tab; an Inject/
  // Prompt start keeps whatever personas are loaded and just updates tuning.
  const _activeTab = document.querySelector('.preset-tab.active')?.dataset.chartab || 'character';
  const _isInjectStart = _activeTab === 'inject';

  const name = nameInput ? nameInput.value.trim() : '';
  const temperature = parseFloat(tempInput.value);
  const rawTokens = parseInt(tokensInput.value);
  const max_tokens = _savedMaxTokens(rawTokens);
  const system_prompt = promptInput.value;
  const _userNameInput = document.getElementById('user-persona-name');
  const _userPromptInput = document.getElementById('user-persona-prompt');
  const user_persona_name = _userNameInput ? _userNameInput.value.trim() : '';
  const user_persona_prompt = _userPromptInput ? _userPromptInput.value : '';
  const top_p = _readTopP();
  const top_k = _readTopK();
  const _streamInput = document.getElementById('custom-stream');
  const stream = _streamInput ? _streamInput.checked : true;
  const _readChecked = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };
  const cache_system = _readChecked('cache-system');
  const cache_system_ttl = _readChecked('cache-system-ttl');
  const cache_chat = _readChecked('cache-chat');
  const cache_chat_ttl = _readChecked('cache-chat-ttl');

  const enabled = true; // always enabled when saving — deactivation happens via X/Reset

  const _prefixInput = document.getElementById('inject-prefix');
  const _suffixInput = document.getElementById('inject-suffix');

  const config = {
    name: name,
    enabled: enabled,
    temperature: Math.max(0, Math.min(2, temperature)),
    max_tokens: max_tokens,
    top_p: top_p,
    top_k: top_k,
    stream: stream,
    cache_system: cache_system,
    cache_system_ttl: cache_system_ttl,
    cache_chat: cache_chat,
    cache_chat_ttl: cache_chat_ttl,
    system_prompt: system_prompt,
    inject_prefix: _prefixInput ? _prefixInput.value : '',
    inject_suffix: _suffixInput ? _suffixInput.value : '',
    user_persona_name: user_persona_name,
    user_persona_prompt: user_persona_prompt,
  };

  try {
    const response = await fetch(`${API_BASE}/api/presets/custom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });

    const result = await response.json();
    if (result.success) {
      presets.custom = { ...presets.custom, ...config, character_name: name, enabled: enabled };

      // The custom preset must be the SELECTED preset for its values to reach
      // the model — chat.js only sends `preset_id` when getSelectedPreset() is
      // truthy. Activate it when there's a persona (name/prompt) OR when the
      // user has dialed in non-default tuning (temperature / max tokens) — the
      // "Inject" tab's plain-chat case. Without the tuning check, "just set
      // temp + max tokens" would silently do nothing.
      const _hasTuning = (config.temperature !== 1.0) || (config.max_tokens !== 0)
        || (config.top_p != null) || (config.top_k != null) || (config.stream === false)
        || config.cache_system || config.cache_chat;
      const _hasInject = !!(config.inject_prefix || config.inject_suffix);
      const _hasUserPersona = !!(user_persona_name || user_persona_prompt);
      const _hasContent = !!(system_prompt || name || _hasTuning || _hasInject || _hasUserPersona);
      if (enabled && _hasContent) {
        selectedPreset = 'custom';
        // Turn off research — doesn't make sense with a character
        if (window._syncResearchIndicator) window._syncResearchIndicator(false);
      } else {
        selectedPreset = null;
      }

      // Update mini button state
      const miniBtn = document.getElementById('overflow-preset-btn');
      if (miniBtn) {
        miniBtn.classList.toggle('active', enabled && _hasContent);
      }

      setTimeout(() => { _syncCharIndicator(); }, 0);

      // Auto-save the just-started persona into the SHARED template pool so it
      // reappears in BOTH dropdowns. Which persona depends on the active tab;
      // built-ins are skipped. User-persona templates store neutral temp/tokens
      // since the user side has no independent tuning.
      if (_activeTab === 'user') {
        const _uSel = document.getElementById('user-template-select')?.value || '';
        const _uBuiltin = PROMPT_TEMPLATES.some(t => t.isPreset && (t.name === user_persona_name || t.name === _uSel));
        if (user_persona_name && !_uBuiltin) {
          fetch(`${API_BASE}/api/presets/templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: (userTemplates.find(t => t.name === user_persona_name) || {}).id || '',
              name: user_persona_name, system_prompt: user_persona_prompt, temperature: 1.0, max_tokens: 0,
            }),
          }).then(r => { if (r.ok) loadUserTemplates(); }).catch(() => {});
        }
      } else if (!_isInjectStart) {
        const _selVal = document.getElementById('char-template-select')?.value || '';
        const isBuiltinPreset = PROMPT_TEMPLATES.some(t => t.isPreset && (t.name === name || t.name === _selVal));
        const saveName = isBuiltinPreset ? null : (name || null);
        if (saveName) {
          fetch(`${API_BASE}/api/presets/templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: (userTemplates.find(t => t.name === saveName) || {}).id || '',
              name: saveName, system_prompt, temperature: config.temperature, max_tokens: config.max_tokens,
            }),
          }).then(r => { if (r.ok) loadUserTemplates(); }).catch(() => {});
        }
      }

      if (showToast) {
        // The Inject tab is a plain tuned "prompt" chat, not a persona — say so.
        showToast(_isInjectStart ? 'Prompt saved' : (_activeTab === 'user' ? 'User persona saved' : 'Persona saved'));
      }
      const modal = document.getElementById('custom-preset-modal');
      if (modal) {
        modal.classList.add('hidden');
      }
    } else {
      if (showError) {
        showError('Failed to save custom preset');
      }
    }
  } catch (error) {
    console.error('Error saving custom preset:', error);
    if (showError) {
      showError('Failed to save custom preset');
    }
  }
}

/**
 * Get selected preset ID
 */
export function getSelectedPreset() {
  return selectedPreset;
}

/**
 * Get preset by ID
 */
export function getPreset(presetId) {
  return presets[presetId];
}

/**
 * Get all presets
 */
export function getAllPresets() {
  return presets;
}

/**
 * Get the character name (if set)
 */
export function getCharacterName() {
  if (!selectedPreset) return '';
  const custom = presets.custom;
  if (!custom || custom.enabled === false) return '';
  return custom.character_name || '';
}

/**
 * Get inject prefix/suffix (if set and preset active)
 */
export function getInject() {
  // Only inject when a preset is actually ACTIVE — mirror getCharacterName's
  // gate. Without the selectedPreset/enabled check, any text left in the
  // prefix/suffix fields got injected into every message even though the user
  // never started/activated the preset.
  if (!selectedPreset) return { prefix: '', suffix: '' };
  const custom = presets.custom;
  if (!custom || custom.enabled === false) return { prefix: '', suffix: '' };
  return {
    prefix: custom.inject_prefix || '',
    suffix: custom.inject_suffix || '',
  };
}

/**
 * Fully deactivate the character — clear preset, hide indicator, update overflow btn.
 */
export function deactivateCharacter() {
  selectedPreset = null;
  if (presets.custom) presets.custom.enabled = false;
  const charInd = document.getElementById('character-indicator-btn');
  if (charInd) { charInd.style.display = 'none'; charInd.classList.remove('active'); }
  const miniBtn = document.getElementById('overflow-preset-btn');
  if (miniBtn) miniBtn.classList.remove('active');
}

/**
 * Show/hide the memory scope bar and wire up scope switching.
 * Called after presets load and after saving character.
 */
/**
 * Copy all user memories (non-character) into the character's memory pool.
 */
async function _mergeUserMemories(charName) {
  try {
    const res = await fetch(`${API_BASE}/api/memory`);
    const data = await res.json();
    const userMems = (data.memory || []).filter(m => !m.character);
    if (!userMems.length) return;
    for (const m of userMems) {
      await fetch(`${API_BASE}/api/memory/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: m.text, category: m.category || 'fact', source: 'user', character: charName }),
      });
    }
  } catch (e) {
    console.error('Failed to merge memories:', e);
  }
}

function _reloadMemoryList() {
  import('./memory.js').then(m => {
    if (m.renderMemoryList) m.renderMemoryList();
    if (m.updateMemoryCount) m.updateMemoryCount();
  }).catch(() => {});
}

/**
 * Show/hide the single combined indicator pill in the chat input bar. It lists
 * every active LAYER together — AI persona, user persona, and (for a plain
 * tuned/inject chat with no persona) "Prompt" — joined with " · ". The layers
 * coexist; one X turns the whole custom preset off.
 */
function _syncCharIndicator() {
  const btn = document.getElementById('character-indicator-btn');
  const nameSpan = document.getElementById('character-indicator-name');
  const iconEl = document.getElementById('char-indicator-icon');
  if (!btn) return;
  const custom = presets.custom;
  const enabled = custom?.enabled !== false;
  const aiName = enabled ? (custom?.character_name || '') : '';
  const hasUser = enabled && _customHasUserPersona(custom);
  const userName = hasUser ? (custom.user_persona_name || '') : '';
  // Pure tuned/inject chat: tuning or inject set with NO persona at all (a
  // persona's own temperature is part of the persona, not a separate layer).
  const _t = parseFloat(custom?.temperature);
  const _hasTuning = (!isNaN(_t) && _t !== 1.0) || (!!custom?.max_tokens && custom.max_tokens !== 0)
    || (custom?.top_p != null) || (custom?.top_k != null) || (custom?.stream === false);
  const _hasInject = !!(custom?.inject_prefix || custom?.inject_suffix);
  const pureTuned = enabled && !aiName && !hasUser && (_hasTuning || _hasInject);
  // Icon path sets for the indicator chip.
  const _AVATAR = '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>';
  const _SYRINGE = '<path d="m18 2 4 4"/><path d="m17 7 3-3"/><path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5"/><path d="m9 11 4 4"/><path d="m5 19-3 3"/><path d="m14 4 6 6"/>';

  const parts = [];
  if (aiName) parts.push(aiName);
  if (hasUser) parts.push('You: ' + (userName || '…'));
  if (!parts.length && pureTuned) parts.push('Prompt');

  if (parts.length) {
    btn.style.display = '';
    btn.classList.add('active');
    const hasPersona = !!(aiName || hasUser);
    if (iconEl) iconEl.innerHTML = hasPersona ? _AVATAR : _SYRINGE;
    if (nameSpan) nameSpan.textContent = parts.join(' · ');
    btn.title = hasPersona
      ? `Active: ${parts.join(', ')} — click to configure`
      : 'Custom settings active — click to configure';
    // Hide X in persistent chats
    const xIcon = btn.querySelector('.tool-indicator-x');
    if (xIcon) xIcon.style.display = window._persistentChatSession ? 'none' : '';
    if (!btn._wired) {
      btn._wired = true;
      btn.addEventListener('click', (e) => {
        // One X clears EVERY layer — turn the whole custom preset off.
        if (e.target.closest('.tool-indicator-x')) {
          if (window._persistentChatSession) return; // locked in persistent chat
          deactivateCharacter();
          fetch(`${API_BASE}/api/presets/custom`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...presets.custom, name: (presets.custom && presets.custom.character_name) || '', enabled: false }),
          }).catch(() => {});
          return;
        }
        // Body click opens the modal on the most relevant tab.
        const c = presets.custom || {};
        const tab = c.character_name ? 'character' : (_customHasUserPersona(c) ? 'user' : 'inject');
        if (typeof openCustomPresetModal === 'function') openCustomPresetModal(tab);
      });
    }
  } else {
    btn.style.display = 'none';
    btn.classList.remove('active');
  }
}

/**
 * Called on every session switch. Handles persistent chat character lock.
 * - Entering a persistent chat: activate its character
 * - Leaving a persistent chat: deactivate the character
 * - Non-persistent chats: leave character state as-is
 */
let _prevSessionId = null;

export function onSessionSwitch(sessionId) {
  const charSessions = loadStoredObject('odysseus-char-sessions');

  // Leaving a persistent chat — deactivate for this switch only
  if (window._persistentChatSession) {
    selectedPreset = null;
    window._persistentChatSession = null;
    _syncCharIndicator();
  }

  _prevSessionId = sessionId;

  // Clean up stale entries (deleted sessions)
  // If sessionId doesn't exist in the session list, remove its mapping
  const charName = charSessions[sessionId];
  if (charName) {
    // Find the template (saved or built-in)
    const tmpl = userTemplates.find(t => t.name === charName)
      || PROMPT_TEMPLATES.find(t => t.name === charName);
    if (tmpl) {
      presets.custom = {
        ...presets.custom,
        character_name: charName,
        system_prompt: tmpl.system_prompt || tmpl.prompt || '',
        temperature: tmpl.temperature ?? 1.0,
        max_tokens: tmpl.max_tokens || 0,
        enabled: true,
      };
      selectedPreset = 'custom';
    }
    _syncCharIndicator();
    // Mark this as a locked persistent chat
    window._persistentChatSession = sessionId;
  } else {
    window._persistentChatSession = null;
  }
}

/**
 * Check if the current session is a persistent (locked) character chat.
 */
export function isPersistentChat() {
  return !!window._persistentChatSession;
}

/**
 * Remove a session from persistent chat mappings (call when session is deleted).
 */
export function removePersistentChat(sessionId) {
  const charSessions = loadStoredObject('odysseus-char-sessions');
  if (charSessions[sessionId]) {
    delete charSessions[sessionId];
    localStorage.setItem('odysseus-char-sessions', JSON.stringify(charSessions));
  }
  // If we were in that persistent chat, fully clear state
  if (window._persistentChatSession === sessionId) {
    window._persistentChatSession = null;
    selectedPreset = null;
    _syncCharIndicator();
  }
}

const presetsModule = {
  init,
  loadPresets,
  setActivePreset,
  openCustomPresetModal,
  saveCustomPreset,
  getSelectedPreset,
  getPreset,
  getAllPresets,
  getCharacterName,
  onSessionSwitch,
  isPersistentChat,
  removePersistentChat,
  deactivateCharacter,
  getInject
};

export default presetsModule;
