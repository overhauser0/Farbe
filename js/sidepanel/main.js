// js/sidepanel/main.js
import { initMakePiece } from './makepiece.js';
import { initPageNote } from './pagenote.js';
import { initDiverseObserver } from './diverse.js';
import { initQRCode } from './qrcode.js';

let currentWindowId = null;
let currentActiveTab = 'pane-makepiece';
let bgPort = null;

function activateTab(targetId) {
  const targetTab = document.querySelector(
    `.panel-tab[data-target="${targetId}"]`,
  );
  const targetPane = document.getElementById(targetId);
  if (!targetTab || !targetPane) return;

  document
    .querySelectorAll('.panel-tab')
    .forEach((t) => t.classList.remove('active'));
  targetTab.classList.add('active');

  document
    .querySelectorAll('.panel-content')
    .forEach((c) => c.classList.remove('active'));
  targetPane.classList.add('active');

  currentActiveTab = targetId;
  if (bgPort) {
    try {
      bgPort.postMessage({
        type: 'SET_ACTIVE_TAB',
        activeTab: currentActiveTab,
      });
    } catch {
      // ignore if port is reconnecting
    }
  }
}

function connectSidePanelPort() {
  if (currentWindowId == null) return;
  try {
    bgPort = chrome.runtime.connect({ name: 'sidepanel' });
    bgPort.postMessage({
      type: 'REGISTER_SIDEPANEL',
      windowId: currentWindowId,
      activeTab: currentActiveTab,
    });

    bgPort.onMessage.addListener((message) => {
      if (message?.action === 'close_side_panel') {
        window.close();
      } else if (message?.action === 'switch_tab' && message.target) {
        activateTab(message.target);
      }
    });

    bgPort.onDisconnect.addListener(() => {
      bgPort = null;
      // Service Worker 休眠などで切断された場合は再接続して登録を維持
      setTimeout(() => {
        if (document.visibilityState !== 'hidden') {
          connectSidePanelPort();
        }
      }, 500);
    });
  } catch (error) {
    console.error('Sidepanel port connect error:', error);
  }
}

async function consumePendingTab() {
  if (currentWindowId == null) return;
  try {
    const { pendingSidePanelTab } = await chrome.storage.session.get(
      'pendingSidePanelTab',
    );
    if (
      pendingSidePanelTab &&
      pendingSidePanelTab.windowId === currentWindowId &&
      Date.now() - pendingSidePanelTab.timestamp < 5000
    ) {
      activateTab(pendingSidePanelTab.target);
      await chrome.storage.session.remove('pendingSidePanelTab');
    }
  } catch {
    // ignore
  }
}

// テーマ切替ボタン
const themeToggleBtn = document.getElementById('theme-toggle');
if (themeToggleBtn && window.FarbeTheme) {
  themeToggleBtn.addEventListener('click', () => {
    window.FarbeTheme.toggle();
  });
  window.FarbeTheme.subscribe((theme, effective) => {
    const label =
      effective === 'dark'
        ? 'ライトモードに切替'
        : 'ダークモードに切替';
    themeToggleBtn.title = label;
    themeToggleBtn.setAttribute('aria-label', label);
  });
}

// 設定画面を開く
document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// タブ切り替えロジック
document.querySelectorAll('.panel-tab').forEach((tab) => {
  tab.addEventListener('click', (e) => {
    const targetId = e.currentTarget.getAttribute('data-target');
    if (targetId) activateTab(targetId);
  });
});

// 各機能の初期化処理を実行
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const win = await chrome.windows.getCurrent();
    currentWindowId = win?.id ?? null;
  } catch (error) {
    console.error('Failed to get current window:', error);
  }

  await consumePendingTab();
  connectSidePanelPort();

  initMakePiece();
  initPageNote(currentWindowId);
  initDiverseObserver();
  initQRCode();
});
