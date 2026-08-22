// ==========================================
// Make Piece Module
// ==========================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'makepiece' && request.data) {
    handleMakePiece(request.data);
  } else if (request.createtab) {
    chrome.tabs.create({ url: request.createtab.url });
  }
  return true;
});

const formatDate = (date) => date.toISOString().split('T')[0];

async function handleMakePiece(data) {
  // Storageから設定されたエンドポイントURLを取得
  const { makePieceEndpoint, makePieceApiKey } = await chrome.storage.local.get(
    ['makePieceEndpoint', 'makePieceApiKey'],
  );

  if (!makePieceEndpoint) {
    console.error(
      'MakePiece Error: Webhook endpoint is not configured in Settings.',
    );
    return;
  }

  const headers = { 'Content-Type': 'application/json' };
  if (makePieceApiKey) headers['X-API-KEY'] = makePieceApiKey;

  // 送信データの組み立て
  const body = {
    status: data.state || 'INBOX',
    title: data.taskname || 'TASK FROM FARBE',
    area: 'Work',
    type: 'Task',
    note: data.note || '',
    date: data.date || formatDate(new Date()),
    source: data.source || 'LOCAL',
  };

  if (data.note) body.note = data.note;
  if (data.url) body.url = data.url;

  // Webhookの実行
  try {
    const response = await fetch(makePieceEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error('MakePiece Webhook failed:', response.statusText);
    } else {
      console.log('MakePiece Webhook success!');
    }
  } catch (error) {
    console.error('MakePiece Fetch error:', error);
  }
}
