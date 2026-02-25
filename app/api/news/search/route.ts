import { NextResponse } from "next/server";

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
    const response = await fetch(upstream, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret
      },
      cache: "no-store"
    });

    if (!response.ok) {
      const body = await response.text();
      return NextResponse.json(
        { error: "naver-upstream-error", status: response.status, detail: body.slice(0, 500) },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as { total?: number; items?: NaverNewsItem[] };
    const normalized = (payload.items ?? []).map((item): NormalizedCandidate => {
      const title = sanitizeText(item.title ?? "");
      const snippet = sanitizeText(item.description ?? "");
      const link = (item.link ?? "").trim();
      const originallink = (item.originallink ?? "").trim();
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
    const items =
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

    return NextResponse.json({
      keyword,
      total: typeof payload.total === "number" ? payload.total : items.length,
      items
    });
  } catch (error) {
    console.error("[NEWS SEARCH ERROR]", error);
    return NextResponse.json({ error: "news-search-unavailable" }, { status: 503 });
  }
}
