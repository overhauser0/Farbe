const colors = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
];

const validThemes = ['system', 'light', 'dark'];

const settingKeys = [
  'tabRules',
  'blockRules',
  'pinRules',
  'autoSort',
  'closeAllIncludePinned',
  'makePieceEndpoint',
  'makePieceApiKey',
  'lineEnabled',
  'lineAccessToken',
  'lineUserId',
  'wsUrl',
  'wsDeviceName',
  'theme',
];

const defaultSettings = {
  tabRules: [],
  blockRules: [],
  pinRules: [],
  autoSort: false,
  closeAllIncludePinned: false,
  makePieceEndpoint: '',
  makePieceApiKey: '',
  lineEnabled: false,
  lineAccessToken: '',
  lineUserId: '',
  wsUrl: '',
  wsDeviceName: '',
  theme: 'system',
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateSettings(value) {
  if (!isRecord(value)) return null;

  const settings = { ...defaultSettings };
  let hasKnownSetting = false;
  const stringFields = [
    'makePieceEndpoint',
    'makePieceApiKey',
    'lineAccessToken',
    'lineUserId',
    'wsUrl',
    'wsDeviceName',
  ];
  const booleanFields = ['autoSort', 'closeAllIncludePinned', 'lineEnabled'];

  if ('tabRules' in value) {
    hasKnownSetting = true;
    if (
      !Array.isArray(value.tabRules) ||
      !value.tabRules.every(
        (rule) =>
          isRecord(rule) &&
          typeof rule.title === 'string' &&
          colors.includes(rule.color) &&
          typeof rule.urls === 'string',
      )
    ) {
      return null;
    }
    settings.tabRules = value.tabRules.map(({ title, color, urls }) => ({
      title,
      color,
      urls,
    }));
  }

  if ('blockRules' in value) {
    hasKnownSetting = true;
    if (
      !Array.isArray(value.blockRules) ||
      !value.blockRules.every(
        (rule) =>
          isRecord(rule) &&
          (rule.openerUrl === undefined ||
            typeof rule.openerUrl === 'string') &&
          (rule.targetUrl === undefined || typeof rule.targetUrl === 'string'),
      )
    ) {
      return null;
    }
    settings.blockRules = value.blockRules.map((rule) => ({
      openerUrl: rule.openerUrl || '',
      targetUrl: rule.targetUrl || '',
    }));
  }

  if ('pinRules' in value) {
    hasKnownSetting = true;
    if (
      !Array.isArray(value.pinRules) ||
      !value.pinRules.every(
        (rule) =>
          isRecord(rule) &&
          (rule.memo === undefined || typeof rule.memo === 'string') &&
          (rule.urls === undefined || typeof rule.urls === 'string'),
      )
    ) {
      return null;
    }
    settings.pinRules = value.pinRules.map((rule) => ({
      memo: rule.memo || '',
      urls: rule.urls || '',
    }));
  }

  for (const key of booleanFields) {
    if (key in value) {
      hasKnownSetting = true;
      if (typeof value[key] !== 'boolean') return null;
      settings[key] = value[key];
    }
  }

  for (const key of stringFields) {
    if (key in value) {
      hasKnownSetting = true;
      if (typeof value[key] !== 'string') return null;
      settings[key] = value[key];
    }
  }

  if ('theme' in value) {
    hasKnownSetting = true;
    if (!validThemes.includes(value.theme)) return null;
    settings.theme = value.theme;
  }

  return hasKnownSetting ? settings : null;
}

let messageTimer = null;

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isSafeHttpUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function showMessage(message, isError = false) {
  const msg = document.getElementById('message');
  clearTimeout(messageTimer);
  msg.textContent = message;
  msg.style.color = isError ? '#ef4444' : '#10b981';
  msg.classList.add('show');
  messageTimer = setTimeout(() => {
    msg.classList.remove('show');
    messageTimer = null;
  }, 3000);
}

// === 画面描画処理 ===
function renderTabRules(rules) {
  const container = document.getElementById('tab-rules-container');
  container.innerHTML = '';
  rules.forEach((rule, index) => {
    const div = document.createElement('div');
    div.className = 'rule-card';
    div.innerHTML = `
      <div class="rule-header">
        <div class="input-group">
          <label>名前:</label><input type="text" class="tab-title" value="${escapeHtml(rule.title)}">
          <label>色:</label>
          <select class="tab-color">
            ${colors.map((c) => `<option value="${c}" ${c === rule.color ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="controls">
          <button class="btn-up" data-type="tab" data-index="${index}">↑</button>
          <button class="btn-down" data-type="tab" data-index="${index}">↓</button>
          <button class="btn-delete" data-type="tab" data-index="${index}">削除</button>
        </div>
      </div>
      <label>対象URL (改行区切り):</label>
      <textarea class="tab-urls">${escapeHtml(rule.urls)}</textarea>
    `;
    container.appendChild(div);
  });
}

function renderBlockRules(rules) {
  const container = document.getElementById('block-rules-container');
  container.innerHTML = '';
  rules.forEach((rule, index) => {
    const div = document.createElement('div');
    div.className = 'rule-card';
    div.innerHTML = `
      <div class="rule-header">
        <div class="controls" style="margin-left: auto;">
          <button class="btn-up" data-type="block" data-index="${index}">↑</button>
          <button class="btn-down" data-type="block" data-index="${index}">↓</button>
          <button class="btn-delete" data-type="block" data-index="${index}">削除</button>
        </div>
      </div>
      <div style="display: flex; gap: 15px; margin-bottom: 5px;">
        <div style="flex: 1;">
          <label>親URL (空白可):</label>
          <input type="text" class="block-opener" value="${escapeHtml(rule.openerUrl || '')}" placeholder="例: *twitter.com*">
        </div>
        <div style="flex: 1;">
          <label>閉じるURL (必須):</label>
          <input type="text" class="block-target" value="${escapeHtml(rule.targetUrl || '')}" placeholder="例: *spam.com*">
        </div>
      </div>
    `;
    container.appendChild(div);
  });
}

function renderPinRules(rules) {
  const container = document.getElementById('pin-rules-container');
  container.innerHTML = '';
  rules.forEach((rule, index) => {
    const div = document.createElement('div');
    div.className = 'rule-card';
    div.innerHTML = `
      <div class="rule-header">
        <div class="input-group">
          <label>メモ:</label><input type="text" class="pin-memo" value="${escapeHtml(rule.memo || '')}" placeholder="例: X (Twitter) 用など">
        </div>
        <div class="controls">
          <button class="btn-up" data-type="pin" data-index="${index}">↑</button>
          <button class="btn-down" data-type="pin" data-index="${index}">↓</button>
          <button class="btn-delete" data-type="pin" data-index="${index}">削除</button>
        </div>
      </div>
      <label>対象URL (改行区切り):</label>
      <textarea class="pin-urls">${escapeHtml(rule.urls || '')}</textarea>
    `;
    container.appendChild(div);
  });
}

// === データ取得処理 ===
function getTabRules() {
  return Array.from(
    document.querySelectorAll('#tab-rules-container .rule-card'),
  ).map((card) => ({
    title: card.querySelector('.tab-title').value,
    color: card.querySelector('.tab-color').value,
    urls: card.querySelector('.tab-urls').value,
  }));
}

function getBlockRules() {
  return Array.from(
    document.querySelectorAll('#block-rules-container .rule-card'),
  ).map((card) => ({
    openerUrl: card.querySelector('.block-opener').value.trim(),
    targetUrl: card.querySelector('.block-target').value.trim(),
  }));
}

function getPinRules() {
  return Array.from(
    document.querySelectorAll('#pin-rules-container .rule-card'),
  ).map((card) => ({
    memo: card.querySelector('.pin-memo').value,
    urls: card.querySelector('.pin-urls').value,
  }));
}

// === イベント管理 (追加・削除・並び替え) ===
document.addEventListener('click', (e) => {
  const btn = e.target;
  if (!btn.dataset.type) return;

  const type = btn.dataset.type;
  const index = parseInt(btn.dataset.index);

  let rules, render;
  if (type === 'tab') {
    rules = getTabRules();
    render = renderTabRules;
  } else if (type === 'block') {
    rules = getBlockRules();
    render = renderBlockRules;
  } else if (type === 'pin') {
    rules = getPinRules();
    render = renderPinRules;
  }

  if (btn.classList.contains('btn-up') && index > 0) {
    [rules[index - 1], rules[index]] = [rules[index], rules[index - 1]];
    render(rules);
  } else if (btn.classList.contains('btn-down') && index < rules.length - 1) {
    [rules[index + 1], rules[index]] = [rules[index], rules[index + 1]];
    render(rules);
  } else if (btn.classList.contains('btn-delete')) {
    rules.splice(index, 1);
    render(rules);
  }
});

document.getElementById('add-tab-rule').onclick = () => {
  const rules = getTabRules();
  rules.push({ title: '新規グループ', color: 'grey', urls: '' });
  renderTabRules(rules);
};

document.getElementById('add-block-rule').onclick = () => {
  const rules = getBlockRules();
  rules.push({ openerUrl: '', targetUrl: '' });
  renderBlockRules(rules);
};

document.getElementById('add-pin-rule').onclick = () => {
  const rules = getPinRules();
  rules.push({ memo: '', urls: '' });
  renderPinRules(rules);
};

// === 保存処理 ===
document.getElementById('save-rules').onclick = () => {
  // Taxi Tabs
  const tabRules = getTabRules();
  const blockRules = getBlockRules();
  const pinRules = getPinRules();
  const autoSort = document.getElementById('auto-sort-toggle').checked;
  const closeAllIncludePinned = document.getElementById(
    'closeAllIncludePinned',
  ).checked;

  // Make Piece
  const makePieceEndpoint = document
    .getElementById('makepiece-endpoint')
    .value.trim();
  const makePieceApiKey = document
    .getElementById('makepiece-apikey')
    .value.trim();

  // Diverse Observer
  const lineEnabled = document.getElementById('line-enabled').checked;
  const lineAccessToken = document.getElementById('line-token').value.trim();
  const lineUserId = document.getElementById('line-userid').value.trim();

  // Atlas
  const wsUrl = document.getElementById('ws-url').value.trim();
  const wsDeviceName = document.getElementById('ws-device-name').value.trim();

  chrome.storage.local.set(
    {
      tabRules,
      blockRules,
      pinRules,
      autoSort,
      closeAllIncludePinned,
      makePieceEndpoint,
      makePieceApiKey,
      lineEnabled,
      lineAccessToken,
      lineUserId,
      wsUrl,
      wsDeviceName,
    },
    () => {
      if (chrome.runtime.lastError) {
        showMessage('設定を保存できませんでした', true);
        return;
      }
      showMessage('保存しました！');
    },
  );
};

document.getElementById('export-settings').addEventListener('click', () => {
  chrome.storage.local.get(settingKeys, (settings) => {
    if (chrome.runtime.lastError) {
      showMessage('設定を読み込めませんでした', true);
      return;
    }

    const data = {
      app: 'Farbe',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: { ...defaultSettings, ...settings },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `farbe-settings-${formatLocalDate(new Date())}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showMessage('設定をエクスポートしました');
  });
});

const settingsFile = document.getElementById('settings-file');
document.getElementById('import-settings').addEventListener('click', () => {
  settingsFile.click();
});

settingsFile.addEventListener('change', async () => {
  const file = settingsFile.files[0];
  settingsFile.value = '';
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    if (
      !isRecord(data) ||
      data.app !== 'Farbe' ||
      data.version !== 1
    ) {
      throw new Error('対応していない設定ファイルです');
    }
    const settings = validateSettings(data.settings);
    if (!settings) throw new Error('設定ファイルの内容が正しくありません');

    if (
      !confirm(
        '現在の設定をインポートした内容で上書きします。続行しますか？',
      )
    ) {
      return;
    }

    chrome.storage.local.set(settings, () => {
      if (chrome.runtime.lastError) {
        showMessage('設定をインポートできませんでした', true);
        return;
      }
      showMessage('設定をインポートしました');
      setTimeout(() => window.location.reload(), 500);
    });
  } catch (error) {
    showMessage(
      error instanceof Error
        ? error.message
        : '設定ファイルを読み込めませんでした',
      true,
    );
  }
});

document.getElementById('btn-sort').onclick = () => {
  chrome.runtime.sendMessage({ action: 'sortTabs' }, (response) => {
    if (chrome.runtime.lastError || !response || !response.success) {
      showMessage('エラーが発生しました', true);
    } else {
      showMessage('タブを整理しました！');
    }
  });
};

// === 初期化 ===
chrome.storage.local.get(
  [
    'tabRules',
    'blockRules',
    'pinRules',
    'autoSort',
    'closeAllIncludePinned',
    'makePieceEndpoint',
    'makePieceApiKey',
    'lineEnabled',
    'lineAccessToken',
    'lineUserId',
    'wsUrl',
    'wsDeviceName',
  ],
  (result) => {
    // Taxi Tabs
    renderTabRules(result.tabRules || []);
    renderBlockRules(result.blockRules || []);
    renderPinRules(result.pinRules || []);
    document.getElementById('auto-sort-toggle').checked =
      result.autoSort || false;

    document.getElementById('closeAllIncludePinned').checked =
      result.closeAllIncludePinned ?? false;

    // Make Piece
    if (result.makePieceEndpoint) {
      document.getElementById('makepiece-endpoint').value =
        result.makePieceEndpoint;
    }
    if (result.makePieceApiKey) {
      document.getElementById('makepiece-apikey').value =
        result.makePieceApiKey;
    }

    // Diverse Observer
    const lineCheckbox = document.getElementById('line-enabled');
    const lineContainer = document.getElementById('line-settings-container');
    lineCheckbox.checked = result.lineEnabled || false;
    document.getElementById('line-token').value = result.lineAccessToken || '';
    document.getElementById('line-userid').value = result.lineUserId || '';

    if (lineCheckbox.checked) lineContainer.classList.remove('hidden');

    lineCheckbox.addEventListener('change', (e) => {
      if (e.target.checked) lineContainer.classList.remove('hidden');
      else lineContainer.classList.add('hidden');
    });

    // Atlas
    document.getElementById('ws-url').value = result.wsUrl || '';
    document.getElementById('ws-device-name').value = result.wsDeviceName || '';

    setTimeout(updateScrollSpy, 50);
  },
);

document.getElementById('test-line-btn').addEventListener('click', () => {
  const lineEnabled = document.getElementById('line-enabled').checked;
  const lineAccessToken = document.getElementById('line-token').value.trim();
  const lineUserId = document.getElementById('line-userid').value.trim();

  chrome.runtime.sendMessage(
    {
      type: 'SEND_NOTIFICATION',
      data: {
        title: 'テスト通知',
        message: 'Farbe: LMS評価ボタン監視のテスト通知です。',
        url: 'https://lms2.s-diverse.com/',
      },
      settingsOverride: {
        lineEnabled,
        lineAccessToken,
        lineUserId,
      },
    },
    (response) => {
      if (chrome.runtime.lastError) {
        showMessage('テスト通知の送信に失敗しました', true);
        return;
      }
      if (!response || !response.success) {
        showMessage(response?.error || 'LINE通知の送信に失敗しました', true);
        return;
      }
      showMessage(
        response.lineSent
          ? 'ブラウザ + LINE テスト通知を送信しました！'
          : 'ブラウザのテスト通知を送信しました！',
      );
    },
  );
});

const navLinks = document.querySelectorAll('.nav-link');
const appContainers = document.querySelectorAll('.app-container');
const scrollArea = document.getElementById('scroll-area');
const btnSort = document.getElementById('btn-sort');

// ==========================================
// Page Note: メモ管理ロジック
// ==========================================

function createLinkIconSvg() {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.style.color = 'var(--text-subtle)';
  svg.style.marginRight = '6px';
  svg.style.flexShrink = '0';
  svg.style.verticalAlign = '-2px';

  const path1 = document.createElementNS(svgNS, 'path');
  path1.setAttribute(
    'd',
    'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
  );
  const path2 = document.createElementNS(svgNS, 'path');
  path2.setAttribute(
    'd',
    'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  );
  svg.appendChild(path1);
  svg.appendChild(path2);
  return svg;
}

// メモ一覧を描画する関数（DOM API で安全に構築し XSS を防止）
function renderNotes() {
  chrome.storage.local.get(null, (items) => {
    const notesContainer = document.getElementById('notes-list-container');
    notesContainer.textContent = '';

    let noteCount = 0;

    // ストレージの全データから note_ で始まる文字列のみを抽出
    for (const [key, value] of Object.entries(items)) {
      if (
        key.startsWith('note_') &&
        typeof value === 'string' &&
        value.trim() !== ''
      ) {
        noteCount++;
        const url = key.slice('note_'.length);

        const noteDiv = document.createElement('div');
        noteDiv.className = 'rule-card';
        noteDiv.style.display = 'flex';
        noteDiv.style.flexDirection = 'column';
        noteDiv.style.gap = '10px';

        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.justifyContent = 'space-between';
        headerRow.style.alignItems = 'flex-start';

        const urlWrapper = document.createElement('div');
        urlWrapper.style.fontSize = '0.85rem';
        urlWrapper.style.fontWeight = '600';
        urlWrapper.style.color = 'var(--primary)';
        urlWrapper.style.wordBreak = 'break-all';
        urlWrapper.style.marginRight = '15px';
        urlWrapper.appendChild(createLinkIconSvg());

        if (isSafeHttpUrl(url)) {
          const link = document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.style.color = 'var(--primary)';
          link.style.textDecoration = 'none';
          link.textContent = url;
          urlWrapper.appendChild(link);
        } else {
          const urlSpan = document.createElement('span');
          urlSpan.textContent = url;
          urlWrapper.appendChild(urlSpan);
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete delete-note-btn';
        deleteBtn.style.flexShrink = '0';
        deleteBtn.style.padding = '6px 12px';
        deleteBtn.textContent = '削除';
        deleteBtn.addEventListener('click', () => {
          if (confirm('このメモを削除してもよろしいですか？')) {
            chrome.storage.local.remove(key, () => {
              renderNotes();
            });
          }
        });

        headerRow.appendChild(urlWrapper);
        headerRow.appendChild(deleteBtn);

        const bodyDiv = document.createElement('div');
        bodyDiv.style.fontSize = '0.9rem';
        bodyDiv.style.color = 'var(--text)';
        bodyDiv.style.whiteSpace = 'pre-wrap';
        bodyDiv.style.background = 'var(--surface-subtle)';
        bodyDiv.style.padding = '12px';
        bodyDiv.style.borderRadius = '6px';
        bodyDiv.style.border = '1px solid var(--border)';
        bodyDiv.style.maxHeight = '150px';
        bodyDiv.style.overflowY = 'auto';
        bodyDiv.style.lineHeight = '1.5';
        bodyDiv.textContent = value;

        noteDiv.appendChild(headerRow);
        noteDiv.appendChild(bodyDiv);
        notesContainer.appendChild(noteDiv);
      }
    }

    if (noteCount === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.color = 'var(--text-muted)';
      emptyDiv.style.fontSize = '0.9rem';
      emptyDiv.style.textAlign = 'center';
      emptyDiv.style.padding = '30px';
      emptyDiv.style.background = 'var(--card-bg)';
      emptyDiv.style.borderRadius = '12px';
      emptyDiv.style.border = '1px dashed var(--border)';
      emptyDiv.textContent = '保存されているメモはありません。';
      notesContainer.appendChild(emptyDiv);
    }
  });
}

// 一括削除ボタンのイベント
document.getElementById('delete-all-notes').addEventListener('click', () => {
  if (
    confirm('⚠️ 本当に全てのメモを削除しますか？\nこの操作は取り消せません。')
  ) {
    chrome.storage.local.get(null, (items) => {
      const keysToRemove = Object.keys(items).filter((key) =>
        key.startsWith('note_'),
      );
      chrome.storage.local.remove(keysToRemove, () => {
        renderNotes(); // 削除後に再描画
        showMessage('全メモを削除しました');
      });
    });
  }
});

// 設定画面を開いた時（初期化時）にメモ一覧を描画する
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    renderNotes();
  });
} else {
  renderNotes();
}

// ==========================================
// テーマ切り替え（自動 / ライト / ダーク）
// ==========================================
const themeButtons = document.querySelectorAll('.theme-option');
if (themeButtons.length > 0 && window.FarbeTheme) {
  themeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = btn.getAttribute('data-theme-value');
      if (value) window.FarbeTheme.set(value);
    });
  });

  window.FarbeTheme.subscribe((theme) => {
    themeButtons.forEach((btn) => {
      const isSelected = btn.getAttribute('data-theme-value') === theme;
      btn.classList.toggle('active', isSelected);
      btn.setAttribute('aria-checked', String(isSelected));
    });
  });
}

// ==========================================
// WebSocket ステータス表示のリアルタイム更新
// ==========================================

function updateWsBadge(status) {
  const badge = document.getElementById('ws-status-badge');
  if (!badge) return;

  if (status === 'connected') {
    badge.textContent = '🟢 Connected';
    badge.className = 'status-badge status-badge--success';
  } else if (status === 'connecting') {
    badge.textContent = '🟡 Connecting...';
    badge.className = 'status-badge status-badge--warn';
  } else {
    badge.textContent = '🔴 Disconnected';
    badge.className = 'status-badge status-badge--error';
  }
}

// 1. 設定画面を開いた瞬間に、現在のステータスを問い合わせる
chrome.runtime.sendMessage({ type: 'GET_WS_STATUS' }, (response) => {
  if (chrome.runtime.lastError) return;
  if (response && response.status) {
    updateWsBadge(response.status);
  }
});

// 2. バックグラウンドからのステータス変更通知をリアルタイムに受け取る
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'WS_STATUS_UPDATE') {
    updateWsBadge(msg.status);
  }
});

// 1. メニュークリック時の挙動（アプリ切り替え＆スクロール）
navLinks.forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const targetAppId = link.getAttribute('data-app');
    const targetSectionId = link.getAttribute('data-target');

    // 全てのアプリを非表示にして、対象のアプリだけ表示
    appContainers.forEach((app) => {
      if (app.id === `app-${targetAppId}`) {
        app.classList.add('active');
      } else {
        app.classList.remove('active');
      }
    });

    // クリックしたナビゲーションリンクを即座にアクティブ化（スクロール不要なアプリ対応）
    navLinks.forEach((item) => item.classList.remove('active'));
    link.classList.add('active');

    // TaxiTabsを見ている時だけ「Sort Tabs」ボタンを表示
    if (targetAppId === 'taxitabs') {
      btnSort.classList.remove('hidden');
    } else {
      btnSort.classList.add('hidden');
    }

    // 対象のセクションへスムーススクロール
    const targetSection = document.getElementById(targetSectionId);
    if (targetSection) {
      targetSection.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// 2. スクロールスパイ（現在表示中のアプリ内でのみ作動）
function updateScrollSpy() {
  const activeApp = document.querySelector('.app-container.active');
  if (!activeApp) return;

  const sections = activeApp.querySelectorAll('.section');
  if (sections.length === 0) return;

  let currentSectionId = '';
  // main-content のスクロール量で計算する
  const triggerPoint = scrollArea.scrollTop + 150;

  sections.forEach((section) => {
    // セクションの位置も scrollArea 内での相対位置 (offsetTop) になる
    if (triggerPoint >= section.offsetTop) {
      currentSectionId = section.id;
    }
  });

  // 一番下までスクロールした時の判定
  const isAtBottom =
    scrollArea.clientHeight + scrollArea.scrollTop >=
    scrollArea.scrollHeight - 10;
  if (isAtBottom && sections.length > 0) {
    currentSectionId = sections[sections.length - 1].id;
  }

  // デフォルト
  if (!currentSectionId && sections.length > 0) {
    currentSectionId = sections[0].id;
  }

  // ナビゲーションの active を更新
  navLinks.forEach((link) => {
    link.classList.remove('active');
    // 現在表示されているアプリに属し、かつターゲットIDが一致するリンクを光らせる
    if (
      link.getAttribute('data-app') === activeApp.id.replace('app-', '') &&
      link.getAttribute('data-target') === currentSectionId
    ) {
      link.classList.add('active');
    }
  });
}

// 右側のメインエリアがスクロールされた時にスパイを実行
scrollArea.addEventListener('scroll', updateScrollSpy);
