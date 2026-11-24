let ws = null;
let deviceId = null;
let wsUrl = '';
let deviceName = '';
let apiKey = '';
let isAuthenticated = false;
let authErrorCode = null;
let hasLoggedMissingApiKey = false;
let initSeq = 0;
let reconnectTimer = null;
let keepAliveInterval = null;
const RECONNECT_INTERVAL = 5000;
const KEEP_ALIVE_INTERVAL = 25000;
const AUTH_ERROR_STORAGE_KEY = 'wsAuthErrorCode';
const AUTH_CLOSE_CODES = {
  TIMEOUT: 4001,
  FAILED: 4003,
  SERVER_UNCONFIGURED: 1008,
};

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

async function loadAuthErrorCode() {
  if (!chrome.storage?.session) return authErrorCode;
  try {
    const result = await chrome.storage.session.get([AUTH_ERROR_STORAGE_KEY]);
    const code = result[AUTH_ERROR_STORAGE_KEY];
    if (
      code === AUTH_CLOSE_CODES.FAILED ||
      code === AUTH_CLOSE_CODES.SERVER_UNCONFIGURED
    ) {
      authErrorCode = code;
    } else {
      authErrorCode = null;
    }
  } catch {
    // session storage が利用できない環境ではメモリ上の状態を維持
  }
  return authErrorCode;
}

async function saveAuthErrorCode(code) {
  authErrorCode = code;
  if (!chrome.storage?.session) return;
  try {
    if (code === null) {
      await chrome.storage.session.remove(AUTH_ERROR_STORAGE_KEY);
    } else {
      await chrome.storage.session.set({ [AUTH_ERROR_STORAGE_KEY]: code });
    }
  } catch {
    // session storage の書き込みエラーは無視
  }
}

function startKeepAlive() {
  stopKeepAlive();
  keepAliveInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN && isAuthenticated) {
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
  if (!isSafeWsUrl(wsUrl) || !apiKey || authErrorCode !== null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_INTERVAL);
}

function disconnectCurrentSocket() {
  clearReconnectTimer();
  stopKeepAlive();
  isAuthenticated = false;
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
  const seq = ++initSeq;
  const [data] = await Promise.all([
    chrome.storage.local.get([
      'wsUrl',
      'wsDeviceName',
      'deviceId',
      'makePieceApiKey',
    ]),
    loadAuthErrorCode(),
  ]);
  if (seq !== initSeq) return;

  wsUrl = (data.wsUrl || '').trim();
  deviceName = data.wsDeviceName || 'Chrome Extension';
  apiKey = (data.makePieceApiKey || '').trim();

  // 端末固有のIDがない場合は生成して保存
  if (!data.deviceId) {
    deviceId = crypto.randomUUID();
    await chrome.storage.local.set({ deviceId });
    if (seq !== initSeq) return;
  } else {
    deviceId = data.deviceId;
  }

  if (!isSafeWsUrl(wsUrl)) {
    hasLoggedMissingApiKey = false;
    disconnectCurrentSocket();
    return;
  }

  if (!apiKey) {
    if (!hasLoggedMissingApiKey) {
      console.warn(
        '[Farbe: Remote Sync] API Key が未設定のため WebSocket 接続を開始しません。Make Piece 設定で API Key を設定してください。',
      );
      hasLoggedMissingApiKey = true;
    }
    disconnectCurrentSocket();
    return;
  }

  hasLoggedMissingApiKey = false;

  if (authErrorCode !== null) {
    broadcastStatus();
    return;
  }

  connect();
}

// WebSocket 接続処理
function connect() {
  if (!isSafeWsUrl(wsUrl) || !apiKey) {
    disconnectCurrentSocket();
    return;
  }
  if (authErrorCode !== null) {
    broadcastStatus();
    return;
  }
  if (
    ws &&
    (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)
  ) {
    return;
  }

  clearReconnectTimer();
  isAuthenticated = false;

  try {
    const socket = new WebSocket(wsUrl);
    ws = socket;
    broadcastStatus();

    socket.onopen = () => {
      if (ws !== socket) return;
      isAuthenticated = false;
      console.log('[Farbe: Remote Sync] WebSocket connected. Sending AUTH...');
      broadcastStatus();

      // 接続後5秒以内に最初のメッセージとして AUTH を送信する
      // AUTH_OK 受信前は REGISTER_DEVICE / REPORT_ACTIVE / PING を送信しない
      try {
        socket.send(
          JSON.stringify({
            type: 'AUTH',
            apiKey,
          }),
        );
      } catch (e) {
        console.error('[Farbe: Remote Sync] AUTH send error', e);
        try {
          socket.close();
        } catch {}
      }
    };

    socket.onmessage = (event) => {
      if (ws !== socket) return;
      try {
        const msg = JSON.parse(event.data);
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'AUTH_OK') {
          if (isAuthenticated) return;
          isAuthenticated = true;
          void saveAuthErrorCode(null);
          console.log('[Farbe: Remote Sync] Authenticated (AUTH_OK)');
          broadcastStatus();
          startKeepAlive();

          // 認証完了後に端末情報をサーバーに登録する
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

          // 認証完了後に「アクティブ」として報告
          reportActive();
          return;
        }

        if (!isAuthenticated) {
          return;
        }

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

    socket.onclose = (event) => {
      if (ws !== socket) return;
      stopKeepAlive();
      isAuthenticated = false;
      ws = null;

      const code = event?.code;
      if (code === AUTH_CLOSE_CODES.FAILED) {
        console.warn(
          '[Farbe: Remote Sync] WebSocket 認証に失敗しました (code: 4003)。Make Piece 設定の API Key が Atlas サーバーと一致しているか確認してください。自動再接続を停止します。',
        );
        void saveAuthErrorCode(AUTH_CLOSE_CODES.FAILED);
        broadcastStatus();
        return;
      }

      if (code === AUTH_CLOSE_CODES.SERVER_UNCONFIGURED) {
        console.warn(
          '[Farbe: Remote Sync] Atlas サーバー側で ATLAS_API_KEY が未設定です (code: 1008)。サーバー設定および API Key 設定を確認してください。自動再接続を停止します。',
        );
        void saveAuthErrorCode(AUTH_CLOSE_CODES.SERVER_UNCONFIGURED);
        broadcastStatus();
        return;
      }

      if (code === AUTH_CLOSE_CODES.TIMEOUT) {
        console.warn(
          '[Farbe: Remote Sync] WebSocket 認証タイムアウト (code: 4001)。再接続します...',
        );
      } else {
        console.log(
          `[Farbe: Remote Sync] WebSocket closed (code: ${code ?? 'unknown'}). Reconnecting...`,
        );
      }

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
    isAuthenticated = false;
    ws = null;
    broadcastStatus();
    scheduleReconnect();
  }
}

// アクティブ端末として報告する処理
function reportActive() {
  if (ws && ws.readyState === WebSocket.OPEN && isAuthenticated) {
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
  if (ws && ws.readyState === WebSocket.OPEN) {
    return isAuthenticated ? 'connected' : 'connecting';
  }
  if (ws && ws.readyState === WebSocket.CONNECTING) return 'connecting';
  if (isSafeWsUrl(wsUrl) && !apiKey) return 'unconfigured';
  if (authErrorCode === AUTH_CLOSE_CODES.FAILED) return 'auth_failed';
  if (authErrorCode === AUTH_CLOSE_CODES.SERVER_UNCONFIGURED) {
    return 'server_unconfigured';
  }
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
  if (changes.wsUrl || changes.wsDeviceName || changes.makePieceApiKey) {
    hasLoggedMissingApiKey = false;
    initSeq++;
    disconnectCurrentSocket();
    void saveAuthErrorCode(null).then(() => initWebSocket());
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
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (!isAuthenticated) {
        return;
      }
      try {
        ws.send(JSON.stringify({ type: 'PING' }));
      } catch (e) {
        console.error('[Farbe: Remote Sync] Alarm ping failed', e);
      }
    } else if (!ws || ws.readyState !== WebSocket.CONNECTING) {
      void initWebSocket();
    }
  }
});

let initialInitPromise = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_WS_STATUS') {
    Promise.resolve(initialInitPromise)
      .then(() => {
        sendResponse({ status: getWsStatus() });
      })
      .catch(() => {
        sendResponse({ status: getWsStatus() });
      });
    return true;
  }

  if (request.type === 'RETRY_WS_ON_ERROR') {
    if (authErrorCode !== null) {
      hasLoggedMissingApiKey = false;
      initSeq++;
      disconnectCurrentSocket();
      void saveAuthErrorCode(null).then(() => initWebSocket());
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

// 起動時に接続開始
initialInitPromise = initWebSocket();
