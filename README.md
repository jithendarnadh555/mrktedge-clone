# Ledger — a free, self-hosted market-analyst dashboard

A working clone of the core idea behind mrktedge.ai: look up a symbol, see its
price and recent headlines, and ask "why" — answered by an AI grounded only in
the data shown on screen. Everything runs on free tiers, no paid plan needed.

## What it uses (all free)

| Purpose            | Service   | Cost                               | Sign up                              |
|---------------------|-----------|-------------------------------------|----------------------------------------|
| Stock/ETF quotes + news | Finnhub | Free tier (60 calls/min)         | https://finnhub.io/register            |
| Crypto prices        | CoinGecko | Free, no key required              | (nothing to do)                        |
| AI "why" answers      | Groq      | Free tier, generous daily quota    | https://console.groq.com/keys          |

You only need to sign up for Finnhub and Groq — both take under two minutes,
no credit card required.

## Setup

1. **Install Node.js 18+** if you don't have it: https://nodejs.org

2. **Unzip this project**, then in a terminal:
   ```bash
   cd mrktedge-clone
   npm install
   ```

3. **Add your free API keys.** Copy the example env file:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and paste in your keys:
   ```
   FINNHUB_API_KEY=your_finnhub_key_here
   GROQ_API_KEY=your_groq_key_here
   ```

4. **Run it:**
   ```bash
   npm start
   ```
   Then open http://localhost:3000 in your browser.

## Using it

- Type a symbol in the top-right box: stock tickers like `AAPL`, `TSLA`,
  `NVDA`, or crypto like `BTC`, `ETH`, `SOL`.
- The strip below the header shows the live price and change.
- The right-hand panel lists recent headlines for that symbol.
- Ask a question in the chat box, e.g. "why is it down today" or "what's the
  sentiment right now" — the AI answers using only the price and headlines
  already shown, and says so plainly if the news doesn't explain the move.

## Deploying it for free (GitHub + Render)

GitHub alone only serves static files — it can't run this app's server, which
is what keeps your API keys hidden. So: push the code to GitHub, then connect
that repo to a free host that runs Node. This project already includes a
`render.yaml` so Render picks up the settings automatically.

1. **Push to GitHub:**
   ```bash
   cd mrktedge-clone
   git init
   git add .
   git commit -m "Initial commit"
   ```
   Create a new repo on https://github.com/new, then:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git branch -M main
   git push -u origin main
   ```
   (`.env` is already git-ignored, so your keys won't be uploaded.)

2. **Deploy on Render (free):**
   - Go to https://dashboard.render.com and sign in with GitHub.
   - Click **New +** → **Blueprint**, and pick the repo you just pushed.
   - Render reads `render.yaml` and sets everything up. When prompted, paste
     in your `FINNHUB_API_KEY` and `GROQ_API_KEY`.
   - Click **Apply** — you'll get a live URL like
     `https://ledger-market-dashboard.onrender.com` in a few minutes.

Every future `git push` to `main` auto-redeploys the site.

*(Railway and Fly.io are free alternatives that work the same way — connect
the GitHub repo, set the two env vars, deploy — if you'd rather use one of
those instead.)*

## Notes and limits

- Finnhub's free tier covers company news for **US equities**; crypto uses
  general market headlines instead of coin-specific news.
- Responses are cached for 60 seconds per symbol to stay comfortably inside
  free-tier rate limits.
- The AI is instructed not to invent headlines or numbers — if the news
  doesn't explain a move, it says so instead of guessing.
- This is an educational tool, not financial advice — same as the original
  site's own disclaimers would tell you.

## Project structure

```
mrktedge-clone/
├── server.js          # Express backend: quote/news fetch + AI endpoint
├── package.json
├── .env.example        # copy to .env and fill in your keys
└── public/
    ├── index.html
    ├── styles.css
    └── app.js
```
# mrktedge-clone
# mrktedge-clone
# mrktedge-clone
