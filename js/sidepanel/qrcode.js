// js/sidepanel/qrcode.js
export function initQRCode() {
  const urlInput = document.getElementById('qr-url');
  const getUrlBtn = document.getElementById('qr-get-url');
  const canvas = document.getElementById('qr-canvas');
  const placeholder = document.getElementById('qr-placeholder');
  const copyBtn = document.getElementById('qr-copy');
  const downloadBtn = document.getElementById('qr-download');
  const msg = document.getElementById('qr-msg');

  const DEFAULT_PLACEHOLDER_HTML = 'URLを入力すると<br />QRコードが生成されます';
  let msgTimer = null;
  let urlFeedbackTimer = null;

  // QRiousインスタンスの初期化
  const qr = new QRious({
    element: canvas,
    size: 160,
    value: '',
    level: 'M',
  });

  // メッセージ表示用関数
  function showMessage(text, isError = false) {
    clearTimeout(msgTimer);
    msg.textContent = text;
    msg.style.color = isError ? '#ef4444' : '#10b981';
    msg.style.opacity = '1';
    msgTimer = setTimeout(() => {
      msg.style.opacity = '0';
    }, 2500);
  }

  function formatLocalCompactDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  // QRコードの生成・表示切り替え
  function generateQR(value) {
    const trimmed = value.trim();
    if (!trimmed) {
      canvas.style.display = 'none';
      placeholder.innerHTML = DEFAULT_PLACEHOLDER_HTML;
      placeholder.style.color = 'var(--text-muted)';
      placeholder.style.display = 'block';
      copyBtn.disabled = true;
      downloadBtn.disabled = true;
      return;
    }

    try {
      qr.value = trimmed;
      canvas.style.display = 'block';
      placeholder.style.display = 'none';
      copyBtn.disabled = false;
      downloadBtn.disabled = false;
    } catch (error) {
      console.error('QR generation error:', error);
      canvas.style.display = 'none';
      placeholder.textContent = '文字数が長すぎるためQRコードを生成できません';
      placeholder.style.color = 'var(--danger)';
      placeholder.style.display = 'block';
      copyBtn.disabled = true;
      downloadBtn.disabled = true;
      showMessage('QRコードの生成に失敗しました', true);
    }
  }

  // 入力時のリアルタイム生成
  urlInput.addEventListener('input', (e) => generateQR(e.target.value));

  // 現在のタブURLを取得
  getUrlBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab && tab.url) {
      urlInput.value = tab.url;
      generateQR(tab.url);

      clearTimeout(urlFeedbackTimer);
      getUrlBtn.classList.add('is-success');
      urlFeedbackTimer = setTimeout(() => {
        getUrlBtn.classList.remove('is-success');
      }, 2000);
    }
  });

  // クリップボードに画像をコピー (Wordやチャットへの貼り付け用)
  copyBtn.addEventListener('click', () => {
    canvas.toBlob((blob) => {
      if (!blob) return;
      try {
        const item = new ClipboardItem({ 'image/png': blob });
        navigator.clipboard
          .write([item])
          .then(() => {
            showMessage('クリップボードにコピーしました！');
          })
          .catch((err) => {
            console.error(err);
            showMessage('コピーに失敗しました', true);
          });
      } catch (err) {
        console.error(err);
        showMessage('お使いの環境は画像コピー非対応です', true);
      }
    }, 'image/png');
  });

  // PNG画像としてダウンロード
  downloadBtn.addEventListener('click', () => {
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    // ファイル名をローカル日時から自動生成
    const dateStr = formatLocalCompactDate(new Date());
    a.download = `QR_${dateStr}.png`;
    a.click();
    showMessage('ダウンロードしました！');
  });
}
