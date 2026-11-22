// ==========================================
// Farbe Shared Theme Manager
// ==========================================

(() => {
  const VALID_THEMES = ['system', 'light', 'dark'];
  const listeners = new Set();
  let currentTheme = 'system';

  function normalizeTheme(value) {
    return VALID_THEMES.includes(value) ? value : 'system';
  }

  function getEffectiveTheme(theme = currentTheme) {
    if (theme === 'dark' || theme === 'light') return theme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function applyTheme(theme) {
    currentTheme = normalizeTheme(theme);
    const root = document.documentElement;
    if (currentTheme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', currentTheme);
    }

    const effective = getEffectiveTheme(currentTheme);
    listeners.forEach((fn) => {
      try {
        fn(currentTheme, effective);
      } catch (error) {
        console.error('Theme listener error:', error);
      }
    });
  }

  function setTheme(theme) {
    const normalized = normalizeTheme(theme);
    applyTheme(normalized);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ theme: normalized });
    }
    return normalized;
  }

  function toggleTheme() {
    const next = getEffectiveTheme() === 'dark' ? 'light' : 'dark';
    return setTheme(next);
  }

  function subscribe(callback) {
    listeners.add(callback);
    callback(currentTheme, getEffectiveTheme(currentTheme));
    return () => listeners.delete(callback);
  }

  // 初期読み込み
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get({ theme: 'system' }, (result) => {
      applyTheme(result.theme);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.theme) {
        applyTheme(changes.theme.newValue);
      }
    });
  }

  // OSのテーマ切替（system選択時）を通知
  const darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  darkMediaQuery.addEventListener('change', () => {
    if (currentTheme === 'system') {
      applyTheme('system');
    }
  });

  window.FarbeTheme = {
    VALID_THEMES,
    get: () => currentTheme,
    getEffective: getEffectiveTheme,
    apply: applyTheme,
    set: setTheme,
    toggle: toggleTheme,
    subscribe,
  };
})();
