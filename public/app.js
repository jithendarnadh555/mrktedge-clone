const tickerForm = document.getElementById('tickerForm');
const tickerInput = document.getElementById('tickerInput');
const askForm = document.getElementById('askForm');
const askInput = document.getElementById('askInput');
const askBtn = document.getElementById('askBtn');
const chatLog = document.getElementById('chatLog');

const tapeSymbol = document.getElementById('tapeSymbol');
const tapePrice = document.getElementById('tapePrice');
const tapeChange = document.getElementById('tapeChange');
const tapeMeta = document.getElementById('tapeMeta');
const newsList = document.getElementById('newsList');

let currentSymbol = null;
let chatHistory = []; // {role, content} pairs sent back to the model for follow-ups

function fmtPrice(v, type) {
  if (v == null || Number.isNaN(v)) return '—';
  const decimals = type === 'crypto' && v < 1 ? 4 : 2;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function renderQuote(symbol, quote) {
  tapeSymbol.textContent = symbol;
  tapePrice.textContent = fmtPrice(quote.price, quote.type);
  tapeChange.textContent = fmtPct(quote.changePct);
  tapeChange.className = 'tape-change ' + (quote.changePct > 0 ? 'up' : quote.changePct < 0 ? 'down' : '');
  tapeMeta.textContent = quote.type === 'crypto' ? '24h change · CoinGecko' : 'vs. prior close · Finnhub';
}

function renderNews(items) {
  newsList.innerHTML = '';
  if (!items || !items.length) {
    newsList.innerHTML = '<li class="news-empty">No recent headlines found for this symbol.</li>';
    return;
  }
  for (const n of items) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = n.url || '#';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = n.headline;
    const src = document.createElement('span');
    src.className = 'src';
    src.textContent = n.source || '';
    li.appendChild(a);
    li.appendChild(src);
    newsList.appendChild(li);
  }
}

function addMessage(kind, text) {
  const div = document.createElement('div');
  div.className = `chat-msg chat-msg--${kind}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  return div;
}

async function loadSymbol(symbol) {
  currentSymbol = symbol;
  chatHistory = [];
  tapeSymbol.textContent = symbol;
  tapePrice.textContent = 'loading…';
  tapeChange.textContent = '';
  tapeMeta.textContent = '';
  newsList.innerHTML = '<li class="news-empty">Loading headlines…</li>';

  try {
    const res = await fetch(`/api/snapshot?symbol=${encodeURIComponent(symbol)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lookup failed');
    renderQuote(symbol, data.quote);
    renderNews(data.news);
  } catch (err) {
    tapePrice.textContent = 'unavailable';
    tapeChange.textContent = '';
    newsList.innerHTML = `<li class="news-empty">${err.message}</li>`;
  }
}

tickerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const symbol = tickerInput.value.trim().toUpperCase();
  if (symbol) loadSymbol(symbol);
});

askForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const question = askInput.value.trim();
  if (!question) return;
  if (!currentSymbol) {
    addMessage('error', 'Look up a symbol first, then ask about it.');
    return;
  }

  addMessage('user', question);
  chatHistory.push({ role: 'user', content: question });
  askInput.value = '';
  askBtn.disabled = true;
  const pending = addMessage('system', 'Thinking…');

  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: currentSymbol, question, history: chatHistory }),
    });
    const data = await res.json();
    pending.remove();
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    addMessage('answer', data.answer);
    chatHistory.push({ role: 'assistant', content: data.answer });
    if (data.quote) renderQuote(currentSymbol, data.quote);
    if (data.news) renderNews(data.news);
  } catch (err) {
    pending.remove();
    addMessage('error', err.message);
  } finally {
    askBtn.disabled = false;
  }
});

// Load the default symbol on first paint.
loadSymbol(tickerInput.value.trim().toUpperCase());
