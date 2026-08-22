const urlDisplay = document.getElementById('current-url');
const noteArea = document.getElementById('note-area');
const saveStatus = document.getElementById('save-status');

let currentUrlKey = '';
let saveTimeout;

// 1. URLからパラメータ（?以降）とハッシュ（#以降）を除外する関数
function getCleanUrl(url) {
  try {
    const urlObj = new URL(url);
    // origin (https://example.com) + pathname (/page/index.html) のみを抽出
    return urlObj.origin + urlObj.pathname;
  } catch (e) {
    return url;
  }
}

// 2. 指定されたタブのメモをストレージから読み込む
async function loadNoteForTab(tab) {
  // chrome:// などの特殊ページはメモ不可にする
  if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
    urlDisplay.textContent = 'メモ不可のページです';
    noteArea.value = '';
    noteArea.disabled = true;
    currentUrlKey = '';
    return;
  }

  const cleanUrl = getCleanUrl(tab.url);
  currentUrlKey = `note_${cleanUrl}`;
  urlDisplay.textContent = cleanUrl;
  noteArea.disabled = false;

  // 保存されているメモを取得
  const result = await chrome.storage.local.get([currentUrlKey]);
  noteArea.value = result[currentUrlKey] || '';
}

// 3. 初回起動時：現在アクティブなタブを取得して読み込み
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  loadNoteForTab(tab);
}

// 4. 自動保存機能（文字入力が0.5秒止まったら裏で保存）
noteArea.addEventListener('input', () => {
  if (!currentUrlKey) return;

  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    await chrome.storage.local.set({ [currentUrlKey]: noteArea.value });

    // 保存完了の視覚的フィードバック
    saveStatus.classList.add('show');
    setTimeout(() => saveStatus.classList.remove('show'), 2000);
  }, 500);
});

// 5. Chromeのタブが切り替わった時（別のタブをクリックした時）
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  loadNoteForTab(tab);
});

// 6. タブのURLが更新された時（ページ遷移した時）
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // アクティブなタブのURLが変わった時だけ再読み込み
  if (changeInfo.url && tab.active) {
    loadNoteForTab(tab);
  }
});

// 7. ショートカットキーからの「閉じる（トグル）」命令を受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggle_side_panel') {
    sendResponse({ isOpen: true }); // 「開いてるよ！」と返事をしてから...
    window.close(); // 自分自身をスッと閉じる
  }
});

// 実行
init();
