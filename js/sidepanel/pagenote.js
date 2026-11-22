// js/sidepanel/pagenote.js
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'si',
  'mc_cid',
  'mc_eid',
]);

const UNSUPPORTED_PROTOCOLS = new Set([
  'chrome:',
  'chrome-extension:',
  'edge:',
  'about:',
  'devtools:',
  'view-source:',
]);

export function initPageNote(initialWindowId = null) {
  const urlDisplay = document.getElementById('current-url');
  const noteArea = document.getElementById('note-area');
  const clearBtn = document.getElementById('note-clear-btn');
  const saveStatus = document.getElementById('save-status');
  const saveStatusText = document.getElementById('save-status-text');

  let currentWindowId = initialWindowId;
  let currentUrlKey = '';
  let saveTimeout = null;
  let statusTimeout = null;
  let pendingSave = null;
  let loadSequence = 0;

  function showSaveStatus(label) {
    clearTimeout(statusTimeout);
    if (saveStatusText) {
      saveStatusText.textContent = label;
    } else {
      saveStatus.textContent = label;
    }
    saveStatus.classList.add('show');
    statusTimeout = setTimeout(() => {
      saveStatus.classList.remove('show');
    }, 2000);
  }

  function isSupportedUrl(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return !UNSUPPORTED_PROTOCOLS.has(parsed.protocol);
    } catch {
      return false;
    }
  }

  function getUrlVariants(url) {
    try {
      const urlObj = new URL(url);
      const legacyUrl = urlObj.origin + urlObj.pathname;

      const filteredParams = new URLSearchParams();
      for (const [key, value] of urlObj.searchParams.entries()) {
        const lowerKey = key.toLowerCase();
        if (lowerKey.startsWith('utm_') || TRACKING_PARAMS.has(lowerKey)) {
          continue;
        }
        filteredParams.append(key, value);
      }

      const queryString = filteredParams.toString();
      const canonicalUrl = queryString
        ? `${legacyUrl}?${queryString}`
        : legacyUrl;

      return { canonicalUrl, legacyUrl };
    } catch {
      return { canonicalUrl: url, legacyUrl: url };
    }
  }

  async function persistNote(key, value, notify = true) {
    if (!key) return;
    try {
      if (value.trim() === '') {
        await chrome.storage.local.remove(key);
      } else {
        await chrome.storage.local.set({ [key]: value });
      }
      if (notify && key === currentUrlKey) {
        showSaveStatus('Saved');
      }
    } catch (error) {
      console.error('PageNote save error:', error);
    }
  }

  async function flushPendingSave(notify = false) {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    if (!pendingSave) return;

    const { key, value } = pendingSave;
    pendingSave = null;
    await persistNote(key, value, notify);
  }

  async function loadNoteForTab(tab) {
    // タブ切替前に未保存のメモを元のURLキーへ確実に保存する
    await flushPendingSave(false);

    const requestId = ++loadSequence;

    if (!tab || !isSupportedUrl(tab.url)) {
      urlDisplay.textContent = 'メモ不可のページです';
      noteArea.value = '';
      noteArea.disabled = true;
      clearBtn.disabled = true;
      currentUrlKey = '';
      return;
    }

    const { canonicalUrl, legacyUrl } = getUrlVariants(tab.url);
    const canonicalKey = `note_${canonicalUrl}`;
    const legacyKey = `note_${legacyUrl}`;
    const keysToFetch =
      canonicalKey === legacyKey ? [canonicalKey] : [canonicalKey, legacyKey];

    const result = await chrome.storage.local.get(keysToFetch);
    // 非同期取得中に別のタブへ切り替わっていたら破棄
    if (requestId !== loadSequence) return;

    let resolvedKey = canonicalKey;
    let resolvedUrl = canonicalUrl;
    let resolvedValue = '';

    if (typeof result[canonicalKey] === 'string' && result[canonicalKey] !== '') {
      resolvedKey = canonicalKey;
      resolvedUrl = canonicalUrl;
      resolvedValue = result[canonicalKey];
    } else if (
      legacyKey !== canonicalKey &&
      typeof result[legacyKey] === 'string' &&
      result[legacyKey] !== ''
    ) {
      // 既存のクエリなしキーで保存されたメモがあれば互換読み込みする
      resolvedKey = legacyKey;
      resolvedUrl = legacyUrl;
      resolvedValue = result[legacyKey];
    }

    currentUrlKey = resolvedKey;
    urlDisplay.textContent = resolvedUrl;
    noteArea.disabled = false;
    clearBtn.disabled = false;
    noteArea.value = resolvedValue;
  }

  // 自動保存
  noteArea.addEventListener('input', () => {
    if (!currentUrlKey) return;
    const keySnapshot = currentUrlKey;
    const valueSnapshot = noteArea.value;
    pendingSave = { key: keySnapshot, value: valueSnapshot };

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveTimeout = null;
      if (
        pendingSave &&
        pendingSave.key === keySnapshot &&
        pendingSave.value === valueSnapshot
      ) {
        pendingSave = null;
      }
      persistNote(keySnapshot, valueSnapshot, true);
    }, 500);
  });

  // パネル終了・非表示時に未保存分をフラッシュ
  window.addEventListener('pagehide', () => {
    void flushPendingSave(false);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushPendingSave(false);
    }
  });

  // クリアボタン
  clearBtn.addEventListener('click', async () => {
    if (!currentUrlKey) return;
    clearTimeout(saveTimeout);
    saveTimeout = null;
    pendingSave = null;

    const keyToRemove = currentUrlKey;
    noteArea.value = '';
    await chrome.storage.local.remove(keyToRemove);
    showSaveStatus('Cleared');
  });

  // タブ遷移イベントの監視（同一ウィンドウのみ対象）
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    if (
      currentWindowId != null &&
      activeInfo.windowId !== currentWindowId
    ) {
      return;
    }
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      loadNoteForTab(tab);
    } catch {
      // タブが既に閉じられた場合は無視
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (currentWindowId != null && tab.windowId !== currentWindowId) {
      return;
    }
    if (changeInfo.url && tab.active) {
      loadNoteForTab(tab);
    }
  });

  // 初回読み込み
  async function init() {
    if (currentWindowId == null) {
      try {
        const win = await chrome.windows.getCurrent();
        currentWindowId = win?.id ?? null;
      } catch {
        // ignore
      }
    }

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (currentWindowId == null && tab?.windowId != null) {
      currentWindowId = tab.windowId;
    }
    loadNoteForTab(tab);
  }
  init();
}
