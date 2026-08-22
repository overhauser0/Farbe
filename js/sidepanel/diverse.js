// js/sidepanel/diverse.js
export function initDiverseObserver() {
  const statusEl = document.getElementById('obs-status');
  const countEl = document.getElementById('obs-count');
  const notifyEl = document.getElementById('obs-notify');
  const openLmsBtn = document.getElementById('open-lms-btn');
  const tabIcon = document.getElementById('icon-diverse');

  const LMS_URL_PATTERN = '*://lms2.s-diverse.com/*';
  const LMS_DEFAULT_URL = 'https://lms2.s-diverse.com/coach/A002007';

  function updateObserverStatus() {
    // 1. 通知設定の確認
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

    // 2. LMSタブの監視状態の確認
    chrome.tabs.query({ url: LMS_URL_PATTERN }, (tabs) => {
      if (tabs && tabs.length > 0) {
        // LMSが開かれている場合（監視中）
        statusEl.textContent = '監視中';
        statusEl.style.color = '#10b981';
        tabIcon.style.color = '#10b981';

        chrome.tabs.sendMessage(
          tabs[0].id,
          { type: 'GET_STATUS' },
          (response) => {
            if (chrome.runtime.lastError || !response) {
              countEl.textContent = '通信エラー';
              console.warn('--- Diverse Observer ---');
              console.warn(
                'chrome.runtime.lastError?.message',
                chrome.runtime.lastError?.message,
              );
              console.warn('response', response);
            } else {
              countEl.textContent = `${response.buttonCount}個`;
            }
          },
        );
      } else {
        // LMSが開かれていない場合（停止中）
        statusEl.textContent = '停止中 (LMS未開)';
        statusEl.style.color = '#ef4444';
        countEl.textContent = '-';
        tabIcon.style.color = '#6b7280'; // 🌟 タブのアイコンをグレーに戻す
      }
    });
  }

  // リフレッシュボタンの挙動
  document.getElementById('refresh-status').addEventListener('click', (e) => {
    const icon = e.target.closest('button').querySelector('i');
    icon.style.transform = 'rotate(180deg)';
    icon.style.transition = 'transform 0.3s';
    updateObserverStatus();
    setTimeout(() => {
      icon.style.transform = 'none';
    }, 300);
  });

  // LMSを開く
  openLmsBtn.addEventListener('click', () => {
    chrome.tabs.query({ url: LMS_URL_PATTERN }, (tabs) => {
      if (tabs && tabs.length > 0) {
        const targetTab = tabs[0];
        chrome.tabs.update(targetTab.id, { active: true });
        chrome.windows.update(targetTab.windowId, { focused: true });
      } else {
        chrome.tabs.create({ url: LMS_DEFAULT_URL });
      }
    });
  });

  // 初期読み込み時のステータスチェック
  updateObserverStatus();

  // 定期的にステータスをチェックする（必要に応じて）
  setInterval(updateObserverStatus, 10000);
}
