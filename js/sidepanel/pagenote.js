// js/sidepanel/pagenote.js
export function initPageNote() {
  const urlDisplay = document.getElementById('current-url');
  const noteArea = document.getElementById('note-area');
  const clearBtn = document.getElementById('note-clear-btn');
  const saveStatus = document.getElementById('save-status');

  let currentUrlKey = '';
  let saveTimeout;

  function getCleanUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.origin + urlObj.pathname;
    } catch (e) {
      return url;
    }
  }

  async function loadNoteForTab(tab) {
    if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
      urlDisplay.textContent = 'メモ不可のページです';
      noteArea.value = '';
      noteArea.disabled = true;
      clearBtn.disabled = true;
      currentUrlKey = '';
      return;
    }
    const cleanUrl = getCleanUrl(tab.url);
    currentUrlKey = `note_${cleanUrl}`;
    urlDisplay.textContent = cleanUrl;
    noteArea.disabled = false;
    clearBtn.disabled = false;

    const result = await chrome.storage.local.get([currentUrlKey]);
    noteArea.value = result[currentUrlKey] || '';
  }

  // 自動保存
  noteArea.addEventListener('input', () => {
    if (!currentUrlKey) return;
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      await chrome.storage.local.set({ [currentUrlKey]: noteArea.value });
      saveStatus.classList.add('show');
      setTimeout(() => saveStatus.classList.remove('show'), 2000);
    }, 500);
  });

  // クリアボタン
  clearBtn.addEventListener('click', async () => {
    if (!currentUrlKey) return;
    noteArea.value = '';
    await chrome.storage.local.remove(currentUrlKey);
    saveStatus.textContent = 'Cleared';
    saveStatus.classList.add('show');
    setTimeout(() => saveStatus.classList.remove('show'), 2000);
  });

  // タブ遷移イベントの監視
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    loadNoteForTab(tab);
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && tab.active) {
      loadNoteForTab(tab);
    }
  });

  // 初回読み込み
  async function init() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    loadNoteForTab(tab);
  }
  init();
}
