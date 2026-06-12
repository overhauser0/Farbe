// ==========================================
// Taxi Tabs Module
// ==========================================

function matchPattern(url, pattern) {
  if (!url || !pattern) return false;
  const regexString = pattern
    .split('*')
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const regex = new RegExp('^' + regexString + '$');
  return regex.test(url);
}

let isSorting = false;

// タブの更新検知（ソート・ピン留め・クローズ処理）
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (isSorting) return;

  if (changeInfo.url || (changeInfo.status === 'complete' && tab.url)) {
    const result = await chrome.storage.local.get([
      'tabRules',
      'blockRules',
      'pinRules',
      'autoSort',
    ]);
    const tabRules = result.tabRules || [];
    const blockRules = result.blockRules || [];
    const pinRules = result.pinRules || [];
    const autoSort = result.autoSort || false;

    // 1. 自動クローズ処理
    for (const rule of blockRules) {
      if (!rule.targetUrl) continue;
      if (matchPattern(tab.url, rule.targetUrl)) {
        if (rule.openerUrl) {
          if (!tab.openerTabId) continue;
          try {
            const openerTab = await chrome.tabs.get(tab.openerTabId);
            if (!matchPattern(openerTab.url, rule.openerUrl)) continue;
          } catch (e) {
            continue;
          }
        }
        await chrome.tabs.remove(tabId);
        return;
      }
    }

    // 2. Auto Pin処理
    let shouldPin = false;
    for (const rule of pinRules) {
      const patterns = rule.urls
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (patterns.some((pattern) => matchPattern(tab.url, pattern))) {
        shouldPin = true;
        break;
      }
    }

    if (shouldPin && !tab.pinned) {
      await chrome.tabs.update(tabId, { pinned: true });
    }

    if (shouldPin || tab.pinned) {
      if (autoSort) {
        let isMatch = false;
        for (const rule of tabRules) {
          const patterns = rule.urls
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          if (patterns.some((pattern) => matchPattern(tab.url, pattern))) {
            isMatch = true;
            break;
          }
        }
        if (!isMatch && tab.openerTabId) {
          try {
            await chrome.tabs.ungroup(tabId);
          } catch (e) {}
        }
        await sortAndGroupTabs();
      }
      return;
    }

    // 3. グループ化・ソート処理
    if (autoSort) {
      let isMatch = false;
      for (const rule of tabRules) {
        const patterns = rule.urls
          .split('\n')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (patterns.some((pattern) => matchPattern(tab.url, pattern))) {
          isMatch = true;
          break;
        }
      }
      if (!isMatch && tab.openerTabId) {
        try {
          await chrome.tabs.ungroup(tabId);
        } catch (e) {}
      }
      await sortAndGroupTabs();
    } else {
      isSorting = true;
      try {
        let isMatch = false;
        for (const rule of tabRules) {
          const patterns = rule.urls
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          if (patterns.some((pattern) => matchPattern(tab.url, pattern))) {
            isMatch = true;
            const existingGroups = await chrome.tabGroups.query({
              title: rule.title,
              windowId: tab.windowId,
            });
            let groupId;
            if (existingGroups.length > 0) {
              groupId = existingGroups[0].id;
              if (tab.groupId !== groupId) {
                await chrome.tabs.group({ tabIds: tabId, groupId: groupId });
              }
            } else {
              groupId = await chrome.tabs.group({ tabIds: tabId });
              await chrome.tabGroups.update(groupId, {
                color: rule.color,
                title: rule.title,
              });
              setTimeout(() => {
                chrome.tabGroups
                  .update(groupId, { title: rule.title })
                  .catch(() => {});
              }, 150);
            }
            break;
          }
        }

        if (!isMatch && tab.openerTabId) {
          try {
            await chrome.tabs.ungroup(tabId);
          } catch (e) {}
          try {
            await chrome.tabs.move(tabId, { index: -1 });
          } catch (e) {}
        }
      } finally {
        isSorting = false;
      }
    }
  }
});

// コンテキストメニュー（右クリック）の設定
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'sort-tabs',
    title: '🗃️ タブを整理・並び替え - TaxiTabs',
    contexts: ['action'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'sort-tabs') {
    sortAndGroupTabs();
  }
});

// 設定画面からのメッセージ受取
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sortTabs') {
    sortAndGroupTabs()
      .then(() => sendResponse({ success: true }))
      .catch((err) => {
        console.error('Sort Error:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});

// メインのソートロジック
async function sortAndGroupTabs() {
  if (isSorting) return;
  isSorting = true;

  try {
    const window = await chrome.windows.getLastFocused();
    if (!window) return;
    const windowId = window.id;

    const tabs = await chrome.tabs.query({ windowId });
    const result = await chrome.storage.local.get(['tabRules']);
    const tabRules = result.tabRules || [];

    const unpinnedTabs = tabs.filter((t) => !t.pinned);
    if (unpinnedTabs.length === 0) return;

    const getRank = (tab) => {
      for (let g = 0; g < tabRules.length; g++) {
        const rule = tabRules[g];
        const patterns = rule.urls
          .split('\n')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        for (let p = 0; p < patterns.length; p++) {
          if (matchPattern(tab.url, patterns[p])) {
            return {
              groupIdx: g,
              patternIdx: p,
              originalIdx: tab.index,
              rule: rule,
            };
          }
        }
      }
      return {
        groupIdx: 9999,
        patternIdx: 9999,
        originalIdx: tab.index,
        rule: null,
      };
    };

    const rankedTabs = unpinnedTabs.map((tab) => ({
      id: tab.id,
      groupId: tab.groupId,
      rank: getRank(tab),
    }));

    rankedTabs.sort((a, b) => {
      if (a.rank.groupIdx !== b.rank.groupIdx)
        return a.rank.groupIdx - b.rank.groupIdx;
      if (a.rank.patternIdx !== b.rank.patternIdx)
        return a.rank.patternIdx - b.rank.patternIdx;
      return a.rank.originalIdx - b.rank.originalIdx;
    });

    for (let g = 0; g < tabRules.length; g++) {
      const rule = tabRules[g];
      const ruleTabs = rankedTabs.filter((t) => t.rank.groupIdx === g);

      if (ruleTabs.length > 0) {
        const existingGroups = await chrome.tabGroups.query({
          title: rule.title,
          windowId,
        });
        let targetGroupId;

        if (existingGroups.length > 0) {
          targetGroupId = existingGroups[0].id;
        } else {
          targetGroupId = await chrome.tabs.group({ tabIds: ruleTabs[0].id });
          await chrome.tabGroups.update(targetGroupId, {
            color: rule.color,
            title: rule.title,
          });
        }

        const tabsToGroup = ruleTabs
          .filter((t) => t.groupId !== targetGroupId)
          .map((t) => t.id);
        if (tabsToGroup.length > 0) {
          await chrome.tabs.group({
            tabIds: tabsToGroup,
            groupId: targetGroupId,
          });
        }
      }
    }

    const unmatchedTabs = rankedTabs.filter((t) => t.rank.groupIdx === 9999);
    const tabsToUngroup = unmatchedTabs
      .filter((t) => t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE)
      .map((t) => t.id);
    if (tabsToUngroup.length > 0) {
      try {
        await chrome.tabs.ungroup(tabsToUngroup);
      } catch (e) {}
    }

    const freshTabs = await chrome.tabs.query({ windowId });
    const freshUnpinned = freshTabs.filter((t) => !t.pinned);

    let isPerfectOrder = true;
    if (freshUnpinned.length === rankedTabs.length) {
      for (let i = 0; i < freshUnpinned.length; i++) {
        if (freshUnpinned[i].id !== rankedTabs[i].id) {
          isPerfectOrder = false;
          break;
        }
      }
    } else {
      isPerfectOrder = false;
    }

    if (!isPerfectOrder) {
      let currentIndex = freshTabs.length - freshUnpinned.length;

      for (let g = 0; g < tabRules.length; g++) {
        const ruleTabs = rankedTabs.filter((t) => t.rank.groupIdx === g);
        if (ruleTabs.length > 0) {
          const existingGroups = await chrome.tabGroups.query({
            title: tabRules[g].title,
            windowId,
          });
          if (existingGroups.length > 0) {
            const groupId = existingGroups[0].id;
            try {
              await chrome.tabGroups.move(groupId, { index: currentIndex });
            } catch (e) {}
            for (let i = 0; i < ruleTabs.length; i++) {
              try {
                await chrome.tabs.move(ruleTabs[i].id, {
                  index: currentIndex + i,
                });
              } catch (e) {}
            }
            currentIndex += ruleTabs.length;
          }
        }
      }

      if (unmatchedTabs.length > 0) {
        const unmatchedIds = unmatchedTabs.map((t) => t.id);
        try {
          await chrome.tabs.move(unmatchedIds, { index: -1 });
        } catch (e) {}
      }
    }
  } finally {
    isSorting = false;
  }
}

// メニュー登録（既存の登録処理にappend）
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'closeAllAndNewTab',
    title: '🗑️ タブをすべて閉じる - TaxiTabs',
    contexts: ['action'],
  });
});

// クリック処理（既存のonClickedリスナーにcaseを追加）
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'closeAllAndNewTab') {
    handleCloseAllAndNewTab();
  }
});

async function handleCloseAllAndNewTab() {
  const { closeAllIncludePinned } = await chrome.storage.local.get(
    'closeAllIncludePinned',
  );

  // 既存タブを先に取得
  const existingTabs = await chrome.tabs.query({});

  // 新規タブを作成し、IDを受け取る
  const newTab = await chrome.tabs.create({});

  // 取得済みの既存タブのみを対象に削除
  const tabsToClose = existingTabs
    .filter((t) => (closeAllIncludePinned ? true : !t.pinned))
    .map((t) => t.id);

  if (tabsToClose.length > 0) {
    await chrome.tabs.remove(tabsToClose);
  }
}
