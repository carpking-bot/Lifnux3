import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ArticleInput = {
  id?: string;
  title?: string;
  snippet?: string;
  source?: string;
  pubDate?: string;
  link?: string;
};

type KeepDropItem = {
  id: string;
  reason: string;
  tags?: string[];
};

type LlmFilterResult = {
  keep: KeepDropItem[];
  drop: KeepDropItem[];
};

function fallbackFilter(articles: ArticleInput[]): LlmFilterResult {
  const keep = articles.map((item, idx) => ({
    id: String(item.id ?? `item_${idx}`),
    reason: "fallback_keep_if_uncertain"
  }));
  return {
    keep,
    drop: []
  };
}

function normalizeFilter(raw: unknown, articles: ArticleInput[]): LlmFilterResult {
  if (!raw || typeof raw !== "object") return fallbackFilter(articles);
  const obj = raw as Record<string, unknown>;
  const keepRaw = Array.isArray(obj.keep) ? obj.keep : [];
  const dropRaw = Array.isArray(obj.drop) ? obj.drop : [];
  const knownIds = new Set(articles.map((item, idx) => String(item.id ?? `item_${idx}`)));

  const normalizeList = (list: unknown[]): KeepDropItem[] =>
    list
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const row = entry as Record<string, unknown>;
        const id = String(row.id ?? "").trim();
        if (!id || !knownIds.has(id)) return null;
        const reason = String(row.reason ?? "").trim() || "no_reason";
        const tagsRaw = Array.isArray(row.tags) ? row.tags : [];
        const tags = tagsRaw.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8);
        return { id, reason, tags } as KeepDropItem;
      })
      .filter((item): item is KeepDropItem => !!item);

  const keep = normalizeList(keepRaw);
  const drop = normalizeList(dropRaw);
  if (!keep.length && !drop.length) return fallbackFilter(articles);

  const seen = new Set<string>();
  const uniqueKeep = keep.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  const uniqueDrop = drop.filter((item) => !seen.has(item.id));

  if (!uniqueKeep.length && !uniqueDrop.length) return fallbackFilter(articles);

  return {
    keep: uniqueKeep,
    drop: uniqueDrop
  };
}

export async function POST(request: Request) {
  let body: { domain?: "STOCK" | "GAME" | "GENERAL"; candidates?: ArticleInput[]; instruction?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const domain = body.domain === "GAME" || body.domain === "STOCK" ? body.domain : "GENERAL";
  const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, 60) : [];
  const userInstruction = String(body.instruction ?? "").trim().slice(0, 1200);
  if (!candidates.length) {
    return NextResponse.json({ keep: [], drop: [], model: "fallback", fallback: true });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.NEWS_LLM_MODEL?.trim() || "gpt-4o-mini";
  if (!apiKey) {
    const fallback = fallbackFilter(candidates);
    return NextResponse.json({ ...fallback, model: "fallback", fallback: true });
  }

  const systemPrompt =
    "You are a news filter. Return strict JSON only with keys: keep and drop. Each item needs id and reason. tags optional.";
  const userPrompt = {
    domain,
    policy:
      "Keep actionable and meaningful items. Drop obvious noise such as pure promotions, minor updates, community drama, and clickbait. If uncertain, keep.",
    instructions: [
      "For GAME keep launch, earnings, regulation, M&A, platform deals, major updates, monetization, user metrics.",
      "For STOCK keep earnings/guidance, macro impacts, major corporate actions, regulatory changes, price-moving events.",
      "GENERAL still keep substantial events and drop shallow noise.",
      "Use only provided candidate fields. Do not invent."
    ],
    user_instruction: userInstruction || undefined,
    candidates: candidates.map((item, idx) => ({
      id: String(item.id ?? `item_${idx}`),
      title: item.title ?? "",
      snippet: item.snippet ?? "",
      source: item.source ?? "",
      pubDate: item.pubDate ?? "",
      link: item.link ?? ""
    }))
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPrompt) }
        ]
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("[NEWS ANALYZE UPSTREAM ERROR]", response.status, detail);
      const fallback = fallbackFilter(candidates);
      return NextResponse.json({ ...fallback, model: "fallback", fallback: true });
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }
    return NextResponse.json({
      ...normalizeFilter(parsed, candidates),
      model,
      fallback: false
    });
  } catch (error) {
    console.error("[NEWS ANALYZE ERROR]", error);
    const fallback = fallbackFilter(candidates);
    return NextResponse.json({ ...fallback, model: "fallback", fallback: true });
  }
}
