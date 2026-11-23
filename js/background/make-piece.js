// ==========================================
// Make Piece Module
// ==========================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'makepiece' && request.data) {
    handleMakePiece(request.data)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          success: false,
          error: error?.message || '送信中に予期しないエラーが発生しました',
        }),
      );
    return true;
  }

  if (request.createtab && isSafeHttpUrl(request.createtab.url)) {
    chrome.tabs.create({ url: request.createtab.url });
  }
  return false;
});

function isSafeHttpUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

async function handleMakePiece(data) {
  // Storageから設定されたエンドポイントURLを取得
  const { makePieceEndpoint, makePieceApiKey } = await chrome.storage.local.get(
    ['makePieceEndpoint', 'makePieceApiKey'],
  );

  if (!makePieceEndpoint) {
    const error = '設定画面で Webhook URL を設定してください';
    console.error(
      'MakePiece Error: Webhook endpoint is not configured in Settings.',
    );
    return { success: false, error };
  }

  if (!isSafeHttpUrl(makePieceEndpoint)) {
    const error = 'Webhook URL の形式が正しくありません';
    console.error('MakePiece Error: Invalid Webhook URL:', makePieceEndpoint);
    return { success: false, error };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (makePieceApiKey) headers['X-API-KEY'] = makePieceApiKey;

  const note =
    typeof data.note === 'string'
      ? data.note
      : typeof data.childrenText === 'string'
        ? data.childrenText
        : '';

  // 送信データの組み立て
  const body = {
    status: data.state || 'INBOX',
    title: data.taskname || 'TASK FROM FARBE',
    area: 'Work',
    type: 'Task',
    note,
    start_date: data.date || formatLocalDate(new Date()),
    source: data.source || 'LOCAL',
  };

  if (data.url && data.url.trim()) body.url = data.url.trim();

  // Webhookの実行
  try {
    const response = await fetch(makePieceEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = `送信に失敗しました (HTTP ${response.status})`;
      console.error(
        'MakePiece Webhook failed:',
        response.status,
        response.statusText,
      );
      return { success: false, error };
    }

    console.log('MakePiece Webhook success!');
    return { success: true };
  } catch (error) {
    console.error('MakePiece Fetch error:', error);
    return {
      success: false,
      error: `通信エラー: ${error?.message || '接続できませんでした'}`,
    };
  }
}
