import asyncio
import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Tuple

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query

load_dotenv()

app = FastAPI()

KIS_TOKEN_PATH = "/oauth2/tokenP"
KIS_PRICE_PATH = "/uapi/domestic-stock/v1/quotations/inquire-price"
KIS_TR_ID_PRICE = "FHKST01010100"
KIS_ETF_ETN_PRICE_PATH = (
    os.getenv("KIS_ETF_ETN_PRICE_PATH", "/uapi/domestic-etf/v1/quotations/inquire-price").strip()
)
KIS_TR_ID_ETF_ETN_PRICE = os.getenv("KIS_TR_ID_ETF_ETN_PRICE", "FHKST02400000").strip()
KIS_OVERSEAS_PRICE_PATH = "/uapi/overseas-price/v1/quotations/price"
KIS_TR_ID_OVERSEAS_PRICE = "HHDFS00000300"
KIS_DAILY_PRICE_PATH = (
    os.getenv("KIS_DAILY_PRICE_PATH", "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice")
    .strip()
)
KIS_TR_ID_DAILY_PRICE = os.getenv("KIS_TR_ID_DAILY_PRICE", "FHKST03010100").strip()
KIS_OVERSEAS_DAILY_PRICE_PATH = (
    os.getenv("KIS_OVERSEAS_DAILY_PRICE_PATH", "/uapi/overseas-price/v1/quotations/dailyprice").strip()
)
KIS_TR_ID_OVERSEAS_DAILY_PRICE = os.getenv("KIS_TR_ID_OVERSEAS_DAILY_PRICE", "HHDFS76240000").strip()
NAVER_FX_URL = (
    "https://m.search.naver.com/p/csearch/content/qapirender.nhn"
    "?key=calculator&pkid=141&q=%ED%99%98%EC%9C%A8&where=m&u1=keb&u6=standardUnit&u7=0&u3=USD&u4=KRW&u8=down&u2=1"
)

DEFAULT_TTL = 30
DEFAULT_CONCURRENCY = 6

_cache: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
_search_cache: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
_fx_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_fx_last_good: Dict[str, Dict[str, Any]] = {}
_env_logged = False
_kis_token: Dict[str, Any] = {"access_token": "", "expires_at": 0.0}
_kis_token_lock = asyncio.Lock()


def _get_kis_config() -> Tuple[str, str, str]:
    app_key = os.getenv("KIS_APP_KEY") or ""
    app_secret = os.getenv("KIS_APP_SECRET") or ""
    base_url = (os.getenv("KIS_BASE_URL") or "").strip().rstrip("/")
    return app_key, app_secret, base_url


def _get_default_excd() -> str:
    raw = (os.getenv("KIS_DEFAULT_EXCD") or "NAS").strip().upper()
    if not raw:
        return "NAS"
    return raw


def _get_ttl_seconds() -> int:
    raw = os.getenv("QUOTE_CACHE_TTL", str(DEFAULT_TTL))
    try:
        ttl = int(raw)
    except ValueError:
        ttl = DEFAULT_TTL
    return max(15, min(60, ttl))


def _get_fx_cache_ttl() -> int:
    raw = os.getenv("FX_CACHE_TTL", "").strip()
    if not raw:
        return _get_ttl_seconds()
    try:
        ttl = int(raw)
    except ValueError:
        ttl = _get_ttl_seconds()
    return max(15, min(60, ttl))


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
        "source": "kis",
        "name": None,
    }


def _empty_quote_with_source(symbol: str, source: str) -> Dict[str, Any]:
    empty = _empty_quote(symbol)
    empty["source"] = source
    if source == "kis":
        market, _, _ = _parse_symbol(symbol)
        empty["currency"] = "KRW" if market == "KR" else "USD"
    return empty


def _iso_time(epoch_seconds: float) -> str:
    return datetime.fromtimestamp(epoch_seconds, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _is_kr_symbol(symbol: str) -> bool:
    s = symbol.strip().upper()
    if not s:
        return False
    if s.startswith("KR:"):
        return True
    if s.endswith(".KS") or s.endswith(".KQ"):
        return True
    if re.fullmatch(r"\d{6}", s):
        return True
    if re.fullmatch(r"\d[0-9A-Z]{5}", s):
        return True
    if re.fullmatch(r"A\d{6}", s):
        return True
    return False


def _normalize_kr_code(symbol: str) -> str:
    raw = symbol.strip().upper()
    if raw.endswith(".KS") or raw.endswith(".KQ"):
        raw = raw[:-3]
    if re.fullmatch(r"A\d{6}", raw):
        return raw[1:]
    return raw


def _is_kr_stock_code(code: str) -> bool:
    return bool(re.fullmatch(r"\d{6}", code))


def _is_kr_etf_etn_short_code(code: str) -> bool:
    return bool(re.fullmatch(r"\d{4}[0-9A-Z]{2}", code) and re.search(r"[A-Z]", code))


def _parse_symbol(symbol: str) -> Tuple[str, str | None, str]:
    raw = symbol.strip().upper()
    if not raw:
        return "UNKNOWN", None, ""
    kr_code = _normalize_kr_code(raw)
    if _is_kr_stock_code(kr_code) or _is_kr_etf_etn_short_code(kr_code):
        return "KR", None, kr_code
    if ":" in raw:
        parts = raw.split(":", 1)
        excd = parts[0].strip().upper()
        symb = parts[1].strip().upper()
        return "US", excd, symb
    excd = _get_default_excd()
    return "US", excd, raw


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


def _normalize_date_key(value: Any) -> str | None:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    cleaned = re.sub(r"[^0-9]", "", raw)
    if len(cleaned) != 8:
        return None
    yyyy = cleaned[0:4]
    mm = cleaned[4:6]
    dd = cleaned[6:8]
    return f"{yyyy}-{mm}-{dd}"


def _to_ymd_compact(value: str) -> str:
    return value.replace("-", "")


def _resolve_history_range(start: str | None, end: str | None) -> Tuple[str, str]:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    end_key = _normalize_date_key(end) or today
    start_key = _normalize_date_key(start)
    if not start_key:
        end_dt = datetime.strptime(end_key, "%Y-%m-%d")
        start_key = (end_dt - timedelta(days=60)).strftime("%Y-%m-%d")
    if start_key > end_key:
        start_key, end_key = end_key, start_key
    return start_key, end_key


def _extract_history_points(
    payload: Dict[str, Any],
    *,
    date_keys: List[str],
    close_keys: List[str],
    start_date: str,
    end_date: str,
) -> List[Dict[str, Any]]:
    candidates: List[Dict[str, Any]] = []
    for key in ("output2", "output", "prices", "data", "items", "results"):
        value = payload.get(key)
        if isinstance(value, list):
            candidates.extend([row for row in value if isinstance(row, dict)])
    if not candidates:
        candidates = [payload] if isinstance(payload, dict) else []

    parsed: List[Dict[str, Any]] = []
    for row in candidates:
        date_value = _find_value(row, date_keys)
        close_value = _find_value(row, close_keys)
        date_key = _normalize_date_key(date_value)
        close = _to_float(close_value)
        if not date_key or close is None:
            continue
        if date_key < start_date or date_key > end_date:
            continue
        parsed.append({"date": date_key, "close": float(close)})

    by_date: Dict[str, Dict[str, Any]] = {point["date"]: point for point in parsed}
    return [by_date[key] for key in sorted(by_date.keys())]


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


def _parse_kis_quote(
    data: Dict[str, Any],
) -> Tuple[float | None, float | None, float | None, str | None]:
    price_keys = ["stck_prpr", "prpr", "price", "current_price"]
    change_keys = ["prdy_vrss", "change", "price_change"]
    change_percent_keys = ["prdy_ctrt", "change_percent", "change_rate"]
    name_keys = ["hts_kor_isnm", "prdt_name", "stck_name", "name", "isu_nm"]
    price = _to_float(_find_value(data, price_keys))
    change = _to_float(_find_value(data, change_keys))
    change_percent = _to_float(_find_value(data, change_percent_keys))
    name_value = _find_value(data, name_keys)
    name = str(name_value).strip() if isinstance(name_value, str) and name_value.strip() else None
    return price, change, change_percent, name


def _parse_kis_overseas_quote(
    data: Dict[str, Any],
) -> Tuple[float | None, float | None, float | None, str | None]:
    price_keys = ["last", "last_price", "last_prpr", "price", "current_price"]
    change_keys = ["diff", "change", "prdy_vrss", "price_change"]
    change_percent_keys = ["rate", "change_rate", "prdy_ctrt", "change_percent"]
    name_keys = ["name", "kor_name", "eng_name", "prdt_name", "hts_kor_isnm"]
    currency_keys = ["ccy_code", "currency", "currency_code", "curr_cd"]
    price = _to_float(_find_value(data, price_keys))
    change = _to_float(_find_value(data, change_keys))
    change_percent = _to_float(_find_value(data, change_percent_keys))
    name_value = _find_value(data, name_keys)
    currency_value = _find_value(data, currency_keys)
    name = str(name_value).strip() if isinstance(name_value, str) and name_value.strip() else None
    currency = (
        str(currency_value).strip().upper()
        if isinstance(currency_value, str) and currency_value.strip()
        else None
    )
    return price, change, change_percent, currency or None


def _strip_tags(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html)


def _parse_naver_fx(body: str) -> Tuple[float | None, float | None, float | None, int]:
    plain = _strip_tags(body)
    rate_regex = re.compile(r"([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]+)?)")
    percent_regex = re.compile(r"([+-]?\\d+(?:\\.\\d+)?)\\s*%")
    change_regex = re.compile(r"([+-]?\\d+(?:\\.\\d+)?)(?=\\s*원)")

    matches = list(rate_regex.finditer(plain))
    candidates: List[Tuple[float, int]] = []
    for match in matches:
        value = _to_float(match.group(1))
        if value is None:
            continue
        candidates.append((value, match.start()))

    candidate_count = len(candidates)
    if not candidates:
        return None, None, None, candidate_count

    anchors = ["USD", "KRW", "원", "매매기준율", "전일대비"]
    scored: List[Tuple[int, float]] = []
    for value, pos in candidates:
        score = 0
        if 500 <= value <= 5000:
            score += 3
        window_start = max(0, pos - 80)
        window_end = min(len(plain), pos + 80)
        window = plain[window_start:window_end]
        for anchor in anchors:
            if anchor in window:
                score += 2
        scored.append((score, value))

    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
    rate = scored[0][1] if scored else None

    change_percent = None
    percent_match = percent_regex.search(plain)
    if percent_match:
        change_percent = _to_float(percent_match.group(1))

    change = None
    change_match = change_regex.search(plain)
    if change_match:
        change = _to_float(change_match.group(1))

    return rate, change, change_percent, candidate_count


def _kis_market_candidates(symbol: str) -> List[str]:
    s = symbol.strip().upper()
    if s.endswith(".KQ"):
        return ["Q", "J"]
    if s.endswith(".KS"):
        return ["J", "Q"]
    return ["J", "Q"]


def _extract_error_summary(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    for key in ("return_msg", "msg", "message", "error_description", "msg_cd", "error_code"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


async def _get_kis_token(client: httpx.AsyncClient) -> str:
    app_key, app_secret, base_url = _get_kis_config()
    if not app_key or not app_secret or not base_url:
        return ""

    now = time.time()
    if _kis_token["access_token"] and _kis_token["expires_at"] > now:
        return _kis_token["access_token"]

    async with _kis_token_lock:
        now = time.time()
        if _kis_token["access_token"] and _kis_token["expires_at"] > now:
            return _kis_token["access_token"]

        payload = {
            "grant_type": "client_credentials",
            "appkey": app_key,
            "appsecret": app_secret,
        }
        headers = {"content-type": "application/json"}
        try:
            resp = await client.post(f"{base_url}{KIS_TOKEN_PATH}", json=payload, headers=headers, timeout=10.0)
        except Exception as exc:
            print("[KIS TOKEN ERROR]", repr(exc))
            return ""
        if resp.status_code != 200:
            summary = ""
            try:
                summary = _extract_error_summary(resp.json())
            except Exception:
                summary = ""
            detail = f" message={summary}" if summary else ""
            print("[KIS TOKEN HTTP ERROR]", resp.status_code, detail)
            return ""
        try:
            data = resp.json()
        except Exception as exc:
            print("[KIS TOKEN JSON ERROR]", repr(exc))
            return ""
        access_token = data.get("access_token") or data.get("accessToken") or ""
        expires_in = _to_float(data.get("expires_in") or data.get("expiresIn") or 0) or 0
        if not access_token:
            print("[KIS TOKEN MISSING] keys=", ",".join(sorted(data.keys())))
            return ""
        if expires_in <= 0:
            expires_in = 23 * 60 * 60
        _kis_token["access_token"] = access_token
        _kis_token["expires_at"] = time.time() + float(expires_in) - 30
        return access_token


async def _invalidate_kis_token() -> None:
    async with _kis_token_lock:
        _kis_token["access_token"] = ""
        _kis_token["expires_at"] = 0.0


async def _fetch_kis_quote(
    client: httpx.AsyncClient,
    symbol: str,
    token: str,
    app_key: str,
    app_secret: str,
    base_url: str,
    sem: asyncio.Semaphore,
) -> Dict[str, Any]:
    async with sem:
        market, excd, code = _parse_symbol(symbol)
        if market != "KR":
            return _empty_quote_with_source(symbol, "kis")

        if _is_kr_etf_etn_short_code(code):
            print(f"[KIS ROUTE] symbol={symbol} route=KR_ETF_ETN code={code}")
            endpoint_attempts = [
                (KIS_ETF_ETN_PRICE_PATH, KIS_TR_ID_ETF_ETN_PRICE),
                (KIS_PRICE_PATH, KIS_TR_ID_PRICE),
            ]
            for path, tr_id in endpoint_attempts:
                params_list = [
                    {"fid_cond_mrkt_div_code": "J", "fid_input_iscd": code},
                    {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": code},
                    {"fid_cond_mrkt_div_code": "Q", "fid_input_iscd": code},
                ]
                for params in params_list:
                    headers = {
                        "Authorization": f"Bearer {token}",
                        "appkey": app_key,
                        "appsecret": app_secret,
                        "tr_id": tr_id,
                        "content-type": "application/json",
                    }
                    url = f"{base_url}{path}"
                    try:
                        resp = await client.get(url, params=params, headers=headers, timeout=10.0)
                    except Exception as exc:
                        print(
                            f"[KIS ETF_ETN ERROR] symbol={symbol} path={path} tr_id={tr_id} params={params} err={repr(exc)}"
                        )
                        continue

                    key_fields = ""
                    data: Dict[str, Any] = {}
                    if resp.status_code == 200:
                        try:
                            data = resp.json()
                            price, change, change_percent, name = _parse_kis_quote(data)
                            key_fields = f"price={price} change={change} pct={change_percent}"
                        except Exception as exc:
                            print(
                                f"[KIS ETF_ETN JSON ERROR] symbol={symbol} path={path} tr_id={tr_id} params={params} err={repr(exc)}"
                            )
                            continue
                    print(
                        f"[KIS ETF_ETN REQ] symbol={symbol} path={path} tr_id={tr_id} params={params} status={resp.status_code} {key_fields}"
                    )
                    if resp.status_code != 200:
                        continue

                    price, change, change_percent, name = _parse_kis_quote(data)
                    if price is None:
                        continue
                    return {
                        "symbol": symbol,
                        "price": float(price),
                        "change": change,
                        "changePercent": change_percent,
                        "currency": "KRW",
                        "marketTime": _iso_time(time.time()),
                        "source": "kis",
                        "name": name,
                    }

            print(
                f"[KIS ETF_ETN FAIL] symbol={symbol} endpoint={KIS_ETF_ETN_PRICE_PATH} tr_id={KIS_TR_ID_ETF_ETN_PRICE} code={code}"
            )
            return _empty_quote_with_source(symbol, "kis")

        for market_code in _kis_market_candidates(code):
            params = {"fid_cond_mrkt_div_code": market_code, "fid_input_iscd": code}
            headers = {
                "Authorization": f"Bearer {token}",
                "appkey": app_key,
                "appsecret": app_secret,
                "tr_id": KIS_TR_ID_PRICE,
                "content-type": "application/json",
            }
            try:
                resp = await client.get(
                    f"{base_url}{KIS_PRICE_PATH}", params=params, headers=headers, timeout=10.0
                )
            except Exception as exc:
                print("[KIS QUOTE ERROR]", symbol, repr(exc))
                continue
            if resp.status_code != 200:
                print(
                    f"[KIS STOCK REQ] symbol={symbol} path={KIS_PRICE_PATH} tr_id={KIS_TR_ID_PRICE} params={params} status={resp.status_code} body={resp.text[:120]}"
                )
                continue
            try:
                data = resp.json()
            except Exception as exc:
                print("[KIS QUOTE JSON ERROR]", symbol, repr(exc))
                continue

            price, change, change_percent, name = _parse_kis_quote(data)
            print(
                f"[KIS STOCK REQ] symbol={symbol} path={KIS_PRICE_PATH} tr_id={KIS_TR_ID_PRICE} params={params} status=200 price={price} change={change} pct={change_percent}"
            )
            if price is None:
                print("[KIS QUOTE MISSING PRICE]", symbol, "keys=", ",".join(sorted(data.keys())))
                continue

            return {
                "symbol": symbol,
                "price": price,
                "change": change,
                "changePercent": change_percent,
                "currency": "KRW",
                "marketTime": _iso_time(time.time()),
                "source": "kis",
                "name": name,
            }

        return _empty_quote_with_source(symbol, "kis")


async def _fetch_kis_overseas_quote(
    client: httpx.AsyncClient,
    symbol: str,
    token: str,
    app_key: str,
    app_secret: str,
    base_url: str,
    sem: asyncio.Semaphore,
) -> Dict[str, Any]:
    async with sem:
        market, excd, symb = _parse_symbol(symbol)
        if market != "US" or not excd or not symb:
            return _empty_quote_with_source(symbol, "kis")

        params = {"AUTH": "", "EXCD": excd, "SYMB": symb}

        async def _request_overseas(access_token: str) -> httpx.Response:
            headers = {
                "Authorization": f"Bearer {access_token}",
                "appkey": app_key,
                "appsecret": app_secret,
                "tr_id": KIS_TR_ID_OVERSEAS_PRICE,
                "content-type": "application/json",
            }
            return await client.get(
                f"{base_url}{KIS_OVERSEAS_PRICE_PATH}", params=params, headers=headers, timeout=10.0
            )

        try:
            resp = await _request_overseas(token)
        except Exception as exc:
            print("[KIS OVERSEAS QUOTE ERROR]", symbol, repr(exc))
            return _empty_quote_with_source(symbol, "kis")
        if resp.status_code in (401, 403):
            await _invalidate_kis_token()
            refreshed = await _get_kis_token(client)
            if refreshed:
                try:
                    resp = await _request_overseas(refreshed)
                except Exception as exc:
                    print("[KIS OVERSEAS QUOTE RETRY ERROR]", symbol, repr(exc))
                    return _empty_quote_with_source(symbol, "kis")
        if resp.status_code != 200:
            print("[KIS OVERSEAS QUOTE HTTP ERROR]", resp.status_code, symbol, resp.text[:200])
            return _empty_quote_with_source(symbol, "kis")
        try:
            data = resp.json()
        except Exception as exc:
            print("[KIS OVERSEAS QUOTE JSON ERROR]", symbol, repr(exc))
            return _empty_quote_with_source(symbol, "kis")

        price, change, change_percent, currency = _parse_kis_overseas_quote(data)
        if price is None or price <= 0:
            print("[KIS OVERSEAS QUOTE MISSING PRICE]", symbol, "keys=", ",".join(sorted(data.keys())))
            return _empty_quote_with_source(symbol, "kis")

        return {
            "symbol": symbol,
            "price": price,
            "change": change,
            "changePercent": change_percent,
            "currency": currency or "USD",
            "marketTime": _iso_time(time.time()),
            "source": "kis",
            "name": None,
        }


async def _fetch_kis_daily_history_kr(
    client: httpx.AsyncClient,
    symbol: str,
    token: str,
    app_key: str,
    app_secret: str,
    base_url: str,
    start_date: str,
    end_date: str,
    sem: asyncio.Semaphore,
) -> Dict[str, Any]:
    async with sem:
        market, _, code = _parse_symbol(symbol)
        if market != "KR":
            return {"symbol": symbol, "points": [], "source": "kis", "warning": "invalid-market"}

        ymd_start = _to_ymd_compact(start_date)
        ymd_end = _to_ymd_compact(end_date)
        endpoint_attempts = [("J", KIS_DAILY_PRICE_PATH), ("Q", KIS_DAILY_PRICE_PATH)]

        for market_code, path in endpoint_attempts:
            params = {
                "FID_COND_MRKT_DIV_CODE": market_code,
                "FID_INPUT_ISCD": code,
                "FID_INPUT_DATE_1": ymd_start,
                "FID_INPUT_DATE_2": ymd_end,
                "FID_PERIOD_DIV_CODE": "D",
                "FID_ORG_ADJ_PRC": "1",
            }
            headers = {
                "Authorization": f"Bearer {token}",
                "appkey": app_key,
                "appsecret": app_secret,
                "tr_id": KIS_TR_ID_DAILY_PRICE,
                "content-type": "application/json",
            }
            try:
                resp = await client.get(f"{base_url}{path}", params=params, headers=headers, timeout=12.0)
            except Exception as exc:
                print("[KIS DAILY KR ERROR]", symbol, repr(exc))
                continue
            if resp.status_code != 200:
                print(
                    f"[KIS DAILY KR REQ] symbol={symbol} path={path} tr_id={KIS_TR_ID_DAILY_PRICE} params={params} status={resp.status_code}"
                )
                continue
            try:
                data = resp.json()
            except Exception as exc:
                print("[KIS DAILY KR JSON ERROR]", symbol, repr(exc))
                continue

            points = _extract_history_points(
                data,
                date_keys=["stck_bsop_date", "bsop_date", "date", "trd_dd", "bas_dt"],
                close_keys=["stck_clpr", "clpr", "close", "last", "stck_prpr"],
                start_date=start_date,
                end_date=end_date,
            )
            if points:
                return {"symbol": symbol, "points": points, "source": "kis"}

        return {"symbol": symbol, "points": [], "source": "kis", "warning": "no-history"}


async def _fetch_kis_daily_history_us(
    client: httpx.AsyncClient,
    symbol: str,
    token: str,
    app_key: str,
    app_secret: str,
    base_url: str,
    start_date: str,
    end_date: str,
    sem: asyncio.Semaphore,
) -> Dict[str, Any]:
    async with sem:
        market, excd, symb = _parse_symbol(symbol)
        if market != "US" or not excd or not symb:
            return {"symbol": symbol, "points": [], "source": "kis", "warning": "invalid-market"}

        params = {
            "AUTH": "",
            "EXCD": excd,
            "SYMB": symb,
            "GUBN": "0",
            "BYMD": _to_ymd_compact(end_date),
            "MODP": "0",
        }

        async def _request_history(access_token: str) -> httpx.Response:
            headers = {
                "Authorization": f"Bearer {access_token}",
                "appkey": app_key,
                "appsecret": app_secret,
                "tr_id": KIS_TR_ID_OVERSEAS_DAILY_PRICE,
                "content-type": "application/json",
            }
            return await client.get(
                f"{base_url}{KIS_OVERSEAS_DAILY_PRICE_PATH}", params=params, headers=headers, timeout=12.0
            )

        try:
            resp = await _request_history(token)
        except Exception as exc:
            print("[KIS DAILY US ERROR]", symbol, repr(exc))
            return {"symbol": symbol, "points": [], "source": "kis", "warning": "request-failed"}

        if resp.status_code in (401, 403):
            await _invalidate_kis_token()
            refreshed = await _get_kis_token(client)
            if refreshed:
                try:
                    resp = await _request_history(refreshed)
                except Exception as exc:
                    print("[KIS DAILY US RETRY ERROR]", symbol, repr(exc))
                    return {"symbol": symbol, "points": [], "source": "kis", "warning": "request-failed"}

        if resp.status_code != 200:
            print("[KIS DAILY US HTTP ERROR]", symbol, resp.status_code, resp.text[:200])
            return {"symbol": symbol, "points": [], "source": "kis", "warning": "http-error"}

        try:
            data = resp.json()
        except Exception as exc:
            print("[KIS DAILY US JSON ERROR]", symbol, repr(exc))
            return {"symbol": symbol, "points": [], "source": "kis", "warning": "json-error"}

        points = _extract_history_points(
            data,
            date_keys=["xymd", "date", "trd_dd", "bas_dt", "stck_bsop_date"],
            close_keys=["clos", "last", "ovrs_nmix_prpr", "ovrs_clpr", "close", "stck_clpr"],
            start_date=start_date,
            end_date=end_date,
        )
        if not points:
            return {"symbol": symbol, "points": [], "source": "kis", "warning": "no-history"}
        return {"symbol": symbol, "points": points, "source": "kis"}


async def _get_usd_krw_rate(client: httpx.AsyncClient) -> Dict[str, Any]:
    pair = "USD/KRW"
    now = time.time()
    cached = _fx_cache.get(pair)
    if cached and cached[0] > now:
        return cached[1]

    url = NAVER_FX_URL
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1"
        ),
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        "Referer": "https://m.search.naver.com/",
    }
    print("[FX NAVER REQ]", f"url={url}")
    try:
        resp = await client.get(url, headers=headers, timeout=10.0)
    except Exception as exc:
        print("[FX NAVER ERROR]", repr(exc))
        last_good = _fx_last_good.get(pair)
        if last_good:
            return {**last_good, "error": "FX request failed"}
        return {"pair": pair, "rate": None, "change": None, "changePercent": None, "ts": None, "source": "naver", "error": "FX request failed"}

    print("[FX NAVER RES]", "status=", resp.status_code, "bodyLength=", len(resp.text))
    if resp.status_code != 200:
        last_good = _fx_last_good.get(pair)
        if last_good:
            return {**last_good, "error": f"FX http {resp.status_code}"}
        return {"pair": pair, "rate": None, "change": None, "changePercent": None, "ts": None, "source": "naver", "error": f"FX http {resp.status_code}"}

    body = resp.text or ""
    rate, change, change_percent, candidate_count = _parse_naver_fx(body)
    print("[FX NAVER PARSE]", "rate=", rate, "candidates=", candidate_count)
    if rate is None or not (500 <= rate <= 5000):
        last_good = _fx_last_good.get(pair)
        if last_good:
            return {**last_good, "error": "FX rate missing"}
        return {"pair": pair, "rate": None, "change": None, "changePercent": None, "ts": None, "source": "naver", "error": "FX rate missing"}

    ttl = _get_fx_cache_ttl()
    result = {
        "pair": pair,
        "rate": rate,
        "change": change,
        "changePercent": change_percent,
        "ts": now,
        "source": "naver",
    }
    _fx_cache[pair] = (now + ttl, result)
    _fx_last_good[pair] = result
    return result


@app.get("/health")
async def health() -> Dict[str, Any]:
    app_key, app_secret, base_url = _get_kis_config()
    return {
        "ok": True,
        "kisConfigured": bool(app_key and app_secret),
        "kisBaseUrlSet": bool(base_url),
    }


@app.get("/fx")
async def get_fx(pair: str = Query("USD/KRW", description="Currency pair, e.g. USD/KRW")) -> Dict[str, Any]:
    normalized = pair.strip().upper()
    if normalized != "USD/KRW":
        raise HTTPException(status_code=400, detail="Unsupported pair")
    ssl_verify = _get_ssl_verify()
    async with httpx.AsyncClient(headers={"Accept": "application/json"}, verify=ssl_verify) as client:
        result = await _get_usd_krw_rate(client)
    return {"fx": result}


@app.get("/quotes")
async def get_quotes(symbols: str = Query("", description="Comma-separated symbols")) -> Dict[str, Any]:
    global _env_logged
    if not _env_logged:
        _env_logged = True
        app_key, app_secret, base_url = _get_kis_config()
        print("[KIS ENV] configured=", bool(app_key and app_secret), "baseUrlSet=", bool(base_url))

    raw_symbols = symbols.split(",") if symbols else []
    normalized = _normalize_symbols(raw_symbols)
    if not normalized:
        return {"quotes": []}

    key = _cache_key(normalized)
    now = time.time()
    cached = _cache.get(key)
    if cached and cached[0] > now:
        return {"quotes": cached[1]}

    fx_symbols = [symbol for symbol in normalized if symbol.strip().upper() == "USD/KRW"]
    kr_symbols = [symbol for symbol in normalized if _parse_symbol(symbol)[0] == "KR"]
    us_symbols = [
        symbol
        for symbol in normalized
        if _parse_symbol(symbol)[0] == "US" and symbol.strip().upper() != "USD/KRW"
    ]

    app_key, app_secret, base_url = _get_kis_config()
    if (kr_symbols or us_symbols) and not (app_key and app_secret and base_url):
        raise HTTPException(status_code=500, detail="KIS credentials not configured")

    sem = asyncio.Semaphore(_get_concurrency())
    ssl_verify = _get_ssl_verify()
    if not ssl_verify:
        print("[QUOTE SERVICE WARNING] SSL verification disabled")
    async with httpx.AsyncClient(headers={"Accept": "application/json"}, verify=ssl_verify) as client:
        tasks: List[asyncio.Task] = []

        kis_token = await _get_kis_token(client)
        if not kis_token:
            raise HTTPException(status_code=500, detail="KIS token acquisition failed")

        for symbol in kr_symbols:
            tasks.append(
                asyncio.create_task(
                    _fetch_kis_quote(
                        client, symbol, kis_token, app_key, app_secret, base_url, sem
                    )
                )
            )

        for symbol in us_symbols:
            tasks.append(
                asyncio.create_task(
                    _fetch_kis_overseas_quote(
                        client, symbol, kis_token, app_key, app_secret, base_url, sem
                    )
                )
            )

        if fx_symbols:
            fx_result = await _get_usd_krw_rate(client)
            for symbol in fx_symbols:
                tasks.append(
                    asyncio.create_task(
                        asyncio.sleep(0, result={
                            "symbol": symbol,
                            "price": fx_result.get("rate"),
                            "change": fx_result.get("change"),
                            "changePercent": fx_result.get("changePercent"),
                            "currency": "KRW",
                            "marketTime": _iso_time(time.time()) if fx_result.get("rate") else None,
                            "source": fx_result.get("source") or "naver",
                            "name": None,
                        })
                    )
                )

        fetched = await asyncio.gather(*tasks)
        quotes_by_symbol = {quote["symbol"].upper(): quote for quote in fetched}
        quotes = []
        for symbol in normalized:
            quote = quotes_by_symbol.get(symbol.upper())
            if quote is None:
                quote = _empty_quote_with_source(symbol, "kis")
            quotes.append(quote)

    _cache[key] = (now + _get_ttl_seconds(), quotes)
    return {"quotes": quotes}


@app.get("/history")
async def get_history(
    symbols: str = Query("", description="Comma-separated symbols"),
    start: str = Query("", description="Start date YYYY-MM-DD"),
    end: str = Query("", description="End date YYYY-MM-DD"),
) -> Dict[str, Any]:
    raw_symbols = symbols.split(",") if symbols else []
    normalized = _normalize_symbols(raw_symbols)
    if not normalized:
        return {"series": [], "start": None, "end": None, "asOf": _iso_time(time.time())}

    start_date, end_date = _resolve_history_range(start, end)
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="Invalid date range")

    kr_symbols = [symbol for symbol in normalized if _parse_symbol(symbol)[0] == "KR"]
    us_symbols = [symbol for symbol in normalized if _parse_symbol(symbol)[0] == "US"]

    app_key, app_secret, base_url = _get_kis_config()
    if (kr_symbols or us_symbols) and not (app_key and app_secret and base_url):
        raise HTTPException(status_code=500, detail="KIS credentials not configured")

    sem = asyncio.Semaphore(_get_concurrency())
    ssl_verify = _get_ssl_verify()
    if not ssl_verify:
        print("[HISTORY SERVICE WARNING] SSL verification disabled")

    async with httpx.AsyncClient(headers={"Accept": "application/json"}, verify=ssl_verify) as client:
        token = await _get_kis_token(client)
        if not token:
            raise HTTPException(status_code=500, detail="KIS token acquisition failed")

        tasks: List[asyncio.Task] = []
        for symbol in kr_symbols:
            tasks.append(
                asyncio.create_task(
                    _fetch_kis_daily_history_kr(
                        client, symbol, token, app_key, app_secret, base_url, start_date, end_date, sem
                    )
                )
            )
        for symbol in us_symbols:
            tasks.append(
                asyncio.create_task(
                    _fetch_kis_daily_history_us(
                        client, symbol, token, app_key, app_secret, base_url, start_date, end_date, sem
                    )
                )
            )

        fetched = await asyncio.gather(*tasks)
        by_symbol = {item["symbol"].upper(): item for item in fetched}
        ordered = []
        for symbol in normalized:
            ordered.append(by_symbol.get(symbol.upper()) or {"symbol": symbol, "points": [], "source": "kis", "warning": "not-found"})

    return {
        "start": start_date,
        "end": end_date,
        "asOf": _iso_time(time.time()),
        "series": ordered,
    }


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
            results = []
            normalized_kr = _normalize_kr_code(query)
            if _is_kr_stock_code(normalized_kr) or _is_kr_etf_etn_short_code(normalized_kr):
                results = [{"symbol": normalized_kr, "name": None, "market": "KR"}]
        else:
            results = []
            if query:
                excd = _get_default_excd()
                results = [{"symbol": f"{excd}:{query.upper()}", "name": None, "market": "US"}]

    _search_cache[cache_key] = (now + _get_ttl_seconds(), results)
    return {"results": results}
