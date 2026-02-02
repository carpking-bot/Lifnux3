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
DBSEC_BASE = "https://openapi.dbsec.co.kr:8443"
DBSEC_TOKEN_URL = f"{DBSEC_BASE}/oauth2/token"
DBSEC_PRICE_URL = f"{DBSEC_BASE}/api/v1/quote/kr-stock/inquiry/price"
DBSEC_TICKER_URL = f"{DBSEC_BASE}/api/v1/quote/kr-stock/inquiry/stock-ticker"

DEFAULT_TTL = 30
DEFAULT_CONCURRENCY = 6

_cache: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
_search_cache: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
_env_logged = False
_db_token: Dict[str, Any] = {"access_token": "", "expires_at": 0.0}
_db_token_lock = asyncio.Lock()


def _get_token() -> str:
    return os.getenv("FINNHUB_API_KEY") or os.getenv("FINNHUB_TOKEN") or ""


def _get_db_credentials() -> Tuple[str, str]:
    return os.getenv("DBSEC_APP_KEY") or "", os.getenv("DBSEC_APP_SECRET") or ""


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


def _empty_quote_with_source(symbol: str, source: str) -> Dict[str, Any]:
    empty = _empty_quote(symbol)
    empty["source"] = source
    return empty


def _iso_time(epoch_seconds: float) -> str:
    return datetime.fromtimestamp(epoch_seconds, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _is_valid_quote(data: Dict[str, Any]) -> bool:
    price = data.get("c")
    market_time = data.get("t")
    return isinstance(price, (int, float)) and isinstance(market_time, (int, float)) and market_time > 0


def _candidate_symbols(symbol: str) -> List[str]:
    s = symbol.strip().upper()
    if not s:
        return []
    if s.endswith(".KS") or s.endswith(".KQ"):
        base = s[:-3]
        alt = f"{base}.KQ" if s.endswith(".KS") else f"{base}.KS"
        return [s, alt, base]
    if s.isdigit() and len(s) == 6:
        return [s, f"{s}.KS", f"{s}.KQ"]
    return [s]


def _is_kr_symbol(symbol: str) -> bool:
    s = symbol.strip().upper()
    if not s:
        return False
    if s.startswith("KR:"):
        return True
    if s.endswith(".KS") or s.endswith(".KQ"):
        return True
    if s.isdigit() and len(s) == 6:
        return True
    return False


def _has_hangul(text: str) -> bool:
    return any("\uac00" <= ch <= "\ud7a3" for ch in text)


def _to_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.replace(",", "").strip()
        if not cleaned:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _find_value(node: Any, keys: List[str]) -> Any:
    if isinstance(node, dict):
        for key in keys:
            if key in node:
                return node[key]
        for value in node.values():
            found = _find_value(value, keys)
            if found is not None:
                return found
    elif isinstance(node, list):
        for item in node:
            found = _find_value(item, keys)
            if found is not None:
                return found
    return None


def _parse_db_quote(data: Dict[str, Any]) -> Tuple[float | None, float | None]:
    price_keys = ["Prpr", "prpr", "stck_prpr", "price", "current_price"]
    prev_keys = ["Sdpr", "sdpr", "stck_sdpr", "prev_price", "previous_close"]
    price = _to_float(_find_value(data, price_keys))
    prev = _to_float(_find_value(data, prev_keys))
    return price, prev


def _db_market_candidates(symbol: str) -> List[str]:
    s = symbol.strip().upper()
    if s.endswith(".KQ"):
        return ["Q", "J"]
    if s.endswith(".KS"):
        return ["J", "Q"]
    return ["J", "Q"]


async def _get_db_token(client: httpx.AsyncClient) -> str:
    app_key, app_secret = _get_db_credentials()
    if not app_key or not app_secret:
        return ""

    now = time.time()
    if _db_token["access_token"] and _db_token["expires_at"] > now:
        return _db_token["access_token"]

    async with _db_token_lock:
        now = time.time()
        if _db_token["access_token"] and _db_token["expires_at"] > now:
            return _db_token["access_token"]

        payload = {
            "grant_type": "client_credentials",
            "scope": "all",
            "client_id": app_key,
            "client_secret": app_secret,
        }
        try:
            resp = await client.post(DBSEC_TOKEN_URL, data=payload, timeout=10.0)
        except Exception as exc:
            print("[DBSEC TOKEN ERROR]", repr(exc))
            return ""
        if resp.status_code != 200:
            print("[DBSEC TOKEN HTTP ERROR]", resp.status_code, resp.text[:500])
            return ""
        try:
            data = resp.json()
        except Exception as exc:
            print("[DBSEC TOKEN JSON ERROR]", repr(exc))
            return ""
        access_token = data.get("access_token") or data.get("accessToken") or ""
        expires_in = _to_float(data.get("expires_in") or data.get("expiresIn") or 0) or 0
        if not access_token:
            print("[DBSEC TOKEN MISSING]", data)
            return ""
        if expires_in <= 0:
            expires_in = 23 * 60 * 60
        _db_token["access_token"] = access_token
        _db_token["expires_at"] = time.time() + float(expires_in) - 30
        return access_token


async def _fetch_quote(
    client: httpx.AsyncClient, symbol: str, token: str, sem: asyncio.Semaphore
) -> Dict[str, Any]:
    async with sem:
        candidates = _candidate_symbols(symbol)
        for candidate in candidates:
            params = {"symbol": candidate, "token": token}
            try:
                resp = await client.get(f"{FINNHUB_BASE}/quote", params=params, timeout=10.0)
            except Exception as exc:
                print("[FINNHUB FETCH ERROR]", candidate, repr(exc))
                continue

            if resp.status_code != 200:
                body = resp.text[:500]
                print("[FINNHUB HTTP ERROR]", resp.status_code, candidate, body)
                continue

            try:
                data = resp.json()
            except Exception as exc:
                print("[FINNHUB JSON ERROR]", candidate, repr(exc))
                continue

            if candidate.endswith(".KS") or candidate.endswith(".KQ"):
                print("[FINNHUB RAW]", candidate, data)

            if not _is_valid_quote(data):
                print("[FINNHUB BAD QUOTE]", candidate, data)
                continue

            return {
                "symbol": symbol,
                "price": float(data["c"]),
                "change": float(data["d"]) if isinstance(data.get("d"), (int, float)) else None,
                "changePercent": float(data["dp"]) if isinstance(data.get("dp"), (int, float)) else None,
                "currency": None,
                "marketTime": _iso_time(float(data["t"])),
                "source": "finnhub",
            }

        return _empty_quote(symbol)


async def _fetch_db_quote(
    client: httpx.AsyncClient,
    symbol: str,
    token: str,
    app_key: str,
    app_secret: str,
    sem: asyncio.Semaphore,
) -> Dict[str, Any]:
    async with sem:
        raw = symbol.strip().upper()
        code = raw
        if raw.startswith("KR:"):
            code = raw[3:]
        if code.endswith(".KS") or code.endswith(".KQ"):
            code = code[:-3]
        if not (code.isdigit() and len(code) == 6):
            return _empty_quote_with_source(symbol, "dbsec")

        isin = f"A{code}"
        for market_code in _db_market_candidates(raw):
            payload = {"In": {"InputCondMrktDivCode": market_code, "InputIscd1": isin}}
            headers = {
                "Authorization": f"Bearer {token}",
                "appkey": app_key,
                "appsecret": app_secret,
            }
            try:
                resp = await client.post(DBSEC_PRICE_URL, json=payload, headers=headers, timeout=10.0)
            except Exception as exc:
                print("[DBSEC QUOTE ERROR]", raw, repr(exc))
                continue
            if resp.status_code != 200:
                print("[DBSEC QUOTE HTTP ERROR]", resp.status_code, raw, resp.text[:500])
                continue
            try:
                data = resp.json()
            except Exception as exc:
                print("[DBSEC QUOTE JSON ERROR]", raw, repr(exc))
                continue

            price, prev = _parse_db_quote(data)
            if price is None:
                print("[DBSEC QUOTE MISSING PRICE]", raw, data)
                continue

            change = None
            change_percent = None
            if prev is not None and prev != 0:
                change = price - prev
                change_percent = (change / prev) * 100

            return {
                "symbol": symbol,
                "price": price,
                "change": change,
                "changePercent": change_percent,
                "currency": "KRW",
                "marketTime": _iso_time(time.time()),
                "source": "dbsec",
            }

        return _empty_quote_with_source(symbol, "dbsec")


def _parse_db_search(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    entries = _find_value(data, ["Out", "out", "Output", "output", "Output1", "output1"])
    if isinstance(entries, dict):
        nested = _find_value(entries, ["Output1", "output1", "Output", "output"])
        entries = nested if isinstance(nested, list) else []
    if not isinstance(entries, list):
        entries = []

    symbol_keys = ["Iscd", "IsuCd", "IsuSrtCd", "ShtnIscd", "StkCd", "StockCode", "Symbol"]
    name_keys = ["Isnm", "IsuNm", "Name", "KorNm", "KrName", "FullName"]

    for entry in entries:
        if not isinstance(entry, dict):
            continue
        symbol_value = _find_value(entry, symbol_keys)
        name_value = _find_value(entry, name_keys)
        symbol = str(symbol_value).strip() if symbol_value is not None else ""
        if symbol.startswith("A") and len(symbol) == 7 and symbol[1:].isdigit():
            symbol = symbol[1:]
        if symbol and symbol.isdigit() and len(symbol) == 6:
            results.append({"symbol": symbol, "name": str(name_value).strip() if name_value else None, "market": "KR"})

    return results

@app.get("/health")
async def health() -> Dict[str, Any]:
    token = _get_token()
    app_key, app_secret = _get_db_credentials()
    return {"ok": True, "tokenExists": bool(token), "dbSecConfigured": bool(app_key and app_secret)}


@app.get("/quotes")
async def get_quotes(symbols: str = Query("", description="Comma-separated symbols")) -> Dict[str, Any]:
    global _env_logged
    token = _get_token()
    if not _env_logged:
        _env_logged = True
        print("[FINNHUB ENV] tokenExists=", bool(token))
        app_key, app_secret = _get_db_credentials()
        print("[DBSEC ENV] configured=", bool(app_key and app_secret))

    raw_symbols = symbols.split(",") if symbols else []
    normalized = _normalize_symbols(raw_symbols)
    if not normalized:
        return {"quotes": []}

    key = _cache_key(normalized)
    now = time.time()
    cached = _cache.get(key)
    if cached and cached[0] > now:
        return {"quotes": cached[1]}

    kr_symbols = [symbol for symbol in normalized if _is_kr_symbol(symbol)]
    us_symbols = [symbol for symbol in normalized if not _is_kr_symbol(symbol)]

    app_key, app_secret = _get_db_credentials()
    if kr_symbols and not (app_key and app_secret):
        raise HTTPException(status_code=500, detail="DB Securities credentials not configured")
    if us_symbols and not token:
        raise HTTPException(status_code=500, detail="Finnhub API key not configured")

    sem = asyncio.Semaphore(_get_concurrency())
    ssl_verify = _get_ssl_verify()
    if not ssl_verify:
        print("[QUOTE SERVICE WARNING] SSL verification disabled")
    async with httpx.AsyncClient(headers={"Accept": "application/json"}, verify=ssl_verify) as client:
        tasks: List[asyncio.Task] = []
        for symbol in us_symbols:
            tasks.append(asyncio.create_task(_fetch_quote(client, symbol, token, sem)))

        if kr_symbols:
            db_token = await _get_db_token(client)
            if not db_token:
                raise HTTPException(status_code=500, detail="DB Securities token acquisition failed")
            for symbol in kr_symbols:
                tasks.append(
                    asyncio.create_task(
                        _fetch_db_quote(client, symbol, db_token, app_key, app_secret, sem)
                    )
                )

        fetched = await asyncio.gather(*tasks)
        quotes_by_symbol = {quote["symbol"].upper(): quote for quote in fetched}
        quotes = []
        for symbol in normalized:
            quote = quotes_by_symbol.get(symbol.upper())
            if quote is None:
                source = "dbsec" if _is_kr_symbol(symbol) else "finnhub"
                quote = _empty_quote_with_source(symbol, source)
            quotes.append(quote)

    _cache[key] = (now + _get_ttl_seconds(), quotes)
    return {"quotes": quotes}


@app.get("/search")
async def search_symbols(q: str = Query("", description="Search query")) -> Dict[str, Any]:
    query = q.strip()
    if not query:
        return {"results": []}

    cache_key = f"search:{query.upper()}"
    now = time.time()
    cached = _search_cache.get(cache_key)
    if cached and cached[0] > now:
        return {"results": cached[1]}

    is_kr = _is_kr_symbol(query) or _has_hangul(query)
    ssl_verify = _get_ssl_verify()
    async with httpx.AsyncClient(headers={"Accept": "application/json"}, verify=ssl_verify) as client:
        if is_kr:
            app_key, app_secret = _get_db_credentials()
            if not (app_key and app_secret):
                raise HTTPException(status_code=500, detail="DB Securities credentials not configured")
            db_token = await _get_db_token(client)
            if not db_token:
                raise HTTPException(status_code=500, detail="DB Securities token acquisition failed")

            payload = {"In": {"InputCondMrktDivCode": "J", "InputIscd1": query}}
            headers = {
                "Authorization": f"Bearer {db_token}",
                "appkey": app_key,
                "appsecret": app_secret,
            }
            try:
                resp = await client.post(DBSEC_TICKER_URL, json=payload, headers=headers, timeout=10.0)
            except Exception as exc:
                print("[DBSEC SEARCH ERROR]", repr(exc))
                raise HTTPException(status_code=502, detail="DB Securities search failed") from exc
            if resp.status_code != 200:
                print("[DBSEC SEARCH HTTP ERROR]", resp.status_code, resp.text[:500])
                raise HTTPException(status_code=502, detail="DB Securities search failed")
            try:
                data = resp.json()
            except Exception as exc:
                print("[DBSEC SEARCH JSON ERROR]", repr(exc))
                raise HTTPException(status_code=502, detail="DB Securities search failed") from exc

            results = _parse_db_search(data)
            if not results and query.isdigit() and len(query) == 6:
                results = [{"symbol": query, "name": None, "market": "KR"}]
        else:
            token = _get_token()
            if not token:
                raise HTTPException(status_code=500, detail="Finnhub API key not configured")
            try:
                resp = await client.get(
                    f"{FINNHUB_BASE}/search", params={"q": query, "token": token}, timeout=10.0
                )
            except Exception as exc:
                print("[FINNHUB SEARCH ERROR]", repr(exc))
                raise HTTPException(status_code=502, detail="Finnhub search failed") from exc
            if resp.status_code != 200:
                print("[FINNHUB SEARCH HTTP ERROR]", resp.status_code, resp.text[:500])
                raise HTTPException(status_code=502, detail="Finnhub search failed")
            try:
                data = resp.json()
            except Exception as exc:
                print("[FINNHUB SEARCH JSON ERROR]", repr(exc))
                raise HTTPException(status_code=502, detail="Finnhub search failed") from exc

            results = []
            for entry in data.get("result", [])[:20]:
                symbol = entry.get("symbol") or entry.get("displaySymbol") or ""
                name = entry.get("description") or entry.get("name")
                if symbol:
                    results.append({"symbol": symbol, "name": name, "market": "US"})

    _search_cache[cache_key] = (now + _get_ttl_seconds(), results)
    return {"results": results}
