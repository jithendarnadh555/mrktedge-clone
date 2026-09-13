// server.js
// Backend for the market-analyst tool. Keeps API keys off the browser and
// stitches together: live quote -> recent news -> an AI explanation.
//
// Free services used (see README for how to get keys):
//   - Finnhub      (stock/ETF quotes + company news)      https://finnhub.io
//   - CoinGecko    (crypto prices, no key needed)          https://coingecko.com
//   - Groq         (fast, free-tier LLM inference)         https://console.groq.com
//
// Everything here runs on a free tier. No paid plan required.

require('dotenv').config();
const express = require('express');
const path = require('path');

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple in-memory cache so repeated questions don't burn free-tier quota.
const cache = new Map();
const CACHE_MS = 60 * 1000;
function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.v;
  return null;
}
function cacheSet(key, v) {
  cache.set(key, { v, t: Date.now() });
}

const CRYPTO_MAP = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', DOGE: 'dogecoin',
  XRP: 'ripple', ADA: 'cardano', BNB: 'binancecoin', LTC: 'litecoin',
};

// Metals/forex spot symbols, served by goldprice.dev (free, no API key).
const METAL_MAP = {
  XAUUSD: 'XAU-USD-SPOT', GOLD: 'XAU-USD-SPOT',
  XAGUSD: 'XAG-USD-SPOT', SILVER: 'XAG-USD-SPOT',
};

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upstream ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ---- Quote -----------------------------------------------------------
async function getQuote(symbol) {
  const key = `quote:${symbol}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  let data;
  if (METAL_MAP[symbol]) {
    const sym = METAL_MAP[symbol];
    const j = await fetchJSON(
      `https://api.goldprice.dev/v1/prices?symbol=${sym}`
    );
    const row = j.symbols?.[0];
    if (!row) throw new Error(`No data for symbol "${symbol}"`);
    data = {
      symbol,
      type: 'metal',
      price: row.price,
      // This free endpoint doesn't include a daily-change figure.
      changePct: null,
    };
  } else if (CRYPTO_MAP[symbol]) {
    const id = CRYPTO_MAP[symbol];
    const j = await fetchJSON(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`
    );
    const row = j[id];
    data = {
      symbol,
      type: 'crypto',
      price: row.usd,
      changePct: row.usd_24h_change,
    };
  } else {
    if (!FINNHUB_KEY) throw new Error('Missing FINNHUB_API_KEY (see README)');
    const j = await fetchJSON(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`
    );
    if (j.c === 0 && j.pc === 0) throw new Error(`No data for symbol "${symbol}"`);
    data = {
      symbol,
      type: 'equity',
      price: j.c,
      changePct: j.pc ? ((j.c - j.pc) / j.pc) * 100 : 0,
      dayHigh: j.h,
      dayLow: j.l,
      prevClose: j.pc,
    };
  }
  cacheSet(key, data);
  return data;
}

// ---- News --------------------------------------------------------------
async function getNews(symbol) {
  const key = `news:${symbol}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  if (CRYPTO_MAP[symbol] || METAL_MAP[symbol] || !FINNHUB_KEY) {
    // Finnhub's free tier only covers company news for equities; for crypto
    // (or if no key is configured) we skip straight to general market news.
    if (!FINNHUB_KEY) return [];
    const j = await fetchJSON(
      `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_KEY}`
    );
    const items = (j || []).slice(0, 6).map(n => ({
      headline: n.headline, source: n.source, url: n.url, datetime: n.datetime,
    }));
    cacheSet(key, items);
    return items;
  }

  const to = new Date();
  const from = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const fmt = d => d.toISOString().slice(0, 10);
  const j = await fetchJSON(
    `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${fmt(from)}&to=${fmt(to)}&token=${FINNHUB_KEY}`
  );
  const items = (j || []).slice(0, 6).map(n => ({
    headline: n.headline, source: n.source, url: n.url, datetime: n.datetime,
  }));
  cacheSet(key, items);
  return items;
}

// ---- Routes --------------------------------------------------------------
app.get('/api/snapshot', async (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase().trim();
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  try {
    const [quote, news] = await Promise.all([getQuote(symbol), getNews(symbol)]);
    res.json({ quote, news });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/ask', async (req, res) => {
  const { symbol, question, history } = req.body || {};
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym || !question) return res.status(400).json({ error: 'symbol and question are required' });
  if (!GROQ_KEY) return res.status(500).json({ error: 'Missing GROQ_API_KEY (see README)' });

  try {
    const [quote, news] = await Promise.all([getQuote(sym), getNews(sym)]);

    const newsBlock = news.length
      ? news.map((n, i) => `${i + 1}. ${n.headline} (${n.source})`).join('\n')
      : 'No recent headlines available from the free news feed.';

    const hasChange = typeof quote.changePct === 'number';
    const dirWord = !hasChange ? 'unknown' : quote.changePct > 0 ? 'up' : quote.changePct < 0 ? 'down' : 'flat';
    const changeLine = hasChange
      ? `24h/1-day change: ${quote.changePct.toFixed(2)}% (${dirWord})`
      : `24h/1-day change: not available for this symbol (spot price only)`;
    const systemPrompt = `You are a plain-spoken market analyst. You explain price moves using only the data given to you.
Never invent a headline, number, or event that isn't in the provided context. If the news doesn't clearly explain
the move, say so plainly and describe what IS known (price action, sector context) instead of guessing.
Keep answers to 2-4 short paragraphs, no headers, no bullet spam. Sound like a sharp human analyst, not a template.`;

    const userPrompt = `Symbol: ${sym} (${quote.type})
Current price: ${quote.price}
${changeLine}
Recent headlines:
${newsBlock}

Trader's question: ${question}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(Array.isArray(history) ? history.slice(-6) : []),
      { role: 'user', content: userPrompt },
    ];

    const j = await fetchJSON('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0.4, max_tokens: 500 }),
    });

    const answer = j.choices?.[0]?.message?.content?.trim() || 'No answer returned.';
    res.json({ answer, quote, news });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MRKT clone running on http://localhost:${PORT}`));
