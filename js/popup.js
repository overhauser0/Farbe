const taskNameInput = document.querySelector('#task-name');
const taskContentInput = document.querySelector('#task-content');
const taskUrlInput = document.querySelector('#task-url');
const taskSourceInput = document.querySelector('#task-source');
const dueDateInput = document.querySelector('#due-date');
const makePieceBtn = document.querySelector('#makepiece');
const getCurrenturlBtn = document.querySelector('#get-current-url');
const taskstate = document.querySelector('#task-state');
const openOptionsBtn = document.querySelector('#open-options');

const formatDate = (date) => date.toISOString().split('T')[0];

window.onload = () => {
  dueDateInput.value = formatDate(new Date());
  taskNameInput.focus();

  // エンドポイントが設定されているかチェック
  chrome.storage.local.get(['makePieceEndpoint'], (result) => {
    if (!result.makePieceEndpoint || result.makePieceEndpoint.trim() === '') {
      // 未設定の場合はボタンを警告仕様にしてロックする
      makePieceBtn.textContent = '⚠️ 設定からURLを登録してください';
      makePieceBtn.disabled = true;
    }
  });
};

// オプション画面を開く
openOptionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// タスク送信処理
makePieceBtn.addEventListener('click', () => {
  const taskName = taskNameInput.value.trim();
  if (!taskName) return;

  const taskData = {
    taskname: taskName,
    date: dueDateInput.value,
    note: taskContentInput.value,
    url: taskUrlInput.value,
    source: taskSourceInput.value,
    state: taskstate.value,
  };

  chrome.runtime.sendMessage({ action: 'makepiece', data: taskData });

  [taskNameInput, taskContentInput, taskUrlInput].forEach(
    (input) => (input.value = ''),
  );
  window.close();
});

// 日付ショートカット
document.querySelectorAll('.date-chip').forEach((chip) => {
  chip.addEventListener('click', (e) => {
    document.querySelector('.date-chip.active')?.classList.remove('active');
    e.target.classList.add('active');

    const offset = parseInt(e.target.dataset.offset, 10);
    const date = new Date();
    date.setDate(date.getDate() + offset);
    dueDateInput.value = formatDate(date);
  });
});

getCurrenturlBtn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab) {
      taskUrlInput.value = tab.url;
      if (!taskNameInput.value.trim()) taskNameInput.value = tab.title;

      getCurrenturlBtn.classList.add('active');
      setTimeout(() => getCurrenturlBtn.classList.remove('active'), 500);
    }
  } catch (e) {
    console.error('URLの取得に失敗しました', e);
  }
});

// ==========================================
// Diverse Observer Status Updater
// ==========================================

async function updateObserverStatus() {
  const statusEl = document.getElementById('obs-status');
  const countEl = document.getElementById('obs-count');
  const notifyEl = document.getElementById('obs-notify');

  // 1. 設定の取得
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

  // 2. アクティブなLMSタブを取得して状態問い合わせ
  chrome.tabs.query({ url: '*://lms2.s-diverse.com/*' }, (tabs) => {
    if (tabs && tabs.length > 0) {
      statusEl.textContent = '監視中';
      statusEl.style.color = '#10b981'; // Green

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
      statusEl.style.color = '#ef4444'; // Red
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

// ポップアップを開いた時にステータスを更新
document.addEventListener('DOMContentLoaded', updateObserverStatus);
