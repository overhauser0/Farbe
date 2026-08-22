// ==========================================
// 設定画面(Options)を開く
// ==========================================
document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ==========================================
// タブ切り替えロジック
// ==========================================
document.querySelectorAll('.panel-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document
      .querySelectorAll('.panel-tab')
      .forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');

    document
      .querySelectorAll('.panel-content')
      .forEach((c) => c.classList.remove('active'));
    const targetId = tab.getAttribute('data-target');
    document.getElementById(targetId).classList.add('active');
  });
});

// ==========================================
// 1. Make Piece ロジック (最新版対応)
// ==========================================

// URL自動取得（魔法のステッキボタン）
document
  .getElementById('get-current-url')
  .addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab && tab.url) {
      // URLを反映
      document.getElementById('task-url').value = tab.url;

      // タスク名が空欄だったらタブ名を反映
      if (!document.getElementById('task-name').value.trim())
        document.getElementById('task-name').value = tab.title;

      const icon = document.querySelector('#get-current-url i');
      icon.className = 'fas fa-check';
      icon.style.color = '#10b981';
      setTimeout(() => {
        icon.className = 'fas fa-wand-magic-sparkles';
        icon.style.color = '';
      }, 2000);
    }
  });

// 日付チップのロジック
function setDateByOffset(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const formatted = d
    .toLocaleDateString('ja-JP')
    .split('/')
    .map((p) => p.padStart(2, '0'))
    .join('-');
  document.getElementById('due-date').value = formatted;
}

document.querySelectorAll('.date-chip').forEach((chip) => {
  chip.addEventListener('click', (e) => {
    // アクティブ状態の切り替え
    document
      .querySelectorAll('.date-chip')
      .forEach((c) => c.classList.remove('active'));
    e.target.classList.add('active');

    // 日付の計算とセット
    const offset = parseInt(e.target.getAttribute('data-offset'), 10);
    setDateByOffset(offset);
  });
});

// 初期値（今日）のセット
setDateByOffset(0);

// 送信処理
document.getElementById('makepiece').addEventListener('click', () => {
  const taskname = document.getElementById('task-name').value.trim();
  if (!taskname) {
    alert('タスク名を入力してください');
    return;
  }

  const data = {
    taskname: taskname,
    note: document.getElementById('task-content').value,
    date: document.getElementById('due-date').value,
    state: document.getElementById('task-state').value,
    source: document.getElementById('task-source').value,
    url: document.getElementById('task-url').value,
  };

  chrome.runtime.sendMessage({ action: 'makepiece', data: data });

  // フォームリセット
  document.getElementById('task-name').value = '';
  document.getElementById('task-content').value = '';
  document.getElementById('task-url').value = '';

  // 送信完了メッセージ
  const msg = document.getElementById('status-msg');
  msg.style.opacity = '1';
  setTimeout(() => (msg.style.opacity = '0'), 2000);
});

// ==========================================
// 2. LMS Observer Status ロジック
// ==========================================
async function updateObserverStatus() {
  const statusEl = document.getElementById('obs-status');
  const countEl = document.getElementById('obs-count');
  const notifyEl = document.getElementById('obs-notify');

  chrome.storage.local.get(
    ['lineEnabled', 'lineAccessToken', 'lineUserId'],
    (settings) => {
      if (
        settings.lineEnabled &&
        settings.lineAccessToken &&
        settings.lineUserId
      ) {
        notifyEl.textContent = 'ブラウザ + LINE';
        notifyEl.style.background = '#dcfce7';
        notifyEl.style.color = '#166534';
      } else {
        notifyEl.textContent = 'ブラウザのみ';
        notifyEl.style.background = '#fefce8';
        notifyEl.style.color = '#a16207';
      }
    },
  );

  chrome.tabs.query({ url: '*://lms2.s-diverse.com/*' }, (tabs) => {
    if (tabs && tabs.length > 0) {
      statusEl.textContent = '監視中';
      statusEl.style.color = '#10b981';
      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: 'GET_STATUS' },
        (response) => {
          if (chrome.runtime.lastError || !response) {
            countEl.textContent = '通信エラー';
          } else {
            countEl.textContent = `${response.buttonCount}個`;
          }
        },
      );
    } else {
      statusEl.textContent = '停止中 (LMS未開)';
      statusEl.style.color = '#ef4444';
      countEl.textContent = '-';
    }
  });
}
document.getElementById('refresh-status').addEventListener('click', (e) => {
  const icon = e.target.closest('button').querySelector('i');
  icon.style.transform = 'rotate(180deg)';
  icon.style.transition = 'transform 0.3s';
  updateObserverStatus();
  setTimeout(() => {
    icon.style.transform = 'none';
  }, 300);
});
updateObserverStatus();

// ==========================================
// 3. Page Note ロジック
// ==========================================
const urlDisplay = document.getElementById('current-url');
const noteArea = document.getElementById('note-area');
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
    currentUrlKey = '';
    return;
  }
  const cleanUrl = getCleanUrl(tab.url);
  currentUrlKey = `note_${cleanUrl}`;
  urlDisplay.textContent = cleanUrl;
  noteArea.disabled = false;

  const result = await chrome.storage.local.get([currentUrlKey]);
  noteArea.value = result[currentUrlKey] || '';
}

async function initNote() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  loadNoteForTab(tab);
}

noteArea.addEventListener('input', () => {
  if (!currentUrlKey) return;
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    await chrome.storage.local.set({ [currentUrlKey]: noteArea.value });
    saveStatus.classList.add('show');
    setTimeout(() => saveStatus.classList.remove('show'), 2000);
  }, 500);
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  loadNoteForTab(tab);
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) {
    loadNoteForTab(tab);
  }
});

// ショートカット(Alt+N)でのトグルを維持
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggle_side_panel') {
    sendResponse({ isOpen: true });
    window.close();
  }
});

initNote();
