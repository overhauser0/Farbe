// js/sidepanel/qrcode.js
export function initQRCode() {
  const urlInput = document.getElementById('qr-url');
  const getUrlBtn = document.getElementById('qr-get-url');
  const canvas = document.getElementById('qr-canvas');
  const placeholder = document.getElementById('qr-placeholder');
  const copyBtn = document.getElementById('qr-copy');
  const downloadBtn = document.getElementById('qr-download');
  const msg = document.getElementById('qr-msg');

  // QRiousインスタンスの初期化
  let qr = new QRious({
    element: canvas,
    size: 160,
    value: '',
    level: 'M',
  });

  // メッセージ表示用関数
  function showMessage(text, isError = false) {
    msg.textContent = text;
    msg.style.color = isError ? '#ef4444' : '#10b981';
    msg.style.opacity = '1';
    setTimeout(() => (msg.style.opacity = '0'), 2500);
  }

  // QRコードの生成・表示切り替え
  function generateQR(value) {
    if (!value.trim()) {
      canvas.style.display = 'none';
      placeholder.style.display = 'block';
      copyBtn.disabled = true;
      downloadBtn.disabled = true;
      return;
    }

    qr.value = value.trim();
    canvas.style.display = 'block';
    placeholder.style.display = 'none';
    copyBtn.disabled = false;
    downloadBtn.disabled = false;
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

      const icon = getUrlBtn.querySelector('i');
      icon.className = 'fas fa-check';
      icon.style.color = '#10b981';
      setTimeout(() => {
        icon.className = 'fas fa-wand-magic-sparkles';
        icon.style.color = '';
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
    // ファイル名を日時から自動生成
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.download = `QR_${dateStr}.png`;
    a.click();
    showMessage('ダウンロードしました！');
  });
}
