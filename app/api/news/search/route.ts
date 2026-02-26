import { NextResponse } from "next/server";
import https from "node:https";

export const runtime = "nodejs";

type NaverNewsItem = {
  title?: string;
  originallink?: string;
  link?: string;
  description?: string;
  pubDate?: string;
};

type NormalizedCandidate = {
  id: string;
  title: string;
  snippet: string;
  originallink: string;
  link: string;
  pubDate: string;
  source: string;
};

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_name",
  "utm_cid",
  "utm_reader",
  "utm_referrer",
  "utm_viz_id",
  "gclid",
  "fbclid",
  "igshid",
  "mc_cid",
  "mc_eid"
]);

async function fetchNaverWithHttps(url: URL, headers: Record<string, string>, rejectUnauthorized: boolean) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        headers,
        rejectUnauthorized,
        timeout: 10_000
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    req.end();
  });
}

function extractErrorDetail(error: unknown) {
  if (error instanceof Error) {
    const anyErr = error as Error & { cause?: unknown };
    const cause =
      anyErr.cause && typeof anyErr.cause === "object"
        ? anyErr.cause as { code?: string; errno?: number | string; message?: string }
        : null;
    const causeParts = [
      cause?.code ? `code=${cause.code}` : "",
      cause?.errno !== undefined ? `errno=${String(cause.errno)}` : "",
      cause?.message ? `cause=${cause.message}` : ""
    ].filter(Boolean);
    return causeParts.length ? `${error.message} (${causeParts.join(", ")})` : error.message;
  }
  return String(error);
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, "");
}

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&#39;": "'",
    "&nbsp;": " "
  };
  const withNamed = value.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => named[m] ?? m);
  return withNamed.replace(/&#(\d+);/g, (_, code) => {
    const num = Number(code);
    return Number.isFinite(num) ? String.fromCharCode(num) : "";
  });
}

function sanitizeText(value: string) {
  return decodeHtml(stripTags(value)).replace(/\s+/g, " ").trim();
}

function parseSource(urlRaw: string) {
  try {
    const host = new URL(urlRaw).hostname;
    return host.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function normalizeArticleUrl(urlRaw: string) {
  const raw = urlRaw.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const nextParams = new URLSearchParams();
    url.searchParams.forEach((value, key) => {
      if (TRACKING_PARAMS.has(key.toLowerCase())) return;
      nextParams.append(key, value);
    });
    const search = nextParams.toString();
    url.search = search ? `?${search}` : "";
    url.hash = "";
    return url.toString();
  } catch {
    return raw;
  }
}

function dedupeByExactLinks(items: NormalizedCandidate[]) {
  const seenOrigin = new Set<string>();
  const seenLink = new Set<string>();
  return items.filter((item) => {
    const normalizedOrigin = normalizeArticleUrl(item.originallink);
    const normalizedLink = normalizeArticleUrl(item.link);
    if (normalizedOrigin && seenOrigin.has(normalizedOrigin)) return false;
    if (normalizedLink && seenLink.has(normalizedLink)) return false;
    if (normalizedOrigin) seenOrigin.add(normalizedOrigin);
    if (normalizedLink) seenLink.add(normalizedLink);
    return true;
  });
}

function toIsoDate(pubDateRaw: string) {
  const dt = new Date(pubDateRaw);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString();
}

function hashString(value: string) {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) {
    h = (h * 33) ^ value.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

function buildStableId(link: string, title: string, pubDate: string) {
  const base = link.trim() || `${title.trim()}|${pubDate.trim()}`;
  return `news_${hashString(base)}`;
}

function parseYmdStart(value: string | null) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const dt = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseYmdEnd(value: string | null) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const dt = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = (searchParams.get("q") ?? "").trim();
  const displayRaw = Number(searchParams.get("display") ?? 12);
  const startRaw = Number(searchParams.get("start") ?? 1);
  const sortRaw = (searchParams.get("sort") ?? "date").trim().toLowerCase();
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");

  if (!keyword) {
    return NextResponse.json({ keyword: "", total: 0, items: [] });
  }

  const clientId = process.env.NAVER_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_CLIENT_SECRET?.trim();
  const allowInsecureTls = ["1", "true", "yes"].includes((process.env.NAVER_ALLOW_INSECURE_TLS ?? "").trim().toLowerCase());
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "missing-naver-credentials", message: "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET not configured." },
      { status: 500 }
    );
  }

  const display = Math.max(1, Math.min(100, Number.isFinite(displayRaw) ? Math.round(displayRaw) : 12));
  const start = Math.max(1, Number.isFinite(startRaw) ? Math.round(startRaw) : 1);
  const sort = sortRaw === "sim" ? "sim" : "date";
  const fromDate = parseYmdStart(fromRaw);
  const toDate = parseYmdEnd(toRaw);

  const upstream = new URL("https://openapi.naver.com/v1/search/news.json");
  upstream.searchParams.set("query", keyword);
  upstream.searchParams.set("display", String(display));
  upstream.searchParams.set("start", String(start));
  upstream.searchParams.set("sort", sort);

  try {
    const headers = {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret
    };
    let status = 0;
    let rawBody = "";
    if (allowInsecureTls) {
      const result = await fetchNaverWithHttps(upstream, headers, false);
      status = result.status;
      rawBody = result.body;
    } else {
      const response = await fetch(upstream, {
        headers,
        signal: AbortSignal.timeout(10_000),
        cache: "no-store"
      });
      status = response.status;
      rawBody = await response.text();
    }

    if (status < 200 || status >= 300) {
      return NextResponse.json(
        { error: "naver-upstream-error", status, detail: rawBody.slice(0, 500) },
        { status: 502 }
      );
    }

    let payload: { total?: number; items?: NaverNewsItem[] } = {};
    try {
      payload = JSON.parse(rawBody) as { total?: number; items?: NaverNewsItem[] };
    } catch {
      return NextResponse.json(
        { error: "naver-upstream-invalid-json", detail: rawBody.slice(0, 500) },
        { status: 502 }
      );
    }
    const normalized = (payload.items ?? []).map((item): NormalizedCandidate => {
      const title = sanitizeText(item.title ?? "");
      const snippet = sanitizeText(item.description ?? "");
      const link = normalizeArticleUrl(item.link ?? "");
      const originallink = normalizeArticleUrl(item.originallink ?? "");
      const source = parseSource(originallink || link);
      const pubDate = toIsoDate((item.pubDate ?? "").trim());
      return {
        id: buildStableId(originallink || link, title, pubDate),
        title,
        snippet,
        link,
        originallink,
        pubDate,
        source
      };
    });
    const dateFiltered =
      fromDate || toDate
        ? normalized.filter((item) => {
            if (!item.pubDate) return false;
            const dt = new Date(item.pubDate);
            if (Number.isNaN(dt.getTime())) return false;
            if (fromDate && dt < fromDate) return false;
            if (toDate && dt > toDate) return false;
            return true;
          })
        : normalized;
    const items = dedupeByExactLinks(dateFiltered);

    return NextResponse.json({
      keyword,
      total: typeof payload.total === "number" ? payload.total : items.length,
      items
    });
  } catch (error) {
    const detail = extractErrorDetail(error);
    console.error("[NEWS SEARCH ERROR]", detail);
    return NextResponse.json({ error: "news-search-unavailable", detail }, { status: 503 });
  }
}
