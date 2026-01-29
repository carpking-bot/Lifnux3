import asyncio
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query

load_dotenv()

app = FastAPI()

FINNHUB_BASE = "https://finnhub.io/api/v1"

DEFAULT_TTL = 30
DEFAULT_CONCURRENCY = 6

_cache: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
_env_logged = False


def _get_token() -> str:
    return os.getenv("FINNHUB_API_KEY") or os.getenv("FINNHUB_TOKEN") or ""


def _get_ttl_seconds() -> int:
    raw = os.getenv("QUOTE_CACHE_TTL", str(DEFAULT_TTL))
    try:
        ttl = int(raw)
    except ValueError:
        ttl = DEFAULT_TTL
    return max(5, min(120, ttl))


def _get_concurrency() -> int:
    raw = os.getenv("QUOTE_CONCURRENCY", str(DEFAULT_CONCURRENCY))
    try:
        limit = int(raw)
    except ValueError:
        limit = DEFAULT_CONCURRENCY
    return max(1, min(8, limit))


def _get_ssl_verify() -> bool:
    raw = os.getenv("QUOTE_SSL_VERIFY", "true").strip().lower()
    if raw in ("0", "false", "no", "off"):
        return False
    return True


def _normalize_symbols(symbols: List[str]) -> List[str]:
    normalized: List[str] = []
    for symbol in symbols:
        s = symbol.strip().upper()
        if s:
            normalized.append(s)
    return list(dict.fromkeys(normalized))


def _cache_key(symbols: List[str]) -> str:
    return ",".join(sorted(symbols))


def _empty_quote(symbol: str) -> Dict[str, Any]:
    return {
        "symbol": symbol,
        "price": None,
        "change": None,
        "changePercent": None,
        "currency": None,
        "marketTime": None,
        "source": "finnhub",
    }


def _iso_time(epoch_seconds: float) -> str:
    return datetime.fromtimestamp(epoch_seconds, tz=timezone.utc).isoformat().replace("+00:00", "Z")


async def _fetch_quote(
    client: httpx.AsyncClient, symbol: str, token: str, sem: asyncio.Semaphore
) -> Dict[str, Any]:
    async with sem:
        params = {"symbol": symbol, "token": token}
        try:
            resp = await client.get(f"{FINNHUB_BASE}/quote", params=params, timeout=10.0)
        except Exception as exc:
            print("[FINNHUB FETCH ERROR]", symbol, repr(exc))
            return _empty_quote(symbol)

        if resp.status_code != 200:
            body = resp.text[:500]
            print("[FINNHUB HTTP ERROR]", resp.status_code, symbol, body)
            return _empty_quote(symbol)

        try:
            data = resp.json()
        except Exception as exc:
            print("[FINNHUB JSON ERROR]", symbol, repr(exc))
            return _empty_quote(symbol)

        price = data.get("c")
        market_time = data.get("t")
        if not isinstance(price, (int, float)):
            print("[FINNHUB BAD QUOTE]", symbol, data)
            return _empty_quote(symbol)

        if not isinstance(market_time, (int, float)):
            print("[FINNHUB BAD QUOTE]", symbol, data)
            return _empty_quote(symbol)

        return {
            "symbol": symbol,
            "price": float(price),
            "change": float(data["d"]) if isinstance(data.get("d"), (int, float)) else None,
            "changePercent": float(data["dp"]) if isinstance(data.get("dp"), (int, float)) else None,
            "currency": None,
            "marketTime": _iso_time(float(market_time)),
            "source": "finnhub",
        }


@app.get("/health")
async def health() -> Dict[str, Any]:
    token = _get_token()
    return {"ok": True, "tokenExists": bool(token)}


@app.get("/quotes")
async def get_quotes(symbols: str = Query("", description="Comma-separated symbols")) -> Dict[str, Any]:
    global _env_logged
    token = _get_token()
    if not _env_logged:
        _env_logged = True
        print("[FINNHUB ENV] tokenExists=", bool(token))
    if not token:
        raise HTTPException(status_code=500, detail="Finnhub API key not configured")

    raw_symbols = symbols.split(",") if symbols else []
    normalized = _normalize_symbols(raw_symbols)
    if not normalized:
        return {"quotes": []}

    key = _cache_key(normalized)
    now = time.time()
    cached = _cache.get(key)
    if cached and cached[0] > now:
        return {"quotes": cached[1]}

    sem = asyncio.Semaphore(_get_concurrency())
    ssl_verify = _get_ssl_verify()
    if not ssl_verify:
        print("[QUOTE SERVICE WARNING] SSL verification disabled")
    async with httpx.AsyncClient(headers={"Accept": "application/json"}, verify=ssl_verify) as client:
        quotes = await asyncio.gather(*[_fetch_quote(client, symbol, token, sem) for symbol in normalized])

    _cache[key] = (now + _get_ttl_seconds(), quotes)
    return {"quotes": quotes}
