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
          <label>名前:</label><input type="text" class="tab-title" value="${rule.title}">
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
      <textarea class="tab-urls">${rule.urls}</textarea>
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
          <input type="text" class="block-opener" value="${rule.openerUrl || ''}" placeholder="例: *twitter.com*">
        </div>
        <div style="flex: 1;">
          <label>閉じるURL (必須):</label>
          <input type="text" class="block-target" value="${rule.targetUrl || ''}" placeholder="例: *spam.com*">
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
          <label>メモ:</label><input type="text" class="pin-memo" value="${rule.memo || ''}" placeholder="例: X (Twitter) 用など">
        </div>
        <div class="controls">
          <button class="btn-up" data-type="pin" data-index="${index}">↑</button>
          <button class="btn-down" data-type="pin" data-index="${index}">↓</button>
          <button class="btn-delete" data-type="pin" data-index="${index}">削除</button>
        </div>
      </div>
      <label>対象URL (改行区切り):</label>
      <textarea class="pin-urls">${rule.urls || ''}</textarea>
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
      const msg = document.getElementById('message');
      msg.classList.add('show');
      setTimeout(() => msg.classList.remove('show'), 2000);
    },
  );
};

document.getElementById('btn-sort').onclick = () => {
  chrome.runtime.sendMessage({ action: 'sortTabs' }, (response) => {
    const msg = document.getElementById('message');

    if (chrome.runtime.lastError || !response || !response.success) {
      msg.textContent = 'エラーが発生しました';
      msg.style.color = '#ef4444';
    } else {
      msg.textContent = 'タブを整理しました！';
      msg.style.color = '#10b981';
    }
    msg.classList.add('show');
    setTimeout(() => {
      msg.classList.remove('show');
      setTimeout(() => {
        msg.textContent = '保存しました！';
        msg.style.color = '#10b981';
      }, 300);
    }, 2000);
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
  chrome.runtime.sendMessage({
    type: 'SEND_NOTIFICATION',
    data: {
      title: 'テスト通知',
      message: 'Farbe: LMS評価ボタン監視のテスト通知です。',
      url: 'https://lms2.s-diverse.com/',
    },
  });
});

const navLinks = document.querySelectorAll('.nav-link');
const appContainers = document.querySelectorAll('.app-container');
const scrollArea = document.getElementById('scroll-area');
const btnSort = document.getElementById('btn-sort');

// ==========================================
// Page Note: メモ管理ロジック
// ==========================================

// メモ一覧を描画する関数
function renderNotes() {
  chrome.storage.local.get(null, (items) => {
    const notesContainer = document.getElementById('notes-list-container');
    notesContainer.innerHTML = '';

    let noteCount = 0;

    // ストレージの全データから note_ で始まるものだけを抽出
    for (const [key, value] of Object.entries(items)) {
      if (key.startsWith('note_') && value.trim() !== '') {
        noteCount++;
        const url = key.replace('note_', '');

        const noteDiv = document.createElement('div');
        noteDiv.className = 'rule-card'; // 既存の美しいカードスタイルを流用
        noteDiv.style.display = 'flex';
        noteDiv.style.flexDirection = 'column';
        noteDiv.style.gap = '10px';

        noteDiv.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="font-size: 0.85rem; font-weight: 600; color: var(--primary); word-break: break-all; margin-right: 15px;">
              <i class="fas fa-link" style="color: #9ca3af; margin-right: 4px;"></i>
              <a href="${url}" target="_blank" style="color: var(--primary); text-decoration: none;">${url}</a>
            </div>
            <button class="btn-delete delete-note-btn" data-key="${key}" style="flex-shrink: 0; padding: 6px 12px;">削除</button>
          </div>
          <div style="font-size: 0.9rem; color: var(--text); white-space: pre-wrap; background: #f9fafb; padding: 12px; border-radius: 6px; border: 1px solid var(--border); max-height: 150px; overflow-y: auto; line-height: 1.5;">${value}</div>
        `;

        notesContainer.appendChild(noteDiv);
      }
    }

    if (noteCount === 0) {
      notesContainer.innerHTML =
        '<div style="color: #6b7280; font-size: 0.9rem; text-align: center; padding: 30px; background: var(--card-bg); border-radius: 12px; border: 1px dashed var(--border);">保存されているメモはありません。</div>';
    }

    // 個別削除ボタンのイベント
    document.querySelectorAll('.delete-note-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const key = e.target.getAttribute('data-key');
        if (confirm('このメモを削除してもよろしいですか？')) {
          chrome.storage.local.remove(key, () => {
            renderNotes(); // 削除後に再描画
          });
        }
      });
    });
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
        const msg = document.getElementById('message');
        msg.textContent = '全メモを削除しました';
        msg.classList.add('show');
        setTimeout(() => {
          msg.classList.remove('show');
          msg.textContent = '保存しました！'; // 元に戻す
        }, 2000);
      });
    });
  }
});

// 設定画面を開いた時（初期化時）にメモ一覧を描画する
document.addEventListener('DOMContentLoaded', () => {
  renderNotes();
});

// ==========================================
// WebSocket ステータス表示のリアルタイム更新
// ==========================================

function updateWsBadge(status) {
  const badge = document.getElementById('ws-status-badge');
  if (!badge) return;

  if (status === 'connected') {
    badge.textContent = '🟢 Connected';
    badge.style.color = '#4ade80'; // Noir Glass風のネオングリーン
    badge.style.background = 'rgba(74, 222, 128, 0.15)';
    badge.style.border = '1px solid rgba(74, 222, 128, 0.3)';
  } else if (status === 'connecting') {
    badge.textContent = '🟡 Connecting...';
    badge.style.color = '#facc15';
    badge.style.background = 'rgba(250, 204, 21, 0.15)';
    badge.style.border = '1px solid rgba(250, 204, 21, 0.3)';
  } else {
    badge.textContent = '🔴 Disconnected';
    badge.style.color = '#f87171';
    badge.style.background = 'rgba(248, 113, 113, 0.15)';
    badge.style.border = '1px solid rgba(248, 113, 113, 0.3)';
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
