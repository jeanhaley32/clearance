'use strict';
// ─── STORAGE (decoupled from rest of app) ─────────────────────────────────

const STORE_KEYS = {
  STATE: 'clearance_state',
  DIARY: 'clearance_diary',
  THEME: 'clearance_theme',
  BACKUP: 'clearance_state_backup',
  INSTALL_DISMISSED: 'clearance_install_dismissed'
};

const CURRENT_SCHEMA = 2;

function safeParse(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function safeStringify(obj) {
  try { return JSON.stringify(obj); } catch (e) { return null; }
}

function loadState() {
  const raw = localStorage.getItem(STORE_KEYS.STATE);
  const parsed = safeParse(raw);
  if (!parsed) return null;
  return migrate(parsed);
}

function saveState(state) {
  state.schemaVersion = CURRENT_SCHEMA;
  state.savedAt = new Date().toISOString();
  const serialized = safeStringify(state);
  if (!serialized) return false;
  try {
    localStorage.setItem(STORE_KEYS.STATE, serialized);
    return true;
  } catch (e) {
    console.warn('State save failed:', e.message);
    return false;
  }
}

function loadDiary() {
  const raw = localStorage.getItem(STORE_KEYS.DIARY);
  const parsed = safeParse(raw);
  if (!parsed) return { entries: [], nextId: 1, schemaVersion: CURRENT_SCHEMA };
  if (parsed.schemaVersion !== CURRENT_SCHEMA) {
    // future migrations go here
    parsed.schemaVersion = CURRENT_SCHEMA;
  }
  return parsed;
}

function saveDiary(diary) {
  const payload = {
    entries: diary.entries || [],
    nextId: diary.nextId || 1,
    schemaVersion: CURRENT_SCHEMA,
    savedAt: new Date().toISOString()
  };
  const serialized = safeStringify(payload);
  if (!serialized) return false;
  try {
    localStorage.setItem(STORE_KEYS.DIARY, serialized);
    return true;
  } catch (e) {
    console.warn('Diary save failed:', e.message);
    return false;
  }
}

function loadTheme() {
  return localStorage.getItem(STORE_KEYS.THEME) || null;
}

function saveTheme(value) {
  try { localStorage.setItem(STORE_KEYS.THEME, value); return true; }
  catch (e) { return false; }
}

function getRawState() {
  return localStorage.getItem(STORE_KEYS.STATE);
}

function getBackup() {
  return localStorage.getItem(STORE_KEYS.BACKUP);
}

function setBackup(raw) {
  if (!raw) return;
  try { localStorage.setItem(STORE_KEYS.BACKUP, raw); }
  catch (e) { console.warn('Backup save failed:', e.message); }
}

function getInstallDismissed() {
  return localStorage.getItem(STORE_KEYS.INSTALL_DISMISSED) === '1';
}

function setInstallDismissed() {
  try { localStorage.setItem(STORE_KEYS.INSTALL_DISMISSED, '1'); }
  catch (e) {}
}

function clearAllStorage() {
  Object.values(STORE_KEYS).forEach(function(k) {
    try { localStorage.removeItem(k); } catch (e) {}
  });
}

// Migration from v1 (pre-schemaVersion, diary baked into state) to v2
function migrate(state) {
  if (state.schemaVersion === CURRENT_SCHEMA) return state;

  // v1 → v2: diary entries move to their own key
  if (!state.schemaVersion || state.schemaVersion < 2) {
    if (Array.isArray(state.diaryEntries)) {
      const diaryPayload = {
        entries: state.diaryEntries,
        nextId: state.nextDiaryId || 1,
        schemaVersion: CURRENT_SCHEMA,
        savedAt: new Date().toISOString()
      };
      try {
        localStorage.setItem(STORE_KEYS.DIARY, JSON.stringify(diaryPayload));
      } catch (e) {}
      delete state.diaryEntries;
      delete state.nextDiaryId;
    }
    state.schemaVersion = CURRENT_SCHEMA;
  }

  return state;
}

// Expose for module tests
if (typeof module !== 'undefined') {
  module.exports = { loadState, saveState, loadDiary, saveDiary, loadTheme, saveTheme, getRawState, getBackup, setBackup, getInstallDismissed, setInstallDismissed, clearAllStorage, migrate, STORE_KEYS, CURRENT_SCHEMA };
}
