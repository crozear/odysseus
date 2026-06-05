// static/js/thinking.js
//
// Thinking controls for Anthropic Claude models.
// The button (#thinking-toggle-btn) opens a menu (#thinking-menu) that is
// portalled to <body> when open — exactly like the overflow-plus-btn / overflow-menu
// pattern in app.js — so it escapes the container-type: inline-size trap and
// renders above everything.
//
// Menu contents are rebuilt dynamically on each open based on the current model's
// capabilities (from getThinkingCaps() in chatRenderer.js).
// Non-Anthropic models hide the wrapper entirely.

import { getThinkingCaps } from './chatRenderer.js';

const STORE_KEY = 'odysseus-thinking';

const EFFORT_LABELS = {
  auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'X-High', max: 'Max',
};

// Persisted state
let state = { enabled: false, adaptive: false, effort: 'auto' };

function _load() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (v && typeof v === 'object') {
      state.enabled  = !!v.enabled;
      state.adaptive = !!v.adaptive;
      state.effort   = typeof v.effort === 'string' ? v.effort : 'auto';
    }
  } catch (_e) { /* keep defaults */ }
}

function _save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_e) { /* ignore */ }
}

// ── Model helpers ────────────────────────────────────────────────────────────

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

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns {enabled, adaptive, effort} ready to append to the FormData.
 * Resolves adaptive vs extended based on the current model's capability.
 */
export function getThinkingParams() {
  const caps = getThinkingCaps(_currentModel());
  if (!caps || !state.enabled) return { enabled: false, adaptive: false, effort: 'auto' };
  const effort = (caps.effort || []).includes(state.effort) ? state.effort : 'auto';
  let adaptive;
  if      (caps.thinking === 'adaptive')  adaptive = true;
  else if (caps.thinking === 'extended')  adaptive = false;
  else                                    adaptive = !!state.adaptive;
  return { enabled: true, adaptive, effort };
}

// ── Button / wrapper visibility ──────────────────────────────────────────────

function _syncButtonState(caps) {
  const btn  = document.getElementById('thinking-toggle-btn');
  const dot  = document.getElementById('thinking-active-dot');
  const wrap = document.getElementById('thinking-wrapper');
  if (!wrap) return;

  if (!caps) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';

  if (!btn) return;
  const on = state.enabled;
  btn.classList.toggle('active', on);
  if (dot) dot.style.display = on ? '' : 'none';
  if (on) {
    const eff = (caps.effort || []).includes(state.effort) ? state.effort : 'auto';
    btn.title = `Thinking: ${EFFORT_LABELS[eff] || eff}`;
  } else {
    btn.title = 'Thinking';
  }
}

// ── Menu open / close ────────────────────────────────────────────────────────

let _ownerWrap = null;
let _vvReposition = null;

function _positionMenu(btn, menu) {
  const r    = btn.getBoundingClientRect();
  menu.style.right  = 'auto';
  menu.style.bottom = 'auto';
  menu.style.maxHeight = '';
  menu.style.overflowY = '';
  const avail   = r.top - 16;
  const natural = menu.scrollHeight;
  const h       = Math.min(natural, avail);
  if (natural > avail) {
    menu.style.maxHeight = avail + 'px';
    menu.style.overflowY = 'auto';
  }
  menu.style.left = r.left + 'px';
  menu.style.top  = (r.top - 8 - h) + 'px';
}

function _closeMenu() {
  const btn  = document.getElementById('thinking-toggle-btn');
  const menu = document.getElementById('thinking-menu');
  if (!menu || menu.classList.contains('hidden') || menu.classList.contains('closing')) return;

  if (_vvReposition && window.visualViewport) {
    window.visualViewport.removeEventListener('resize', _vvReposition);
    window.visualViewport.removeEventListener('scroll', _vvReposition);
    _vvReposition = null;
  }
  menu.classList.add('closing');
  if (btn) { btn.classList.remove('expanded'); btn.setAttribute('aria-expanded', 'false'); }

  setTimeout(() => {
    menu.classList.add('hidden');
    menu.classList.remove('closing');
    if (_ownerWrap) _ownerWrap.appendChild(menu);  // restore from body portal
    _ownerWrap = null;
  }, 400);
}

function _buildMenu(menu, caps) {
  menu.innerHTML = '';

  // ── Enable / disable toggle ──────────────────────────────────────────────
  const enableItem = document.createElement('div');
  enableItem.className = 'thinking-menu-item' + (state.enabled ? ' active-red' : '');
  enableItem.innerHTML =
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.5.4.8 1 .9 1.6l.1.7h6l.1-.7c.1-.6.4-1.2.9-1.6A7 7 0 0 0 12 2z"/></svg>
    <span>${state.enabled ? 'Thinking on' : 'Thinking off'}</span>
    <label class="thinking-item-switch" title="Enable thinking">
      <input type="checkbox" id="thinking-enabled-cb"${state.enabled ? ' checked' : ''}>
      <span class="thinking-item-switch-track"></span>
    </label>`;
  menu.appendChild(enableItem);

  // ── Model-mode note for adaptive-only models ─────────────────────────────
  if (caps.thinking === 'adaptive') {
    const note = document.createElement('div');
    note.className = 'thinking-menu-note';
    note.textContent = 'Adaptive thinking — effort sets how hard the model works.';
    menu.appendChild(note);
  }

  // ── Effort section ───────────────────────────────────────────────────────
  const divider1 = document.createElement('div');
  divider1.className = 'thinking-menu-divider';
  menu.appendChild(divider1);

  const effortLabel = document.createElement('div');
  effortLabel.className = 'thinking-menu-label';
  effortLabel.textContent = 'Effort';
  menu.appendChild(effortLabel);

  const currentEff = (caps.effort || []).includes(state.effort) ? state.effort : 'auto';
  for (const lvl of (caps.effort || [])) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'thinking-menu-item' + (currentEff === lvl ? ' active' : '');
    item.dataset.effort = lvl;
    item.innerHTML =
      `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.5"><circle cx="12" cy="12" r="10"/></svg>
      <span>${EFFORT_LABELS[lvl] || lvl}</span>
      <span class="thinking-item-dot"></span>`;
    item.addEventListener('pointerdown', (e) => e.preventDefault());
    item.addEventListener('click', () => {
      if (!state.enabled) {
        state.enabled = true;
        _save();
      }
      state.effort = lvl;
      _save();
      _syncButtonState(caps);
      _closeMenu();
    });
    menu.appendChild(item);
  }

  // ── Adaptive toggle (only for "both" models) ─────────────────────────────
  if (caps.thinking === 'both') {
    const divider2 = document.createElement('div');
    divider2.className = 'thinking-menu-divider';
    menu.appendChild(divider2);

    const adaptItem = document.createElement('div');
    adaptItem.className = 'thinking-menu-item' + (state.adaptive ? ' active' : '');
    adaptItem.innerHTML =
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
      <span>Adaptive<span style="font-size:10px;color:var(--color-muted);display:block;line-height:1.2;">Model manages its own budget</span></span>
      <label class="thinking-item-switch" title="Adaptive thinking">
        <input type="checkbox" id="thinking-adaptive-cb"${state.adaptive ? ' checked' : ''}>
        <span class="thinking-item-switch-track"></span>
      </label>`;
    menu.appendChild(adaptItem);
  }

  // ── Wire the enable checkbox (after appending, so the element exists) ────
  const enCb = menu.querySelector('#thinking-enabled-cb');
  if (enCb) {
    enCb.addEventListener('pointerdown', (e) => e.stopPropagation());
    enCb.addEventListener('change', () => {
      state.enabled = enCb.checked;
      _save();
      _syncButtonState(caps);
      // Rebuild the header item label in place
      const span = enableItem.querySelector('span');
      if (span) span.textContent = state.enabled ? 'Thinking on' : 'Thinking off';
      enableItem.className = 'thinking-menu-item' + (state.enabled ? ' active-red' : '');
    });
  }
  const adCb = menu.querySelector('#thinking-adaptive-cb');
  if (adCb) {
    adCb.addEventListener('pointerdown', (e) => e.stopPropagation());
    adCb.addEventListener('change', () => {
      state.adaptive = adCb.checked;
      _save();
    });
  }
}

function _openMenu() {
  const btn  = document.getElementById('thinking-toggle-btn');
  const menu = document.getElementById('thinking-menu');
  if (!btn || !menu) return;
  const caps = getThinkingCaps(_currentModel());
  if (!caps) return;

  // Cancel any in-progress close animation
  menu.classList.remove('closing');
  menu.classList.remove('hidden');
  btn.classList.add('expanded');
  btn.setAttribute('aria-expanded', 'true');

  // Rebuild content for the current model/state
  _buildMenu(menu, caps);

  // Portal to <body> to escape the container-type: inline-size trap
  _ownerWrap = menu.parentElement;
  document.body.appendChild(menu);
  _positionMenu(btn, menu);

  if (window.visualViewport && !_vvReposition) {
    _vvReposition = () => _positionMenu(btn, menu);
    window.visualViewport.addEventListener('resize', _vvReposition);
    window.visualViewport.addEventListener('scroll', _vvReposition);
  }
}

// ── Initialization ───────────────────────────────────────────────────────────

let _wired = false;

export function init() {
  if (_wired) return;
  _wired = true;
  _load();

  const btn = document.getElementById('thinking-toggle-btn');
  if (btn) {
    btn.addEventListener('pointerdown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById('thinking-menu');
      const isOpen = menu && !menu.classList.contains('hidden') && !menu.classList.contains('closing');
      if (isOpen) { _closeMenu(); return; }
      _openMenu();
    });
  }

  // Close on outside click / Escape
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('thinking-menu');
    if (!menu || menu.classList.contains('hidden')) return;
    if (!menu.contains(e.target) && e.target !== btn) _closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const menu = document.getElementById('thinking-menu');
    if (menu && !menu.classList.contains('hidden')) _closeMenu();
  });

  // Keep wrapper visibility + button badge in sync when model changes
  const label = document.getElementById('model-picker-label');
  if (label) {
    try {
      const obs = new MutationObserver(() => {
        _syncButtonState(getThinkingCaps(_currentModel()));
      });
      obs.observe(label, { childList: true, characterData: true, subtree: true });
    } catch (_e) { /* ignore */ }
  }

  _syncButtonState(getThinkingCaps(_currentModel()));
}

// Self-init once DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}

const thinkingModule = { init, getThinkingParams, refresh: () => _syncButtonState(getThinkingCaps(_currentModel())) };
if (typeof window !== 'undefined') window.thinkingModule = thinkingModule;
export default thinkingModule;
