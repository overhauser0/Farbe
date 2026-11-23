// ==========================================
// Page Note Module (Background)
// ==========================================

const openSidePanels = new Map();

function upsertContextMenu(id, properties) {
  chrome.contextMenus.update(id, properties, () => {
    if (chrome.runtime.lastError) {
      chrome.contextMenus.create({ id, ...properties }, () => {
        void chrome.runtime.lastError;
      });
    }
  });
}

function setPendingTab(windowId, target) {
  chrome.storage.session
    .set({
      pendingSidePanelTab: {
        windowId,
        target,
        timestamp: Date.now(),
      },
    })
    .catch(() => {});
}

// サイドパネルとの接続をウィンドウ単位で管理
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sidepanel') return;

  let registeredWindowId = null;

  port.onMessage.addListener((message) => {
    if (message?.type === 'REGISTER_SIDEPANEL' && message.windowId != null) {
      registeredWindowId = message.windowId;
      openSidePanels.set(registeredWindowId, {
        port,
        activeTab: message.activeTab || 'pane-makepiece',
      });
    } else if (
      message?.type === 'SET_ACTIVE_TAB' &&
      registeredWindowId != null
    ) {
      const entry = openSidePanels.get(registeredWindowId);
      if (entry && entry.port === port) {
        entry.activeTab = message.activeTab;
      }
    }
  });

  port.onDisconnect.addListener(() => {
    if (registeredWindowId != null) {
      const entry = openSidePanels.get(registeredWindowId);
      if (entry && entry.port === port) {
        openSidePanels.delete(registeredWindowId);
      }
    }
  });
});

// インストール・更新時に右クリックメニューを追加
chrome.runtime.onInstalled.addListener(() => {
  upsertContextMenu('open-page-note', {
    title: '📝 メモを書く',
    contexts: ['action'], // 拡張機能アイコンの右クリックメニューに表示
  });
});

// メニューがクリックされた時の処理
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-page-note' && tab?.windowId != null) {
    const existing = openSidePanels.get(tab.windowId);
    if (existing) {
      try {
        existing.port.postMessage({
          action: 'switch_tab',
          target: 'pane-pagenote',
        });
      } catch {
        openSidePanels.delete(tab.windowId);
      }
    }
    setPendingTab(tab.windowId, 'pane-pagenote');
    // クリックされたウィンドウのサイドパネルを開く
    chrome.sidePanel.open({ windowId: tab.windowId }).catch((err) => {
      console.error('サイドパネルの起動エラー:', err);
    });
  }
});

// ショートカットキーが押された時の処理（ウィンドウ別トグル・タブ切替対応）
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'open_page_note' && tab?.windowId != null) {
    const existing = openSidePanels.get(tab.windowId);
    if (existing) {
      try {
        if (existing.activeTab === 'pane-pagenote') {
          existing.port.postMessage({ action: 'close_side_panel' });
        } else {
          existing.port.postMessage({
            action: 'switch_tab',
            target: 'pane-pagenote',
          });
        }
        return;
      } catch {
        openSidePanels.delete(tab.windowId);
      }
    }

    // パネルが閉じている場合は同期的に開き、Page Noteタブを指定する
    setPendingTab(tab.windowId, 'pane-pagenote');
    chrome.sidePanel.open({ windowId: tab.windowId }).catch((err) => {
      console.error('サイドパネルの起動エラー:', err);
    });
  }
});
