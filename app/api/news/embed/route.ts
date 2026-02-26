import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CandidateInput = {
  id?: string;
  title?: string;
  snippet?: string;
  source?: string;
};

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
};

const CHUNK_SIZE = 100;
const TOKEN_STOPWORDS = new Set([
  "관련",
  "이번",
  "오늘",
  "내일",
  "오전",
  "오후",
  "단독",
  "속보",
  "기획",
  "기사",
  "뉴스",
  "update",
  "breaking",
  "report"
]);
const TOPIC_GROUPS: Record<string, string[]> = {
  GAME: ["게임", "리니지", "엔씨", "넥슨", "크래프톤", "펄어비스", "bm", "확률형", "mmorpg", "콘솔", "모바일게임"],
  ECONOMY: ["경제", "증시", "금리", "환율", "물가", "cpi", "pce", "고용", "실업", "fed", "연준", "한국은행", "실적", "가이던스"],
  POLICY: ["규제", "법안", "국회", "정부", "정책", "공정위", "금감원"]
};

function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function toText(item: CandidateInput) {
  const title = String(item.title ?? "").trim();
  const snippet = String(item.snippet ?? "").trim();
  const source = String(item.source ?? "").trim();
  return `${title}\n${snippet}\n${source}`.trim();
}

function normalizeText(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[\[\](){}"'`“”‘’.,!?/\\|:;*+=~^$#@&<>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(raw: string) {
  const normalized = normalizeText(raw);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !TOKEN_STOPWORDS.has(token));
}

function pickEntityTokens(title: string, snippet: string) {
  const titleTokens = tokenize(title);
  const snippetTokens = tokenize(snippet).filter((token) => token.length >= 3);
  return [...new Set([...titleTokens, ...snippetTokens])];
}

function pickTopicGroups(tokens: string[]) {
  const set = new Set<string>();
  const hay = ` ${tokens.join(" ")} `;
  Object.entries(TOPIC_GROUPS).forEach(([group, terms]) => {
    if (terms.some((term) => hay.includes(` ${term.toLowerCase()} `))) set.add(group);
  });
  return set;
}

function hasOverlap(a: Set<string>, b: Set<string>) {
  for (const value of a) {
    if (b.has(value)) return true;
  }
  return false;
}

export async function POST(request: Request) {
  let body: { candidates?: CandidateInput[]; strictThreshold?: number; relaxedThreshold?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, 1200) : [];
  if (!candidates.length) {
    return NextResponse.json({ keepIds: [], dropIds: [], reducedFrom: 0, reducedTo: 0, model: "none", fallback: true });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.NEWS_EMBED_MODEL?.trim() || "text-embedding-3-small";
  const strictRaw = Number(body.strictThreshold ?? process.env.NEWS_EMBED_STRICT_THRESHOLD ?? 0.94);
  const relaxedRaw = Number(body.relaxedThreshold ?? process.env.NEWS_EMBED_RELAXED_THRESHOLD ?? 0.9);
  const strictThreshold = Number.isFinite(strictRaw) ? Math.max(0.7, Math.min(0.99, strictRaw)) : 0.94;
  const relaxedThresholdBase = Number.isFinite(relaxedRaw) ? Math.max(0.7, Math.min(0.99, relaxedRaw)) : 0.9;
  const relaxedThreshold = Math.min(relaxedThresholdBase, strictThreshold - 0.01);

  if (!apiKey) {
    const keepIds = candidates.map((item, idx) => String(item.id ?? `item_${idx}`));
    return NextResponse.json({
      keepIds,
      dropIds: [],
      reducedFrom: candidates.length,
      reducedTo: candidates.length,
      model: "fallback",
      fallback: true
    });
  }

  const rows = candidates.map((item, idx) => ({
    id: String(item.id ?? `item_${idx}`),
    title: String(item.title ?? ""),
    snippet: String(item.snippet ?? ""),
    text: toText(item)
  }));

  try {
    const vectors: number[][] = [];
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          input: chunk.map((row) => row.text)
        })
      });

      if (!response.ok) {
        const detail = await response.text();
        console.error("[NEWS EMBED UPSTREAM ERROR]", response.status, detail);
        const keepIds = rows.map((row) => row.id);
        return NextResponse.json({
          keepIds,
          dropIds: [],
          reducedFrom: rows.length,
          reducedTo: rows.length,
          model: "fallback",
          fallback: true
        });
      }

      const payload = (await response.json()) as EmbeddingResponse;
      const chunkVectors = Array.isArray(payload.data) ? payload.data.map((entry) => entry.embedding ?? []) : [];
      chunkVectors.forEach((vec) => vectors.push(vec));
    }

    const metadata = rows.map((row) => {
      const entityTokens = new Set(pickEntityTokens(row.title, row.snippet));
      const topicGroups = pickTopicGroups([...entityTokens]);
      return { entityTokens, topicGroups };
    });

    const keepIdx: number[] = [];
    const dropIdx: number[] = [];
    let droppedByStrict = 0;
    let droppedByRelaxed = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const current = vectors[i] ?? [];
      let shouldDrop = false;
      for (const k of keepIdx) {
        const score = cosineSimilarity(current, vectors[k] ?? []);
        if (score >= strictThreshold) {
          shouldDrop = true;
          droppedByStrict += 1;
          break;
        }
        if (score < relaxedThreshold) continue;
        const entityOverlap = hasOverlap(metadata[i].entityTokens, metadata[k].entityTokens);
        const topicOverlap = hasOverlap(metadata[i].topicGroups, metadata[k].topicGroups);
        if (entityOverlap || topicOverlap) {
          shouldDrop = true;
          droppedByRelaxed += 1;
          break;
        }
      }
      if (shouldDrop) dropIdx.push(i);
      else keepIdx.push(i);
    }

    return NextResponse.json({
      keepIds: keepIdx.map((idx) => rows[idx].id),
      dropIds: dropIdx.map((idx) => rows[idx].id),
      reducedFrom: rows.length,
      reducedTo: keepIdx.length,
      model,
      strictThreshold,
      relaxedThreshold,
      droppedByStrict,
      droppedByRelaxed,
      fallback: false
    });
  } catch (error) {
    console.error("[NEWS EMBED ERROR]", error);
    const keepIds = rows.map((row) => row.id);
    return NextResponse.json({
      keepIds,
      dropIds: [],
      reducedFrom: rows.length,
      reducedTo: rows.length,
      model: "fallback",
      fallback: true
    });
  }
}
