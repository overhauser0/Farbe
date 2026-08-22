// js/sidepanel/makepiece.js
export function initMakePiece() {
  // URL取得ボタン
  document
    .getElementById('get-current-url')
    .addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab && tab.url) {
        document.getElementById('task-url').value = tab.url;
        const icon = document.querySelector('#get-current-url i');
        icon.className = 'fas fa-check';
        icon.style.color = '#10b981';
        setTimeout(() => {
          icon.className = 'fas fa-wand-magic-sparkles';
          icon.style.color = '';
        }, 2000);
      }
    });

  // 日付設定ロジック
  function setDateByOffset(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const formatted = d
      .toLocaleDateString('ja-JP')
      .split('/')
      .map((p) => p.padStart(2, '0'))
      .join('-');
    document.getElementById('due-date').value = formatted;
  }

  document.querySelectorAll('.date-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      document
        .querySelectorAll('.date-chip')
        .forEach((c) => c.classList.remove('active'));
      e.target.classList.add('active');
      const offset = parseInt(e.target.getAttribute('data-offset'), 10);
      setDateByOffset(offset);
    });
  });
  setDateByOffset(0); // 初期値（今日）

  // 送信処理
  document.getElementById('makepiece').addEventListener('click', () => {
    const taskname = document.getElementById('task-name').value.trim();
    if (!taskname) {
      alert('タスク名を入力してください');
      return;
    }

    const data = {
      taskname: taskname,
      childrenText: document.getElementById('task-content').value,
      duedate: document.getElementById('due-date').value,
      state: document.getElementById('task-state').value,
      source: document.getElementById('task-source').value,
      url: document.getElementById('task-url').value,
    };

    chrome.runtime.sendMessage({ action: 'makepiece', data: data });

    // リセット
    document.getElementById('task-name').value = '';
    document.getElementById('task-content').value = '';
    document.getElementById('task-url').value = '';

    const msg = document.getElementById('status-msg');
    msg.style.opacity = '1';
    setTimeout(() => (msg.style.opacity = '0'), 2000);
  });
}
