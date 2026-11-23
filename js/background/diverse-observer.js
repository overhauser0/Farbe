// ==========================================
// Diverse Observer Module
// ==========================================

const NOTIFICATION_URL_PREFIX = 'notif_url_';

function isSafeHttpUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// MV3 Service Worker の休眠・再起動に対応するためトップレベルで1回だけ登録
chrome.notifications.onClicked.addListener(async (clickedNotificationId) => {
  const storageKey = `${NOTIFICATION_URL_PREFIX}${clickedNotificationId}`;
  try {
    const stored = await chrome.storage.session.get(storageKey);
    const targetUrl = stored[storageKey];
    await chrome.storage.session.remove(storageKey);

    if (isSafeHttpUrl(targetUrl)) {
      const tabs = await chrome.tabs.query({ url: targetUrl });
      if (tabs.length > 0) {
        await chrome.tabs.update(tabs[0].id, { active: true });
        await chrome.windows.update(tabs[0].windowId, { focused: true });
      } else {
        await chrome.tabs.create({ url: targetUrl });
      }
    }
  } catch (error) {
    console.error('通知クリック処理エラー:', error);
  } finally {
    chrome.notifications.clear(clickedNotificationId);
  }
});

chrome.notifications.onClosed.addListener((closedNotificationId) => {
  chrome.storage.session
    .remove(`${NOTIFICATION_URL_PREFIX}${closedNotificationId}`)
    .catch(() => {});
});

class NotificationManager {
  async handleNotification(data, settingsOverride = null) {
    const savedSettings = await this.getSettings();
    const settings = settingsOverride
      ? { ...savedSettings, ...settingsOverride }
      : savedSettings;

    await this.sendBrowserNotification(data);

    let lineSent = false;
    let lineError = null;

    if (settings.lineEnabled) {
      if (!settings.lineAccessToken || !settings.lineUserId) {
        lineError = 'LINE アクセストークンとユーザーIDを入力してください';
      } else {
        try {
          await this.sendLineNotification(data, settings);
          lineSent = true;
        } catch (error) {
          lineError = error?.message || 'LINE通知の送信に失敗しました';
          console.error('LINE通知送信エラー:', error);
        }
      }
    }

    return {
      success: lineError === null,
      lineSent,
      error: lineError,
    };
  }

  async sendBrowserNotification(data) {
    const notificationId = `lms_evaluation_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    if (isSafeHttpUrl(data.url)) {
      await chrome.storage.session
        .set({ [`${NOTIFICATION_URL_PREFIX}${notificationId}`]: data.url })
        .catch(() => {});
    }

    await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: '/icon.png',
      title: data.title || 'Farbe 通知',
      message: data.message || '',
      contextMessage: data.url || '',
      priority: 2,
    });

    setTimeout(() => {
      chrome.notifications.clear(notificationId);
      chrome.storage.session
        .remove(`${NOTIFICATION_URL_PREFIX}${notificationId}`)
        .catch(() => {});
    }, 10000);
  }

  async sendLineNotification(data, settings) {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.lineAccessToken}`,
      },
      body: JSON.stringify({
        to: settings.lineUserId,
        messages: [
          {
            type: 'text',
            text: `🔔 ${data.title}\n\n${data.message}\n\n📍 ${data.url}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`LINE API Error (HTTP ${response.status})`);
    }
    console.log('LINE通知送信成功');
  }

  async getSettings() {
    return chrome.storage.local.get({
      lineEnabled: false,
      lineAccessToken: '',
      lineUserId: '',
    });
  }
}

const notificationManager = new NotificationManager();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SEND_NOTIFICATION' && message.data) {
    notificationManager
      .handleNotification(message.data, message.settingsOverride || null)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          success: false,
          error: error?.message || '通知の送信に失敗しました',
        }),
      );
    return true;
  }
  return false;
});
