let ws = null;
let deviceId = null;
let wsUrl = '';
let deviceName = '';
let reconnectTimer = null;
let keepAliveInterval = null;
const RECONNECT_INTERVAL = 5000;
const KEEP_ALIVE_INTERVAL = 25000;

function isSafeHttpUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isSafeWsUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
  } catch {
    return false;
  }
}

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function stopKeepAlive() {
  if (keepAliveInterval !== null) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

function startKeepAlive() {
  stopKeepAlive();
  keepAliveInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'PING' }));
      } catch (e) {
        console.error('[Farbe: Remote Sync] Ping failed', e);
      }
    } else {
      stopKeepAlive();
    }
  }, KEEP_ALIVE_INTERVAL);
}

function scheduleReconnect() {
  clearReconnectTimer();
  if (!isSafeWsUrl(wsUrl)) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_INTERVAL);
}

function disconnectCurrentSocket() {
  clearReconnectTimer();
  stopKeepAlive();
  if (ws) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch {}
    ws = null;
  }
  broadcastStatus();
}

// 初期化処理
async function initWebSocket() {
  const data = await chrome.storage.local.get([
    'wsUrl',
    'wsDeviceName',
    'deviceId',
  ]);
  wsUrl = (data.wsUrl || '').trim();
  deviceName = data.wsDeviceName || 'Chrome Extension';

  // 端末固有のIDがない場合は生成して保存
  if (!data.deviceId) {
    deviceId = crypto.randomUUID();
    await chrome.storage.local.set({ deviceId });
  } else {
    deviceId = data.deviceId;
  }

  if (!isSafeWsUrl(wsUrl)) {
    disconnectCurrentSocket();
    return;
  }

  connect();
}

// WebSocket 接続処理
function connect() {
  if (!isSafeWsUrl(wsUrl)) {
    disconnectCurrentSocket();
    return;
  }
  if (
    ws &&
    (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)
  ) {
    return;
  }

  clearReconnectTimer();

  try {
    const socket = new WebSocket(wsUrl);
    ws = socket;
    broadcastStatus();

    socket.onopen = () => {
      if (ws !== socket) return;
      console.log('[Farbe: Remote Sync] WebSocket connected');
      broadcastStatus();
      startKeepAlive();

      // 接続時に端末情報をサーバーに登録する
      try {
        socket.send(
          JSON.stringify({
            type: 'REGISTER_DEVICE',
            clientType: 'extension',
            deviceId,
            deviceName,
          }),
        );
      } catch (e) {
        console.error('[Farbe: Remote Sync] Register send error', e);
      }

      // 繋がった瞬間も「アクティブ」として報告
      reportActive();
    };

    socket.onmessage = (event) => {
      if (ws !== socket) return;
      try {
        const msg = JSON.parse(event.data);
        // Atlasからの指示を受信（安全なHTTP/HTTPS URLのみ許可）
        if (msg.type === 'OPEN_URL_ON_PC' && msg.url) {
          if (!isSafeHttpUrl(msg.url)) {
            console.warn(
              '[Farbe: Remote Sync] Blocked unsafe URL:',
              msg.url,
            );
            return;
          }
          console.log('[Farbe: Remote Sync] Opening URL:', msg.url);
          chrome.tabs.create({ url: msg.url.trim(), active: true });
        }
      } catch (e) {
        console.error('WebSocket message parse error', e);
      }
    };

    socket.onclose = () => {
      if (ws !== socket) return;
      console.log('[Farbe: Remote Sync] WebSocket closed. Reconnecting...');
      stopKeepAlive();
      ws = null;
      broadcastStatus();
      scheduleReconnect();
    };

    socket.onerror = (err) => {
      if (ws !== socket) return;
      console.error('[Farbe: Remote Sync] WebSocket error', err);
      try {
        socket.close();
      } catch {}
    };
  } catch (e) {
    console.error('WebSocket connection failed', e);
    ws = null;
    broadcastStatus();
    scheduleReconnect();
  }
}

// アクティブ端末として報告する処理
function reportActive() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(
        JSON.stringify({
          type: 'REPORT_ACTIVE',
          clientType: 'extension',
          deviceId,
          deviceName,
        }),
      );
    } catch (e) {
      console.error('[Farbe: Remote Sync] reportActive error', e);
    }
  }
}

function getWsStatus() {
  if (ws && ws.readyState === WebSocket.OPEN) return 'connected';
  if (ws && ws.readyState === WebSocket.CONNECTING) return 'connecting';
  return 'disconnected';
}

function broadcastStatus() {
  const status = getWsStatus();

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

// 2. ウィンドウのフォーカス切り替えを検知（Chrome外へのフォーカス移動は除外）
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  reportActive();
});

// 3. 設定が変更されたら再接続
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.wsUrl || changes.wsDeviceName) {
    disconnectCurrentSocket();
    void initWebSocket();
  }
});

// 4. Service Worker 休眠後の再接続を保証するフォールバックアラーム
chrome.alarms.get('ws-keepalive', (existing) => {
  if (!existing) {
    chrome.alarms.create('ws-keepalive', { periodInMinutes: 1 });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ws-keepalive') {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      void initWebSocket();
    } else {
      try {
        ws.send(JSON.stringify({ type: 'PING' }));
      } catch (e) {
        console.error('[Farbe: Remote Sync] Alarm ping failed', e);
      }
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_WS_STATUS') {
    sendResponse({ status: getWsStatus() });
    return false;
  }
  return false;
});

// 起動時に接続開始
void initWebSocket();
