# Lifnux3

## Running locally

1) Install Node deps
```
npm install
```

2) Set up the quote service
```
copy quote-service\\.env.example quote-service\\.env
notepad quote-service\\.env
npm run quote:venv
```

3) Run both servers
```
npm run dev:all
```

### Endpoints to verify

- Quote service health:
  - `http://127.0.0.1:8000/health`
- Quote service quotes:
  - `http://127.0.0.1:8000/quotes?symbols=AMZN,AAPL,005930.KS`
- Quote service history:
  - `http://127.0.0.1:8000/history?symbols=AMZN,AAPL,005930.KS&start=2026-01-01&end=2026-02-24`
- Next.js proxy:
  - `http://localhost:3000/api/quotes?symbols=AMZN,AAPL,005930.KS`
  - `http://localhost:3000/api/history?symbols=AMZN,AAPL,005930.KS&start=2026-01-01&end=2026-02-24`

### Notes

- The quote service reads `FINNHUB_API_KEY` from `quote-service/.env`.
- Optional overrides in `quote-service/.env`:
  - `QUOTE_CACHE_TTL` (seconds, default 30)
  - `QUOTE_CONCURRENCY` (default 6)
- The proxy reads `QUOTE_SERVICE_URL` from the Next.js environment (defaults to `http://127.0.0.1:8000`).
