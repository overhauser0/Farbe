// ==========================================
// Page Note Module (Background)
// ==========================================

// インストール・更新時に右クリックメニューを追加
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'open-page-note',
    title: '📝 メモを書く',
    contexts: ['action'], // 拡張機能アイコンの右クリックメニューに表示
  });
});

// メニューがクリックされた時の処理
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-page-note') {
    // クリックされたウィンドウのサイドパネルを開く
    chrome.sidePanel.open({ windowId: tab.windowId }).catch((err) => {
      console.error('サイドパネルの起動エラー:', err);
    });
  }
});

// ショートカットキーが押された時の処理（トグル対応版）
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'open_page_note') {
    // 1. まず「無条件で開く」命令を同期的に（一瞬で）実行する
    // ※これでChromeのセキュリティエラー（ユーザー操作直後じゃないとダメ）を回避！
    if (tab && tab.windowId) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    }

    // 2. 直後に「もし既に開いていたら閉じてね」というメッセージを投げる
    chrome.runtime.sendMessage({ action: 'toggle_side_panel' }, () => {
      // Chromeの仕様上、パネルが閉じていた場合は通信エラーが出ますが
      // エラーは無視して大丈夫です（上記 1. の命令でちゃんと開くため）
      if (chrome.runtime.lastError) {
        // 何もしない（エラーをもみ消す）
      }
    });
  }
});
