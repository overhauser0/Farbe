// ==========================================
// Super App - Service Worker Entry Point
// ==========================================

// 各種モジュールの読み込み
import './taxi-tabs.js';
import './make-piece.js';
import './diverse-observer.js';
import './page-note.js';
import './remote-receiver.js';

// ==========================================
// アイコンクリックでサイドパネルを開く設定
// ==========================================
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);
