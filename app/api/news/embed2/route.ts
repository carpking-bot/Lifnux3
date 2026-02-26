import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CandidateInput = {
  id?: string;
  title?: string;
  snippet?: string;
  source?: string;
  pubDate?: string;
  link?: string;
  originallink?: string;
};

type ClusterDraft = {
  itemIds: string[];
};

type ClusterResult = {
  clusterId: string;
  representativeId: string;
  label: string;
  itemIds: string[];
};

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
};

const CHUNK_SIZE = 100;
const ENTITY_BONUS_PER_OVERLAP = 0.06;
const ENTITY_MAX_BONUS = 0.18;
const ENTITY_RELAXED_DELTA = 0.08;

const ENTITY_STOPWORDS = new Set([
  "출시",
  "업데이트",
  "발표",
  "공개",
  "기자",
  "뉴스",
  "이슈",
  "비결",
  "분석",
  "장기",
  "흥행"
]);

function getClusterSimThreshold() {
  const raw = Number(process.env.NEWS_EMBED2_CLUSTER_THRESHOLD ?? 0.60);
  if (!Number.isFinite(raw)) return 0.60;
  return Math.max(0.60, Math.min(0.99, raw));
}

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

function shortLabel(title: string) {
  const cleaned = title.replace(/\s+/g, " ").trim();
  return cleaned.length <= 42 ? cleaned : `${cleaned.slice(0, 42)}...`;
}

function normalizeEntityText(raw: string) {
  return raw.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function extractEntityTokens(title: string) {
  const normalized = normalizeEntityText(title);
  if (!normalized) return new Set<string>();
  const tokens = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !ENTITY_STOPWORDS.has(token));
  return new Set(tokens);
}

function countOverlap(a: Set<string>, b: Set<string>) {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count += 1;
  }
  return count;
}

function normalizeTitle(raw: string) {
  return raw.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function buildFallbackClusters(rows: Array<{ id: string; title: string }>) {
  const byTitle = new Map<string, string[]>();
  rows.forEach((row) => {
    const key = normalizeTitle(row.title) || row.id;
    const list = byTitle.get(key) ?? [];
    list.push(row.id);
    byTitle.set(key, list);
  });

  const clusters: ClusterResult[] = [];
  let idx = 0;
  byTitle.forEach((itemIds, key) => {
    const representativeId = itemIds[0];
    clusters.push({
      clusterId: `cluster_${idx++}`,
      representativeId,
      label: shortLabel(key || representativeId),
      itemIds
    });
  });
  return clusters;
}

export async function POST(request: Request) {
  let body: { candidates?: CandidateInput[] } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, 1200) : [];
  if (!candidates.length) {
    return NextResponse.json({ clusters: [], reducedFrom: 0, reducedTo: 0, fallback: true });
  }

  const rows = candidates.map((item, idx) => ({
    id: String(item.id ?? `item_${idx}`),
    title: String(item.title ?? ""),
    snippet: String(item.snippet ?? ""),
    source: String(item.source ?? ""),
    pubDate: String(item.pubDate ?? ""),
    link: String(item.link ?? ""),
    originallink: String(item.originallink ?? ""),
    text: toText(item)
  }));

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const embedModel = process.env.NEWS_EMBED_MODEL?.trim() || "text-embedding-3-small";
  const clusterModel = process.env.NEWS_CLUSTER_MODEL?.trim() || "gpt-4o-mini";
  const clusterSimThreshold = getClusterSimThreshold();

  if (!apiKey) {
    const clusters = buildFallbackClusters(rows);
    return NextResponse.json({
      clusters,
      reducedFrom: rows.length,
      reducedTo: clusters.length,
      fallback: true
    });
  }

  try {
    const vectors: number[][] = [];
    const rowEntities = rows.map((row) => extractEntityTokens(row.title));
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: embedModel,
          input: chunk.map((row) => (row.title.trim() || row.text))
        })
      });
      if (!response.ok) {
        const detail = await response.text();
        console.error("[NEWS EMBED2 EMBEDDING ERROR]", response.status, detail);
        const clusters = buildFallbackClusters(rows);
        return NextResponse.json({
          clusters,
          reducedFrom: rows.length,
          reducedTo: clusters.length,
          fallback: true,
          error: "embedding-failed"
        });
      }
      const payload = (await response.json()) as EmbeddingResponse;
      const chunkVectors = Array.isArray(payload.data) ? payload.data.map((entry) => entry.embedding ?? []) : [];
      chunkVectors.forEach((vec) => vectors.push(vec));
    }

    const idToIndex = new Map(rows.map((row, idx) => [row.id, idx]));
    const clusters: ClusterDraft[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      const current = vectors[i] ?? [];
      let assigned = false;
      for (let c = 0; c < clusters.length; c += 1) {
        const repId = clusters[c].itemIds[0];
        const repIndex = idToIndex.get(repId);
        if (repIndex === undefined) continue;
        const titleCosine = cosineSimilarity(current, vectors[repIndex] ?? []);
        const overlapCount = countOverlap(rowEntities[i], rowEntities[repIndex]);
        const overlapBonus = Math.min(ENTITY_MAX_BONUS, overlapCount * ENTITY_BONUS_PER_OVERLAP);
        const adjustedScore = Math.min(1, titleCosine + overlapBonus);
        const relaxedThreshold = overlapCount > 0 ? Math.max(0.5, clusterSimThreshold - ENTITY_RELAXED_DELTA) : clusterSimThreshold;
        if (adjustedScore >= relaxedThreshold) {
          clusters[c].itemIds.push(rows[i].id);
          assigned = true;
          break;
        }
      }
      if (!assigned) clusters.push({ itemIds: [rows[i].id] });
    }

    const byId = new Map(rows.map((row) => [row.id, row]));
    const results: ClusterResult[] = [];
    for (let i = 0; i < clusters.length; i += 1) {
      const group = clusters[i];
      const fallbackRep = group.itemIds[0];
      const fallbackLabel = shortLabel(byId.get(fallbackRep)?.title ?? fallbackRep);
      if (group.itemIds.length === 1) {
        results.push({
          clusterId: `cluster_${i}`,
          representativeId: fallbackRep,
          label: fallbackLabel,
          itemIds: group.itemIds
        });
        continue;
      }

      const clusterRows = group.itemIds.map((id) => byId.get(id)).filter(Boolean);
      const prompt = {
        task: "Validate one issue cluster. Pick representative id and cluster label.",
        rules: [
          "If most are same issue, keep one best representative article.",
          "Prefer article with clearer title and richer snippet.",
          "Return strict JSON: representative_id, label."
        ],
        candidates: clusterRows.map((row) => ({
          id: row?.id,
          title: row?.title,
          snippet: row?.snippet,
          source: row?.source,
          pubDate: row?.pubDate
        }))
      };

      let representativeId = fallbackRep;
      let label = fallbackLabel;
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: clusterModel,
            temperature: 0.1,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: "You are a clustering validator. Return JSON only."
              },
              { role: "user", content: JSON.stringify(prompt) }
            ]
          })
        });
        if (response.ok) {
          const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const content = data.choices?.[0]?.message?.content ?? "{}";
          const parsed = JSON.parse(content) as { representative_id?: string; label?: string };
          const rep = String(parsed.representative_id ?? "").trim();
          if (rep && group.itemIds.includes(rep)) representativeId = rep;
          const nextLabel = String(parsed.label ?? "").trim();
          if (nextLabel) label = shortLabel(nextLabel);
        }
      } catch {
        // ignore and keep fallback
      }

      results.push({
        clusterId: `cluster_${i}`,
        representativeId,
        label,
        itemIds: group.itemIds
      });
    }

    return NextResponse.json({
      clusters: results,
      reducedFrom: rows.length,
      reducedTo: results.length,
      embedModel,
      clusterModel,
      clusterSimThreshold,
      fallback: false
    });
  } catch (error) {
    console.error("[NEWS EMBED2 ERROR]", error);
    const clusters = buildFallbackClusters(rows);
    return NextResponse.json({
      clusters,
      reducedFrom: rows.length,
      reducedTo: clusters.length,
      fallback: true,
      error: "embed2-failed"
    });
  }
}


