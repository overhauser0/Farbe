// コンテンツスクリプト - 評価ボタンの監視
const BUTTON_SELECTOR =
  'button, input[type="button"], input[type="submit"], [role="button"], a[onclick]';

class EvaluationButtonMonitor {
  constructor() {
    this.observedButtons = new Map();
    this.elementIds = new WeakMap();
    this.nextButtonSeq = 1;
    this.rescanTimer = null;
    this.debugMode = false; // デバッグモード
    console.log('EvaluationButtonMonitor: 初期化開始');
    this.init();
  }

  init() {
    console.log('EvaluationButtonMonitor: 監視開始');

    // 初期スキャン（遅延実行）
    setTimeout(() => this.scanForButtons(), 1000);
    setTimeout(() => this.scanForButtons(), 3000);
    setTimeout(() => this.scanForButtons(), 5000);

    // DOM変更を監視
    this.setupMutationObserver();

    // 監視中ボタンの状態チェックと削除要素のクリーンアップ（単一インターバル）
    setInterval(() => this.pollObservedButtons(), 2000);

    // 定期的な再スキャン（フォールバック）
    setInterval(() => this.scanForButtons(), 10000);
  }

  scheduleRescan(delay = 500) {
    clearTimeout(this.rescanTimer);
    this.rescanTimer = setTimeout(() => {
      this.rescanTimer = null;
      this.scanForButtons();
    }, delay);
  }

  pollObservedButtons() {
    for (const [buttonId, data] of Array.from(this.observedButtons.entries())) {
      if (!document.contains(data.element)) {
        console.log('EvaluationButtonMonitor: 要素が削除されました:', buttonId);
        data.observer?.disconnect();
        this.observedButtons.delete(buttonId);
        continue;
      }
      this.checkButtonState(data.element, buttonId);
    }
  }

  scanForButtons() {
    console.log('EvaluationButtonMonitor: ボタンスキャン開始');

    const elements = document.querySelectorAll(BUTTON_SELECTOR);
    const foundButtons = elements.length;
    let evaluationButtons = 0;

    elements.forEach((element) => {
      const text = this.getElementText(element);
      if (this.isEvaluationButton(text)) {
        evaluationButtons++;
        const buttonId = this.getButtonId(element);

        if (!this.observedButtons.has(buttonId)) {
          console.log(
            'EvaluationButtonMonitor: 評価ボタンを発見:',
            text,
            element,
          );
          this.observeButton(element, buttonId);
        }
      }
    });

    console.log(
      `EvaluationButtonMonitor: スキャン完了 - 全ボタン: ${foundButtons}個, 評価ボタン: ${evaluationButtons}個, 監視中: ${this.observedButtons.size}個`,
    );

    // デバッグ情報をページに表示（開発時のみ）
    if (this.debugMode) {
      this.showDebugInfo(foundButtons, evaluationButtons);
    }
  }

  getElementText(element) {
    // 要素のテキストを取得（複数の方法を試行）
    return (
      element.textContent ||
      element.innerText ||
      element.value ||
      element.title ||
      ''
    ).trim();
  }

  isEvaluationButton(text) {
    // より柔軟な評価ボタンの判定
    const patterns = [
      '評価',
      'ひょうか',
      'ヒョウカ',
      'evaluation',
      'evaluate',
      'rating',
      'rate',
    ];

    const lowerText = text.toLowerCase();
    return patterns.some((pattern) =>
      lowerText.includes(pattern.toLowerCase()),
    );
  }

  showDebugInfo(totalButtons, evaluationButtons) {
    // デバッグ情報を画面に表示
    let debugDiv = document.getElementById('lms-monitor-debug');
    if (!debugDiv) {
      debugDiv = document.createElement('div');
      debugDiv.id = 'lms-monitor-debug';
      debugDiv.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 10px;
        border-radius: 5px;
        font-size: 12px;
        z-index: 10000;
        max-width: 200px;
      `;
      document.body.appendChild(debugDiv);
    }

    debugDiv.textContent = '';
    const title = document.createElement('strong');
    title.textContent = 'DiverseLMS監視デバッグ';
    debugDiv.appendChild(title);

    const lines = [
      `全ボタン: ${totalButtons}個`,
      `評価ボタン: ${evaluationButtons}個`,
      `監視中: ${this.observedButtons.size}個`,
      `URL: ${location.pathname}`,
      `時刻: ${new Date().toLocaleTimeString()}`,
    ];
    for (const line of lines) {
      debugDiv.appendChild(document.createElement('br'));
      debugDiv.appendChild(document.createTextNode(line));
    }
  }

  getButtonId(element) {
    if (this.elementIds.has(element)) {
      return this.elementIds.get(element);
    }

    const tr = element.closest('tr');
    let keyText = '';

    if (tr) {
      const tds = tr.querySelectorAll('td');
      if (tds.length >= 2) {
        keyText = tds[1].innerText.trim();
      }
    }

    // Fallback: trが無い or tdが足りない場合
    if (!keyText) {
      keyText = this.getElementText(element);
    }

    const uniqueId = `btn_${this.nextButtonSeq++}_${keyText}`;
    this.elementIds.set(element, uniqueId);
    return uniqueId;
  }

  observeButton(element, buttonId) {
    console.log('EvaluationButtonMonitor: 評価ボタンを監視開始:', buttonId);

    // 初期状態を記録
    const isDisabled = this.isElementDisabled(element);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          this.checkButtonState(element, buttonId);
          break;
        }
      }
    });

    observer.observe(element, {
      attributes: true,
      attributeFilter: ['disabled', 'class', 'aria-disabled', 'style'],
    });

    this.observedButtons.set(buttonId, {
      element,
      wasDisabled: isDisabled,
      lastCheck: Date.now(),
      selector: this.getElementSelector(element),
      observer,
    });
  }

  isElementDisabled(element) {
    // 複数の方法でdisabled状態をチェック
    if (element.disabled === true) return true;
    if (element.getAttribute('disabled') !== null) return true;
    if (element.getAttribute('aria-disabled') === 'true') return true;
    if (element.classList.contains('disabled')) return true;
    if (getComputedStyle(element).pointerEvents === 'none') return true;

    return false;
  }

  getElementSelector(element) {
    // 要素のセレクターを生成（デバッグ用）
    const tagName = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const className =
      typeof element.className === 'string' && element.className.trim()
        ? `.${element.className.trim().split(/\s+/).join('.')}`
        : '';
    return `${tagName}${id}${className}`;
  }

  checkButtonState(element, buttonId) {
    const buttonData = this.observedButtons.get(buttonId);
    if (!buttonData) return;

    const isCurrentlyDisabled = this.isElementDisabled(element);
    const wasDisabled = buttonData.wasDisabled;

    if (this.debugMode) {
      console.log(
        `EvaluationButtonMonitor: 状態チェック [${buttonId}] - 前回: ${wasDisabled}, 現在: ${isCurrentlyDisabled}`,
      );
    }

    // disabled状態が解除された場合
    if (wasDisabled && !isCurrentlyDisabled) {
      console.log(
        'EvaluationButtonMonitor: 評価ボタンが有効になりました:',
        buttonId,
      );
      this.sendNotification(element);
    }

    // 状態を更新
    buttonData.wasDisabled = isCurrentlyDisabled;
    buttonData.lastCheck = Date.now();
  }

  sendNotification(element) {
    // ボタンが含まれるtrのテキストを取得
    const tr = element.closest('tr');
    let notificationText = '評価ボタンが有効になりました';

    if (tr) {
      const trT = getTdTextsFromTr(tr);
      if (trT.length >= 6) {
        notificationText = `${trT[1]} ${trT[3]} No.${trT[4]} prog.${(trT[5] || '').trim()}`;
      } else {
        const joined = trT.filter(Boolean).join(' ');
        if (joined) notificationText = joined;
      }
      // 長すぎる場合は切り詰める
      if (notificationText.length > 200) {
        notificationText = notificationText.substring(0, 200) + '...';
      }
    } else {
      // trが見つからない場合は親要素を探す
      const parent = element.closest('div, section, article, form');
      if (parent) {
        const parentText = parent.textContent.replace(/\s+/g, ' ').trim();
        if (parentText.length > 0 && parentText.length <= 200) {
          notificationText = parentText;
        }
      }
    }

    // バックグラウンドスクリプトに通知を送信
    chrome.runtime.sendMessage(
      {
        type: 'SEND_NOTIFICATION',
        data: {
          title: 'Diverse要点書き出し完了',
          message: notificationText,
          url: location.href || 'https://lms2.s-diverse.com/',
        },
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error('送信エラー:', chrome.runtime.lastError.message);
        } else {
          console.log('メッセージ送信成功');
        }
      },
    );
  }

  setupMutationObserver() {
    if (!document.body) return;

    // ページ全体のDOM変更を監視して新しいボタンを検出
    const pageObserver = new MutationObserver((mutations) => {
      let shouldRescan = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // 新しく追加された要素内に評価ボタンがあるかチェック
              const hasButton =
                node.matches &&
                (node.matches(BUTTON_SELECTOR) ||
                  node.querySelector(BUTTON_SELECTOR));

              if (hasButton) {
                shouldRescan = true;
                break;
              }
            }
          }
        }
        if (shouldRescan) break;
      }

      if (shouldRescan) {
        console.log('EvaluationButtonMonitor: DOM変更を検出、再スキャンを実行');
        this.scheduleRescan(500);
      }
    });

    pageObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    console.log('EvaluationButtonMonitor: MutationObserver設定完了');
  }

  // デバッグ用: 手動でボタン一覧を取得
  getAllButtons(includeElement = true) {
    const buttons = document.querySelectorAll(BUTTON_SELECTOR);
    const buttonInfo = [];

    buttons.forEach((btn, index) => {
      const text = this.getElementText(btn);
      const disabled = this.isElementDisabled(btn);
      const entry = {
        index,
        text,
        disabled,
        isEvaluation: this.isEvaluationButton(text),
      };
      if (includeElement) {
        entry.element = btn;
      }
      buttonInfo.push(entry);
    });

    return buttonInfo;
  }
}

function getTdTextsFromTr(trElement) {
  const tdElements = trElement.querySelectorAll('td');
  const result = [];

  tdElements.forEach((td) => {
    const text = td.innerText.trim();
    result.push(text);
  });

  return result;
}

// メッセージリスナーを追加（サイドパネルからの状態問い合わせ用）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    const monitor = document.monitor;
    const buttonCount = monitor ? monitor.observedButtons.size : 0;

    // 構造化クローン可能なデバッグ情報のみ返す
    const debugInfo = monitor
      ? {
          allButtons: monitor.getAllButtons(false),
          observedCount: buttonCount,
          url: location.href,
          timestamp: Date.now(),
        }
      : null;

    sendResponse({
      buttonCount,
      debugInfo,
    });
    return false;
  }

  if (message.type === 'FORCE_SCAN') {
    if (document.monitor) {
      document.monitor.scanForButtons();
      sendResponse({
        success: true,
        buttonCount: document.monitor.observedButtons.size,
      });
    } else {
      sendResponse({ success: false, buttonCount: 0 });
    }
    return false;
  }

  return false;
});

// ページロード後に監視を開始
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('EvaluationButtonMonitor: DOMContentLoaded');
    document.monitor = new EvaluationButtonMonitor();
  });
} else {
  console.log('EvaluationButtonMonitor: 即座に開始');
  document.monitor = new EvaluationButtonMonitor();
}

// ページの可視性が変更された時の処理
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && document.monitor) {
    console.log(
      'EvaluationButtonMonitor: ページが可視になりました、再スキャン実行',
    );
    setTimeout(() => document.monitor.scanForButtons(), 1000);
  }
});

// デバッグ用グローバル関数
window.lmsDebug = {
  getMonitor: () => document.monitor,
  scanNow: () => document.monitor?.scanForButtons(),
  getButtons: () => document.monitor?.getAllButtons(),
  getObserved: () =>
    document.monitor
      ? Array.from(document.monitor.observedButtons.entries())
      : [],
};
