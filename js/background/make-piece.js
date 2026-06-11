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
  // 1. Storageから設定されたエンドポイントURLを取得
  const storage = await chrome.storage.local.get([
    'makePieceEndpoint',
    'makePieceApiKey',
  ]);
  const endpoint = storage.makePieceEndpoint;
  const makePieceApiKey = storage.makePieceApiKey;

  if (!endpoint) {
    console.error(
      'MakePiece Error: Webhook endpoint is not configured in Settings.',
    );
    return;
  }

  const headers = { 'Content-Type': 'application/json' };
  if (makePieceApiKey) headers['X-API-KEY'] = makePieceApiKey;

  // 2. 送信データの組み立て
  const body = JSON.stringify({
    status: data.state || 'INBOX',
    title: data.taskname || 'TASK FROM FARBE',
    area: 'Work',
    type: 'Task',
    date: data.date || formatDate(new Date()),
    source: data.source || 'LOCAL',
    note: data.note || '',
  });

  if (data.url) fetchData.url = data.url;

  // 3. Webhookの実行
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
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
