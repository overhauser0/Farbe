// js/sidepanel/diverse.js
export function initDiverseObserver() {
  const statusEl = document.getElementById('obs-status');
  const countEl = document.getElementById('obs-count');
  const notifyEl = document.getElementById('obs-notify');
  const openLmsBtn = document.getElementById('open-lms-btn');
  const tabIcon = document.getElementById('indicator-diverse');
  const refreshBtn = document.getElementById('refresh-status');

  const LMS_URL_PATTERN = '*://lms2.s-diverse.com/*';
  const LMS_DEFAULT_URL = 'https://lms2.s-diverse.com/coach/A002007';

  async function queryTabStatus(tabId, forceScan = false) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: forceScan ? 'FORCE_SCAN' : 'GET_STATUS',
      });
      if (response && typeof response.buttonCount === 'number') {
        return { ok: true, buttonCount: response.buttonCount };
      }
      return { ok: false, buttonCount: 0 };
    } catch {
      return { ok: false, buttonCount: 0 };
    }
  }

  async function updateObserverStatus(forceScan = false) {
    // 1. 通知設定の確認
    const settings = await chrome.storage.local.get([
      'lineEnabled',
      'lineAccessToken',
      'lineUserId',
    ]);
    if (
      settings.lineEnabled &&
      settings.lineAccessToken &&
      settings.lineUserId
    ) {
      notifyEl.textContent = 'ブラウザ + LINE';
      notifyEl.className = 'status-badge status-badge--success';
    } else {
      notifyEl.textContent = 'ブラウザのみ';
      notifyEl.className = 'status-badge status-badge--warn';
    }

    // 2. 全LMSタブの監視状態を確認
    const tabs = await chrome.tabs.query({ url: LMS_URL_PATTERN });
    if (!tabs || tabs.length === 0) {
      statusEl.textContent = '停止中 (LMS未開)';
      statusEl.style.color = '#ef4444';
      countEl.textContent = '-';
      tabIcon.style.color = '#6b7280';
      return;
    }

    const results = await Promise.all(
      tabs.map((tab) => queryTabStatus(tab.id, forceScan)),
    );
    const activeResults = results.filter((r) => r.ok);

    if (activeResults.length === 0) {
      statusEl.textContent = '接続待ち (再読込が必要)';
      statusEl.style.color = '#d97706';
      countEl.textContent = '通信エラー';
      tabIcon.style.color = '#f59e0b';
      return;
    }

    const totalButtons = activeResults.reduce(
      (sum, r) => sum + r.buttonCount,
      0,
    );
    statusEl.textContent =
      tabs.length > 1 ? `監視中 (${activeResults.length}タブ)` : '監視中';
    statusEl.style.color = '#10b981';
    tabIcon.style.color = '#10b981';
    countEl.textContent = `${totalButtons}個`;
  }

  // リフレッシュボタンの挙動（強制再スキャン実行）
  refreshBtn.addEventListener('click', () => {
    const icon = refreshBtn.querySelector('svg, i');
    if (icon) {
      icon.style.transform = 'rotate(180deg)';
      icon.style.transition = 'transform 0.3s';
      setTimeout(() => {
        icon.style.transform = 'none';
      }, 300);
    }
    void updateObserverStatus(true);
  });

  // LMSを開く
  openLmsBtn.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ url: LMS_URL_PATTERN });
    if (tabs && tabs.length > 0) {
      const targetTab = tabs[0];
      await chrome.tabs.update(targetTab.id, { active: true });
      await chrome.windows.update(targetTab.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url: LMS_DEFAULT_URL });
    }
  });

  // 初期読み込み時のステータスチェック
  void updateObserverStatus(false);

  // 定期的にステータスをチェックする
  setInterval(() => {
    void updateObserverStatus(false);
  }, 10000);
}
