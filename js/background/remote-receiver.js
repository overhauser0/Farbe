let ws = null;
let deviceId = null;
let wsUrl = '';
let deviceName = '';
const RECONNECT_INTERVAL = 5000;

// 初期化処理
async function initWebSocket() {
  const data = await chrome.storage.local.get([
    'wsUrl',
    'wsDeviceName',
    'deviceId',
  ]);
  wsUrl = data.wsUrl || '';
  deviceName = data.wsDeviceName || 'Chrome Extension';

  // 端末固有のIDがない場合は生成して保存
  if (!data.deviceId) {
    deviceId = crypto.randomUUID();
    await chrome.storage.local.set({ deviceId });
  } else {
    deviceId = data.deviceId;
  }

  connect();
}

// WebSocket 接続処理
function connect() {
  if (!wsUrl) return;
  if (
    ws &&
    (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)
  ) {
    return;
  }

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[Farbe: Remote Sync] WebSocket connected');
      broadcastStatus();
      // 接続時に端末情報をサーバーに登録する

      ws.send(
        JSON.stringify({
          type: 'REGISTER_DEVICE',
          clientType: 'extension',
          deviceId,
          deviceName,
        }),
      );

      // 繋がった瞬間も「アクティブ」として報告
      reportActive();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        // Atlasからの指示を受信
        if (msg.type === 'OPEN_URL_ON_PC' && msg.url) {
          console.log('[Farbe: Remote Sync] Opening URL:', msg.url);
          // 新しいタブでURLを開く
          chrome.tabs.create({ url: msg.url, active: true });
        }
      } catch (e) {
        console.error('WebSocket message parse error', e);
      }
    };

    ws.onclose = () => {
      console.log('[Farbe: Remote Sync] WebSocket closed. Reconnecting...');
      broadcastStatus();
      ws = null;
      setTimeout(connect, RECONNECT_INTERVAL);
    };

    ws.onerror = (err) => {
      console.error('[Farbe: Remote Sync] WebSocket error', err);
      if (ws) ws.close();
    };
  } catch (e) {
    console.error('WebSocket connection failed', e);
    setTimeout(connect, RECONNECT_INTERVAL);
  }
}

// アクティブ端末として報告する処理
function reportActive() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: 'REPORT_ACTIVE',
        clientType: 'extension',
        deviceId,
        deviceName,
      }),
    );
  }
}

function broadcastStatus() {
  let status = 'disconnected';
  if (ws && ws.readyState === WebSocket.OPEN) {
    status = 'connected';
  } else if (ws && ws.readyState === WebSocket.CONNECTING) {
    status = 'connecting';
  }

  // 送信先（options画面）が開いていなくてもエラーにならないよう .catch をつける
  chrome.runtime
    .sendMessage({ type: 'WS_STATUS_UPDATE', status })
    .catch(() => {});
}

// ==========================================
// イベントリスナーの登録
// ==========================================

// 1. タブの変動（アクティブタブの切り替え）を検知
chrome.tabs.onActivated.addListener(reportActive);

// 2. ウィンドウのフォーカス切り替えを検知
chrome.windows.onFocusChanged.addListener(reportActive);

// 3. 設定が変更されたら再接続
chrome.storage.onChanged.addListener((changes) => {
  if (changes.wsUrl || changes.wsDeviceName) {
    if (ws) {
      ws.onclose = null; // 自動再接続を一時キャンセル
      ws.close();
    }
    initWebSocket();
  }
});

// 4. Service Worker の休眠を防ぐ（Keep-Alive）
chrome.alarms.create('ws-keepalive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ws-keepalive') {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connect();
    } else {
      // サーバーとの接続維持のために軽いPingを送る
      ws.send(JSON.stringify({ type: 'PING' }));
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_WS_STATUS') {
    let status = 'disconnected';
    if (ws && ws.readyState === WebSocket.OPEN) status = 'connected';
    else if (ws && ws.readyState === WebSocket.CONNECTING)
      status = 'connecting';

    sendResponse({ status: status });
  }
});

// 起動時に接続開始
initWebSocket();
