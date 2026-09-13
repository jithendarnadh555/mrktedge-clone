const tickerForm = document.getElementById('tickerForm');
const tickerInput = document.getElementById('tickerInput');
const askForm = document.getElementById('askForm');
const askInput = document.getElementById('askInput');
const askBtn = document.getElementById('askBtn');
const chatLog = document.getElementById('chatLog');

const planBtn = document.getElementById('planBtn');
const planResult = document.getElementById('planResult');

const tapeSymbol = document.getElementById('tapeSymbol');
const tapePrice = document.getElementById('tapePrice');
const tapeChange = document.getElementById('tapeChange');
const tapeMeta = document.getElementById('tapeMeta');
const newsList = document.getElementById('newsList');

let currentSymbol = null;
let chatHistory = []; // {role, content} pairs sent back to the model for follow-ups

function fmtPrice(v, type) {
  if (v == null || Number.isNaN(v)) return '—';
  let decimals = 2;
  if (type === 'crypto' && v < 1) decimals = 4;
  if (type === 'forex') decimals = v < 10 ? 4 : 2;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function renderQuote(symbol, quote) {
  tapeSymbol.textContent = symbol;
  if (quote.type === 'forex') {
    tapePrice.textContent = `${fmtLevel(quote.price, 'forex')} ${quote.quoteCcy}`;
  } else {
    tapePrice.textContent = fmtPrice(quote.price, quote.type);
  }
  tapeChange.textContent = fmtPct(quote.changePct);
  tapeChange.className = 'tape-change ' + (quote.changePct > 0 ? 'up' : quote.changePct < 0 ? 'down' : '');
  if (quote.type === 'crypto') tapeMeta.textContent = '24h change · CoinGecko';
  else if (quote.type === 'metal') tapeMeta.textContent = 'spot price, no daily change · goldprice.dev';
  else if (quote.type === 'forex') tapeMeta.textContent = 'daily reference rate, no intraday change · open.er-api.com';
  else tapeMeta.textContent = 'vs. prior close · Finnhub';
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
  planResult.innerHTML = '';
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

function fmtLevel(v, type) {
  if (v == null || Number.isNaN(v)) return '—';
  let decimals = 2;
  if (type === 'forex') decimals = Math.abs(v) < 10 ? 5 : 3;
  if (type === 'crypto' && v < 1) decimals = 6;
  return v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function renderPlan(data) {
  const biasClass = data.bias;
  let html = `<span class="plan-bias ${biasClass}">${data.bias}</span> <span style="font-size:0.8rem;color:var(--ink-soft)">confidence: ${data.confidence}</span>`;
  html += `<p class="plan-reasoning">${data.reasoning}</p>`;

  if (data.plan.side === 'none') {
    html += `<p class="plan-note">${data.plan.note}</p>`;
  } else {
    const t = data.quote.type;
    html += `<table class="plan-table">
      <tr><td>Side</td><td>${data.plan.side.toUpperCase()}</td></tr>
      <tr><td>Lot size</td><td>${data.plan.lot}</td></tr>
      <tr><td>Entry</td><td>${fmtLevel(data.plan.entry, t)}</td></tr>
      <tr class="row-loss"><td>Stop loss</td><td>${fmtLevel(data.plan.stopLoss, t)} (&minus;$${data.plan.riskUsd})</td></tr>
      <tr class="row-gain"><td>Take profit</td><td>${fmtLevel(data.plan.takeProfit, t)} (+$${data.plan.rewardUsd})</td></tr>
    </table>
    <p class="plan-note">${data.plan.note}. Verify against your broker's actual contract size before trading &mdash; this is not financial advice.</p>`;
  }
  planResult.innerHTML = html;
}

planBtn.addEventListener('click', async () => {
  if (!currentSymbol) {
    planResult.innerHTML = '<p class="plan-error">Look up a symbol first.</p>';
    return;
  }
  planBtn.disabled = true;
  planResult.innerHTML = '<p class="plan-note">Thinking…</p>';
  try {
    const res = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: currentSymbol, riskUsd: 5 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    renderPlan(data);
  } catch (err) {
    planResult.innerHTML = `<p class="plan-error">${err.message}</p>`;
  } finally {
    planBtn.disabled = false;
  }
});

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
