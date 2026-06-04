// static/js/thinking.js
//
// Thinking controls for Anthropic Claude models — a button in chat-input-left
// that opens a popup with an effort selector and (for models that support both
// extended + adaptive) an Adaptive toggle. Capability gating mirrors the backend
// _ANTHROPIC_FEATURES matrix via getThinkingCaps() in chatRenderer.js.
//
// The chosen settings are sent per request as form fields by chat.js
// (thinking_enabled / thinking_adaptive / thinking_effort). Non-Anthropic models
// hide the button entirely; the backend ignores the fields for them anyway.

import { getThinkingCaps } from './chatRenderer.js';

const STORE_KEY = 'odysseus-thinking';

const EFFORT_LABELS = {
  auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'X-High', max: 'Max',
};

let state = { enabled: false, adaptive: false, effort: 'auto' };
let _open = false;
let _wired = false;

function _load() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (v && typeof v === 'object') {
      state.enabled = !!v.enabled;
      state.adaptive = !!v.adaptive;
      state.effort = typeof v.effort === 'string' ? v.effort : 'auto';
    }
  } catch (_e) { /* keep defaults */ }
}

function _save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_e) { /* ignore */ }
}

/** Current model id from the session module, falling back to the picker label. */
function _currentModel() {
  try {
    if (window.sessionModule && window.sessionModule.getCurrentModel) {
      const m = window.sessionModule.getCurrentModel();
      if (m) return m;
    }
  } catch (_e) { /* ignore */ }
  const label = document.getElementById('model-picker-label');
  return label ? label.textContent.trim() : '';
}

/**
 * Resolve the params to send for the current model + state. Adaptive-only models
 * force adaptive; extended-only force extended; "both" honor the toggle. Effort
 * is clamped to the levels the model actually supports.
 */
export function getThinkingParams() {
  const caps = getThinkingCaps(_currentModel());
  if (!caps || !state.enabled) return { enabled: false, adaptive: false, effort: 'auto' };
  const effort = (caps.effort || []).includes(state.effort) ? state.effort : 'auto';
  let adaptive;
  if (caps.thinking === 'adaptive') adaptive = true;
  else if (caps.thinking === 'extended') adaptive = false;
  else adaptive = !!state.adaptive;
  return { enabled: true, adaptive, effort };
}

function _btnSync(caps) {
  const btn = document.getElementById('thinking-btn');
  const badge = document.getElementById('thinking-btn-badge');
  if (!btn) return;
  const on = !!caps && state.enabled;
  btn.classList.toggle('active', on);
  if (badge) {
    if (on) {
      const eff = (caps.effort || []).includes(state.effort) ? state.effort : 'auto';
      badge.textContent = (EFFORT_LABELS[eff] || 'Auto').slice(0, 1);
      badge.style.display = '';
      btn.title = `Thinking: ${EFFORT_LABELS[eff] || 'Auto'}${caps.thinking !== 'extended' && (caps.thinking === 'adaptive' || state.adaptive) ? ' · Adaptive' : ''}`;
    } else {
      badge.style.display = 'none';
      btn.title = 'Thinking';
    }
  }
}

/** Rebuild the popup body + button state for the current model. Hides the whole
 *  control for non-Anthropic models. */
function render() {
  const wrap = document.getElementById('thinking-wrapper');
  const popup = document.getElementById('thinking-popup');
  if (!wrap || !popup) return;
  const caps = getThinkingCaps(_currentModel());
  if (!caps) {
    wrap.style.display = 'none';
    if (_open) _close();
    return;
  }
  wrap.style.display = '';
  _btnSync(caps);
  if (!_open) return; // only (re)build the popup body while it's visible

  const effortBtns = (caps.effort || []).map((lvl) => {
    const active = ((caps.effort.includes(state.effort) ? state.effort : 'auto') === lvl) ? ' active' : '';
    return `<button type="button" class="thinking-effort-btn${active}" data-effort="${lvl}"${state.enabled ? '' : ' disabled'}>${EFFORT_LABELS[lvl] || lvl}</button>`;
  }).join('');

  // Adaptive toggle only applies to "both" models. Adaptive-only / extended-only
  // models have a fixed mode, so we show a small note instead of a toggle.
  let modeRow = '';
  if (caps.thinking === 'both') {
    modeRow = `<label class="thinking-row">
        <span class="thinking-row-main">Adaptive<span class="thinking-row-hint">Let the model manage its own budget</span></span>
        <input type="checkbox" id="thinking-adaptive-cb"${state.adaptive ? ' checked' : ''}${state.enabled ? '' : ' disabled'}>
      </label>`;
  } else if (caps.thinking === 'adaptive') {
    modeRow = `<div class="thinking-note">Adaptive thinking (effort guides the budget)</div>`;
  } else {
    modeRow = `<div class="thinking-note">Extended thinking (effort sets the token budget)</div>`;
  }

  popup.innerHTML = `
    <div class="thinking-popup-head">
      <span>Thinking</span>
      <label class="thinking-switch"><input type="checkbox" id="thinking-enabled-cb"${state.enabled ? ' checked' : ''}><span class="thinking-switch-track"></span></label>
    </div>
    <div class="thinking-section${state.enabled ? '' : ' thinking-disabled'}">
      <div class="thinking-section-label">Effort</div>
      <div class="thinking-effort-grid">${effortBtns}</div>
    </div>
    <div class="thinking-section${state.enabled ? '' : ' thinking-disabled'}">${modeRow}</div>`;

  // Wire popup controls.
  const enCb = popup.querySelector('#thinking-enabled-cb');
  if (enCb) enCb.addEventListener('change', () => { state.enabled = enCb.checked; _save(); render(); });
  const adCb = popup.querySelector('#thinking-adaptive-cb');
  if (adCb) adCb.addEventListener('change', () => { state.adaptive = adCb.checked; _save(); _btnSync(caps); });
  popup.querySelectorAll('.thinking-effort-btn').forEach((b) => {
    b.addEventListener('click', () => {
      if (!state.enabled) return;
      state.effort = b.dataset.effort;
      _save();
      render();
    });
  });
}

function _open_() {
  const popup = document.getElementById('thinking-popup');
  const btn = document.getElementById('thinking-btn');
  if (!popup) return;
  _open = true;
  popup.classList.remove('hidden');
  if (btn) btn.setAttribute('aria-expanded', 'true');
  render();
  setTimeout(() => {
    document.addEventListener('click', _onDocClick, true);
    document.addEventListener('keydown', _onKey, true);
  }, 0);
}

function _close() {
  const popup = document.getElementById('thinking-popup');
  const btn = document.getElementById('thinking-btn');
  _open = false;
  if (popup) popup.classList.add('hidden');
  if (btn) btn.setAttribute('aria-expanded', 'false');
  document.removeEventListener('click', _onDocClick, true);
  document.removeEventListener('keydown', _onKey, true);
}

function _onDocClick(e) {
  const wrap = document.getElementById('thinking-wrapper');
  if (wrap && !wrap.contains(e.target)) _close();
}
function _onKey(e) { if (e.key === 'Escape') _close(); }

export function init() {
  if (_wired) return;
  _wired = true;
  _load();
  const btn = document.getElementById('thinking-btn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (_open) _close(); else _open_();
    });
  }
  // Keep visibility + options in sync with the model picker. The label text
  // changes whenever the active model changes.
  const label = document.getElementById('model-picker-label');
  if (label) {
    try {
      const obs = new MutationObserver(() => render());
      obs.observe(label, { childList: true, characterData: true, subtree: true });
    } catch (_e) { /* ignore */ }
  }
  render();
}

const thinkingModule = { init, getThinkingParams, refresh: render };
if (typeof window !== 'undefined') window.thinkingModule = thinkingModule;

// Self-init once the DOM is ready (chat.js also imports this module).
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

export default thinkingModule;
