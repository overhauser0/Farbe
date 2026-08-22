// js/sidepanel/main.js
import { initMakePiece } from './makepiece.js';
import { initPageNote } from './pagenote.js';
import { initDiverseObserver } from './diverse.js';
import { initQRCode } from './qrcode.js';

// 設定画面を開く
document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// タブ切り替えロジック
document.querySelectorAll('.panel-tab').forEach((tab) => {
  tab.addEventListener('click', (e) => {
    // タブの見た目を切り替え
    document
      .querySelectorAll('.panel-tab')
      .forEach((t) => t.classList.remove('active'));
    const target = e.currentTarget;
    target.classList.add('active');

    // コンテンツの表示を切り替え
    document
      .querySelectorAll('.panel-content')
      .forEach((c) => c.classList.remove('active'));
    document
      .getElementById(target.getAttribute('data-target'))
      .classList.add('active');
  });
});

// ショートカット(Alt+N)でのトグル操作を維持
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggle_side_panel') {
    sendResponse({ isOpen: true });
    window.close();
  }
});

// 各機能の初期化処理を実行
document.addEventListener('DOMContentLoaded', () => {
  initMakePiece();
  initPageNote();
  initDiverseObserver();
  initQRCode();
});
