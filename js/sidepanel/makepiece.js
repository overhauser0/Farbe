// js/sidepanel/makepiece.js
export function initMakePiece() {
  const getCurrentUrlBtn = document.getElementById('get-current-url');
  const taskNameInput = document.getElementById('task-name');
  const taskContentInput = document.getElementById('task-content');
  const taskUrlInput = document.getElementById('task-url');
  const taskDateInput = document.getElementById('task-date');
  const taskStateSelect = document.getElementById('task-state');
  const taskSourceSelect = document.getElementById('task-source');
  const submitBtn = document.getElementById('makepiece');
  const statusMsg = document.getElementById('status-msg');
  const dateChips = Array.from(document.querySelectorAll('.date-chip'));

  let urlFeedbackTimer = null;
  let statusTimer = null;

  function showStatus(text, isError = false) {
    clearTimeout(statusTimer);
    statusMsg.textContent = text;
    statusMsg.style.color = isError ? '#ef4444' : '#10b981';
    statusMsg.style.opacity = '1';
    statusTimer = setTimeout(() => {
      statusMsg.style.opacity = '0';
    }, isError ? 4000 : 2000);
  }

  function formatDateByOffset(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function syncDateChips() {
    const currentValue = taskDateInput.value;
    dateChips.forEach((chip) => {
      const offset = parseInt(chip.getAttribute('data-offset'), 10);
      chip.classList.toggle(
        'active',
        currentValue === formatDateByOffset(offset),
      );
    });
  }

  // URL取得ボタン
  getCurrentUrlBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab && tab.url) {
      taskUrlInput.value = tab.url;
      clearTimeout(urlFeedbackTimer);
      getCurrentUrlBtn.classList.add('is-success');
      urlFeedbackTimer = setTimeout(() => {
        getCurrentUrlBtn.classList.remove('is-success');
      }, 2000);
    }
  });

  // 日付設定ロジック
  function setDateByOffset(offsetDays) {
    taskDateInput.value = formatDateByOffset(offsetDays);
    syncDateChips();
  }

  dateChips.forEach((chip) => {
    chip.addEventListener('click', (e) => {
      const target = e.currentTarget;
      const offset = parseInt(target.getAttribute('data-offset'), 10);
      setDateByOffset(offset);
    });
  });

  taskDateInput.addEventListener('input', syncDateChips);
  taskDateInput.addEventListener('change', syncDateChips);
  setDateByOffset(0); // 初期値（今日）

  // 送信処理
  submitBtn.addEventListener('click', async () => {
    const taskname = taskNameInput.value.trim();
    if (!taskname) {
      showStatus('タスク名を入力してください', true);
      taskNameInput.focus();
      return;
    }

    const data = {
      taskname,
      note: taskContentInput.value,
      date: taskDateInput.value,
      state: taskStateSelect.value,
      source: taskSourceSelect.value,
      url: taskUrlInput.value.trim(),
    };

    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '送信中...';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'makepiece',
        data,
      });

      if (!response || !response.success) {
        showStatus(response?.error || '送信に失敗しました', true);
        return;
      }

      // 送信成功時のみフォームをリセット
      taskNameInput.value = '';
      taskContentInput.value = '';
      taskUrlInput.value = '';
      showStatus('送信しました！');
    } catch (error) {
      console.error('MakePiece send error:', error);
      showStatus('拡張機能との通信に失敗しました', true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
}
