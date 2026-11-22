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

// URL文字列を配列に変換する共通ヘルパー関数
function getPatterns(urlsStr) {
  return String(urlsStr || '')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function upsertContextMenu(id, properties) {
  chrome.contextMenus.update(id, properties, () => {
    if (chrome.runtime.lastError) {
      chrome.contextMenus.create({ id, ...properties }, () => {
        void chrome.runtime.lastError;
      });
    }
  });
}

function findMatchingGroup(groups, rule, usedGroupIds = new Set()) {
  const exactMatch = groups.find(
    (g) =>
      !usedGroupIds.has(g.id) &&
      g.title === rule.title &&
      g.color === rule.color,
  );
  if (exactMatch) return exactMatch;

  if (rule.title) {
    return (
      groups.find((g) => !usedGroupIds.has(g.id) && g.title === rule.title) ||
      null
    );
  }
  return null;
}

const sortingWindows = new Set();
const pendingSortWindows = new Set();

async function isManagedGroup(groupId, windowId, tabRules) {
  if (groupId === chrome.tabGroups.TAB_GROUP_ID_NONE || groupId == null) {
    return false;
  }
  try {
    const group = await chrome.tabGroups.get(groupId);
    if (!group || group.windowId !== windowId) return false;
    return tabRules.some(
      (rule) =>
        (rule.title && group.title === rule.title) ||
        (group.title === rule.title && group.color === rule.color),
    );
  } catch {
    return false;
  }
}

// タブの更新検知（ソート・ピン留め・クローズ処理）
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url && !(changeInfo.status === 'complete' && tab.url)) {
    return;
  }
  if (!tab.url) return;

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
        } catch {
          continue;
        }
      }
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        // タブが既に閉じられている場合は無視
      }
      return;
    }
  }

  // 2. Auto Pin処理
  let shouldPin = false;
  for (const rule of pinRules) {
    if (
      getPatterns(rule.urls).some((pattern) => matchPattern(tab.url, pattern))
    ) {
      shouldPin = true;
      break;
    }
  }

  if (shouldPin && !tab.pinned) {
    try {
      await chrome.tabs.update(tabId, { pinned: true });
    } catch {
      return;
    }
  }

  // 3. 共通のルールマッチ判定（重複を排除）
  let matchedRule = null;
  for (const rule of tabRules) {
    if (
      getPatterns(rule.urls).some((pattern) => matchPattern(tab.url, pattern))
    ) {
      matchedRule = rule;
      break;
    }
  }

  // 4. グループ化・ソート処理
  const windowId = tab.windowId;
  if (autoSort) {
    if (sortingWindows.has(windowId)) {
      pendingSortWindows.add(windowId);
      return;
    }
    // autoSortが有効な場合（ルール管理グループに属する非該当タブのみ解除）
    if (
      !matchedRule &&
      tab.openerTabId &&
      (await isManagedGroup(tab.groupId, windowId, tabRules))
    ) {
      try {
        await chrome.tabs.ungroup(tabId);
      } catch {}
    }
    await sortAndGroupTabs(windowId);
  } else {
    // autoSortが無効で、かつピン留め対象のタブはここで終了
    if (shouldPin || tab.pinned) return;
    if (sortingWindows.has(windowId)) return;

    sortingWindows.add(windowId);
    try {
      if (matchedRule) {
        const allGroups = await chrome.tabGroups.query({ windowId });
        const existingGroup = findMatchingGroup(allGroups, matchedRule);
        let groupId;
        if (existingGroup) {
          groupId = existingGroup.id;
          if (tab.groupId !== groupId) {
            await chrome.tabs.group({ tabIds: tabId, groupId });
          }
        } else {
          groupId = await chrome.tabs.group({ tabIds: tabId });
          await chrome.tabGroups.update(groupId, {
            color: matchedRule.color,
            title: matchedRule.title,
          });
        }
      } else if (
        tab.openerTabId &&
        (await isManagedGroup(tab.groupId, windowId, tabRules))
      ) {
        // TaxiTabs管理グループから開かれた非該当タブのみグループ解除＆末尾へ移動
        try {
          await chrome.tabs.ungroup(tabId);
        } catch {}
        try {
          await chrome.tabs.move(tabId, { index: -1 });
        } catch {}
      }
    } catch (error) {
      console.error('TaxiTabs update error:', error);
    } finally {
      sortingWindows.delete(windowId);
    }
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
  return false;
});

// メインのソートロジック
async function sortAndGroupTabs(targetWindowId = null) {
  let windowId = targetWindowId;
  if (windowId == null) {
    const win = await chrome.windows.getLastFocused();
    if (!win) return;
    windowId = win.id;
  }

  if (sortingWindows.has(windowId)) {
    pendingSortWindows.add(windowId);
    return;
  }
  sortingWindows.add(windowId);

  try {
    const tabs = await chrome.tabs.query({ windowId });
    const result = await chrome.storage.local.get(['tabRules']);
    const tabRules = result.tabRules || [];

    const unpinnedTabs = tabs.filter((t) => !t.pinned);
    if (unpinnedTabs.length === 0) return;

    // 各ルールのURL文字列をループ外で一度だけ配列化（パース）しておく
    const parsedRules = tabRules.map((rule) => ({
      ...rule,
      patterns: getPatterns(rule.urls),
    }));

    const getRank = (tab) => {
      for (let g = 0; g < parsedRules.length; g++) {
        const rule = parsedRules[g];
        for (let p = 0; p < rule.patterns.length; p++) {
          if (matchPattern(tab.url, rule.patterns[p])) {
            return {
              groupIdx: g,
              patternIdx: p,
              originalIdx: tab.index,
              rule,
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

    const allGroupsBefore = await chrome.tabGroups.query({ windowId });
    const managedGroupIds = new Set(
      allGroupsBefore
        .filter((g) =>
          tabRules.some(
            (r) =>
              (r.title && g.title === r.title) ||
              (g.title === r.title && g.color === r.color),
          ),
        )
        .map((g) => g.id),
    );

    const ruleGroupIds = new Map();
    const usedGroupIds = new Set();

    for (let g = 0; g < tabRules.length; g++) {
      const rule = tabRules[g];
      const ruleTabs = rankedTabs.filter((t) => t.rank.groupIdx === g);

      if (ruleTabs.length > 0) {
        const currentGroups = await chrome.tabGroups.query({ windowId });
        const existingGroup = findMatchingGroup(
          currentGroups,
          rule,
          usedGroupIds,
        );
        let targetGroupId;
        let firstTabAlreadyGrouped = false;

        if (existingGroup) {
          targetGroupId = existingGroup.id;
        } else {
          targetGroupId = await chrome.tabs.group({ tabIds: ruleTabs[0].id });
          firstTabAlreadyGrouped = true;
          await chrome.tabGroups.update(targetGroupId, {
            color: rule.color,
            title: rule.title,
          });
        }

        usedGroupIds.add(targetGroupId);
        managedGroupIds.add(targetGroupId);
        ruleGroupIds.set(g, targetGroupId);

        const tabsToGroup = ruleTabs
          .filter(
            (t, idx) =>
              !(firstTabAlreadyGrouped && idx === 0) &&
              t.groupId !== targetGroupId,
          )
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
    // ルール管理下のグループに誤って属している非該当タブのみ解除（手動グループは保護）
    const tabsToUngroup = unmatchedTabs
      .filter((t) => managedGroupIds.has(t.groupId))
      .map((t) => t.id);
    if (tabsToUngroup.length > 0) {
      try {
        await chrome.tabs.ungroup(tabsToUngroup);
      } catch {}
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
        const groupId = ruleGroupIds.get(g);
        if (ruleTabs.length > 0 && groupId != null) {
          try {
            await chrome.tabGroups.move(groupId, { index: currentIndex });
          } catch {}
          for (let i = 0; i < ruleTabs.length; i++) {
            try {
              await chrome.tabs.move(ruleTabs[i].id, {
                index: currentIndex + i,
              });
            } catch {}
          }
          currentIndex += ruleTabs.length;
        }
      }

      const freshTabMap = new Map(freshTabs.map((t) => [t.id, t]));
      const ungroupedUnmatchedIds = unmatchedTabs
        .filter((t) => {
          const current = freshTabMap.get(t.id);
          return (
            current && current.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE
          );
        })
        .map((t) => t.id);

      if (ungroupedUnmatchedIds.length > 0) {
        try {
          await chrome.tabs.move(ungroupedUnmatchedIds, { index: -1 });
        } catch {}
      }
    }
  } finally {
    sortingWindows.delete(windowId);
    if (pendingSortWindows.has(windowId)) {
      pendingSortWindows.delete(windowId);
      void sortAndGroupTabs(windowId);
    }
  }
}

// コンテキストメニュー（右クリック）の設定を安全に登録
chrome.runtime.onInstalled.addListener(() => {
  upsertContextMenu('closeAllAndNewTab', {
    title: '🗑️ タブをすべて閉じる',
    contexts: ['action'],
  });
  upsertContextMenu('sort-tabs', {
    title: '🗃️ タブを整理・並び替え',
    contexts: ['action'],
  });
});

// クリック処理
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'closeAllAndNewTab') {
    handleCloseAllAndNewTab(tab?.windowId ?? null);
  }
  if (info.menuItemId === 'sort-tabs') {
    sortAndGroupTabs(tab?.windowId ?? null);
  }
});

async function handleCloseAllAndNewTab(targetWindowId = null) {
  const { closeAllIncludePinned } = await chrome.storage.local.get(
    'closeAllIncludePinned',
  );

  let windowId = targetWindowId;
  if (windowId == null) {
    const win = await chrome.windows.getLastFocused();
    windowId = win?.id ?? null;
  }

  const queryOptions = windowId != null ? { windowId } : { currentWindow: true };
  const existingTabs = await chrome.tabs.query(queryOptions);
  const createOptions = windowId != null ? { windowId } : {};
  const newTab = await chrome.tabs.create(createOptions);

  const tabsToClose = existingTabs
    .filter(
      (t) =>
        t.id !== newTab.id && (closeAllIncludePinned ? true : !t.pinned),
    )
    .map((t) => t.id);

  if (tabsToClose.length > 0) {
    await chrome.tabs.remove(tabsToClose);
  }
}
