"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../(shared)/components/AppShell";
import { loadState, saveState } from "../../(shared)/lib/storage";

type Domain = "GAME" | "STOCK" | "GENERAL";
type CandidateSort = "date" | "sim";
type LibraryTab = "LIBRARY" | "ARCHIVE_GAME" | "ARCHIVE_STOCK";
type KeywordTab = "include" | "exclude" | "important";
type KeywordPresetName = "GAME" | "ECONOMY";
type KeywordPreset = {
  enabled: boolean;
  includes: string[];
  excludes: string[];
  importants: string[];
};
type InstructionPresetName = "GAME" | "STOCK";

type NaverCandidate = {
  id: string;
  title: string;
  snippet: string;
  originallink: string;
  link: string;
  pubDate: string;
  source: string;
};

type ScrapedItem = NaverCandidate & {
  domain: Domain;
  scrapedAt: string;
  isRead: boolean;
  archivedBucket: null | "GAME" | "STOCK";
  mySummary: string;
  myComment: string;
  tags: string[];
};

type LlmFilterRow = {
  id: string;
  reason: string;
  tags?: string[];
};

type LlmFilterResponse = {
  keep: LlmFilterRow[];
  drop: LlmFilterRow[];
  model?: string;
  fallback?: boolean;
};

type EmbedResponse = {
  keepIds?: string[];
  dropIds?: string[];
  reducedFrom?: number;
  reducedTo?: number;
  model?: string;
  strictThreshold?: number;
  relaxedThreshold?: number;
  droppedByStrict?: number;
  droppedByRelaxed?: number;
  fallback?: boolean;
  error?: string;
};

type Embed2Cluster = {
  clusterId: string;
  representativeId: string;
  label: string;
  itemIds: string[];
};

type Embed2Response = {
  clusters?: Embed2Cluster[];
  reducedFrom?: number;
  reducedTo?: number;
  fallback?: boolean;
  error?: string;
};

type SimilarPanelState = {
  representativeId: string;
  label: string;
  items: NaverCandidate[];
};

const CANDIDATES_CACHE_KEY = "news_candidates_cache";
const SCRAPED_ITEMS_KEY = "news_scraped_items";
const SCRAP_INSTRUCTION_KEY = "news_scrap_instruction";
const SCRAP_INSTRUCTION_PRESETS_KEY = "news_scrap_instruction_presets";
const KEYWORD_FILTER_KEY = "news_keyword_filter";
const KEYWORD_PRESETS_KEY = "news_keyword_presets";
const LLM_LIMIT = 60;
const SCRAP_COOLDOWN_MS = 30_000;
const NAVER_PAGE_SIZE = 100;
const NAVER_MAX_START = 1000;
const PAGE_DELAY_MS = 200;
const SHARD_DELAY_MS = 250;
const QUERY_SHARD_LIMIT = 24;
const SIMHASH_THRESHOLD = 4;
const TFIDF_COSINE_THRESHOLD = 0.85;

const DEFAULT_PRESETS: Record<KeywordPresetName, KeywordPreset> = {
  GAME: { enabled: true, includes: [], excludes: [], importants: [] },
  ECONOMY: { enabled: true, includes: [], excludes: [], importants: [] }
};
const DEFAULT_INSTRUCTION_PRESETS: Record<InstructionPresetName, string> = {
  GAME: "",
  STOCK: ""
};

function parseDateSafe(value: string) {
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatPubDate(iso: string) {
  const dt = parseDateSafe(iso);
  if (!dt) return "-";
  return dt.toLocaleString("ko-KR", { hour12: false });
}

function getTodayYmdLocal() {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

function buildDateRange(selectedDate: string, startTime: string, endTime: string) {
  if (!selectedDate || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    return { from: null, to: null, isValid: false };
  }
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return { from: null, to: null, isValid: false };
  }
  const from = new Date(`${selectedDate}T${startTime}:00`);
  const to = new Date(`${selectedDate}T${endTime}:59`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return { from: null, to: null, isValid: false };
  }
  return { from, to, isValid: true };
}

function parseTags(raw: string) {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeKeyword(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeHeadline(raw: string, source?: string) {
  let s = raw.toLowerCase();
  s = s.replace(/^\s*(\[(\uB2E8\uB3C5|\uC18D\uBCF4|\uAE30\uD68D)\]|(\uB2E8\uB3C5|\uC18D\uBCF4|\uAE30\uD68D))\s*/g, "");
  s = s.replace(/\.\.\.|\u2026/g, " ");
  s = s.replace(/\d{4}\s*\uB144\s*\d{1,2}\s*\uC6D4(\s*\d{1,2}\s*\uC77C)?/g, " <DATE> ");
  s = s.replace(/\d{1,2}\s*\uC6D4\s*\d{1,2}\s*\uC77C/g, " <DATE> ");
  s = s.replace(/\d{4}[./-]\d{1,2}([./-]\d{1,2})?/g, " <DATE> ");
  s = s.replace(/[\uAC00-\uD7A3]{2,4}\s*\uAE30\uC790/g, " ");
  if (source) {
    const sourceTokens = source
      .toLowerCase()
      .replace(/^www\./, "")
      .split(/[.\s]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);
    sourceTokens.forEach((token) => {
      s = s.replaceAll(token, " ");
    });
  }
  s = s.replace(/[()[\]{}"'`“”‘’<>]/g, " ");
  s = s.replace(/[^\p{L}\p{N}<>\s]/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function fnv1a64(value: string) {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mod = 0xffffffffffffffffn;
  for (let i = 0; i < value.length; i += 1) {
    h ^= BigInt(value.charCodeAt(i));
    h = (h * prime) & mod;
  }
  return h;
}

function simhash64(value: string) {
  const tokens = value.split(/\s+/).filter(Boolean);
  const tf = new Map<string, number>();
  tokens.forEach((token) => tf.set(token, (tf.get(token) ?? 0) + 1));
  const vec = new Array<number>(64).fill(0);
  tf.forEach((weight, token) => {
    const h = fnv1a64(token);
    for (let bit = 0; bit < 64; bit += 1) {
      const on = (h >> BigInt(bit)) & 1n;
      vec[bit] += on === 1n ? weight : -weight;
    }
  });
  let out = 0n;
  for (let bit = 0; bit < 64; bit += 1) {
    if (vec[bit] >= 0) out |= 1n << BigInt(bit);
  }
  return out;
}

function hammingDistance64(a: bigint, b: bigint) {
  let x = a ^ b;
  let count = 0;
  while (x !== 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

function dedupeBySemanticSimilarity(items: NaverCandidate[]) {
  const kept: NaverCandidate[] = [];
  const exactTitleSet = new Set<string>();
  const keptHashes: bigint[] = [];

  items.forEach((item) => {
    const normalizedTitle = normalizeHeadline(item.title, item.source);
    if (normalizedTitle && exactTitleSet.has(normalizedTitle)) return;
    const normalizedSnippet = normalizeHeadline(item.snippet, item.source);
    const hashInput = `${normalizedTitle} ${normalizedSnippet}`.trim();
    const hash = simhash64(hashInput || normalizedTitle || normalizeHeadline(item.title));
    const nearDuplicate = keptHashes.some((existing) => hammingDistance64(existing, hash) <= SIMHASH_THRESHOLD);
    if (nearDuplicate) return;
    if (normalizedTitle) exactTitleSet.add(normalizedTitle);
    keptHashes.push(hash);
    kept.push(item);
  });
  return kept;
}

function tokenizeForSimilarity(raw: string) {
  return raw
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function cosineSimilarityMap(a: Map<string, number>, b: Map<string, number>, normA: number, normB: number) {
  if (!normA || !normB) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  small.forEach((value, key) => {
    const other = large.get(key);
    if (other) dot += value * other;
  });
  return dot / (normA * normB);
}

function dedupeByTfIdfCosine(items: NaverCandidate[]) {
  if (items.length <= 1) return items;
  const docs = items.map((item) =>
    tokenizeForSimilarity(`${normalizeHeadline(item.title, item.source)} ${normalizeHeadline(item.snippet, item.source)}`.trim())
  );
  const docFreq = new Map<string, number>();
  docs.forEach((tokens) => {
    const uniq = new Set(tokens);
    uniq.forEach((token) => docFreq.set(token, (docFreq.get(token) ?? 0) + 1));
  });
  const total = docs.length;
  const vectors = docs.map((tokens) => {
    const tf = new Map<string, number>();
    tokens.forEach((token) => tf.set(token, (tf.get(token) ?? 0) + 1));
    const vec = new Map<string, number>();
    let normSq = 0;
    tf.forEach((count, token) => {
      const df = docFreq.get(token) ?? 0;
      const idf = Math.log((total + 1) / (df + 1)) + 1;
      const weight = count * idf;
      vec.set(token, weight);
      normSq += weight * weight;
    });
    return { vec, norm: Math.sqrt(normSq) };
  });

  const kept: NaverCandidate[] = [];
  const keptIdx: number[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const current = vectors[i];
    const duplicate = keptIdx.some((k) => cosineSimilarityMap(current.vec, vectors[k].vec, current.norm, vectors[k].norm) >= TFIDF_COSINE_THRESHOLD);
    if (duplicate) continue;
    keptIdx.push(i);
    kept.push(items[i]);
  }
  return kept;
}

function matchKeywordFilter(
  item: NaverCandidate,
  query: string,
  enabled: boolean,
  includes: string[],
  excludes: string[],
  importants: string[]
) {
  const hay = `${item.title} ${item.snippet} ${item.source}`.toLowerCase();
  const queryWord = normalizeKeyword(query);
  if (queryWord && !hay.includes(queryWord)) return false;
  if (!enabled) return true;
  const includeWords = includes.map((kw) => normalizeKeyword(kw)).filter(Boolean);
  const excludeWords = excludes.map((kw) => normalizeKeyword(kw)).filter(Boolean);
  const importantWords = importants.map((kw) => normalizeKeyword(kw)).filter(Boolean);
  const includePass = includeWords.length === 0 || includeWords.some((kw) => hay.includes(kw));
  const excludeHit = excludeWords.some((kw) => hay.includes(kw));
  const importantHit = importantWords.some((kw) => hay.includes(kw));
  return includePass && (!excludeHit || importantHit);
}

function dedupeById(items: ScrapedItem[]) {
  const map = new Map<string, ScrapedItem>();
  items.forEach((item) => map.set(item.id, item));
  return [...map.values()].sort((a, b) => b.scrapedAt.localeCompare(a.scrapedAt));
}

function buildFingerprint(query: string, domain: Domain, selectedDate: string, startTime: string, endTime: string, instruction: string) {
  return `${query.trim().toLowerCase()}|${domain}|${selectedDate}|${startTime}|${endTime}|${instruction.trim().toLowerCase()}`;
}

function seedTestItems(nowIso: string): ScrapedItem[] {
  return [
    {
      id: "seed_game_1",
      title: "Major platform announces monetization change",
      snippet: "Test data for game archive and comments.",
      originallink: "https://example.com/game-1",
      link: "https://example.com/game-1",
      pubDate: nowIso,
      source: "example.com",
      domain: "GAME",
      scrapedAt: nowIso,
      isRead: false,
      archivedBucket: null,
      mySummary: "",
      myComment: "",
      tags: ["platform", "monetization"]
    },
    {
      id: "seed_stock_1",
      title: "Company reports earnings surprise",
      snippet: "Test data for stock archive and read toggle.",
      originallink: "https://example.com/stock-1",
      link: "https://example.com/stock-1",
      pubDate: nowIso,
      source: "example.com",
      domain: "STOCK",
      scrapedAt: nowIso,
      isRead: true,
      archivedBucket: "STOCK",
      mySummary: "Earnings beat.",
      myComment: "Watch guidance next quarter.",
      tags: ["earnings"]
    }
  ];
}

export default function NewsPage() {
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState<Domain>("GENERAL");
  const [selectedDate, setSelectedDate] = useState(getTodayYmdLocal());
  const [windowStartTime, setWindowStartTime] = useState("05:00");
  const [windowEndTime, setWindowEndTime] = useState("18:00");
  const [candidateSort, setCandidateSort] = useState<CandidateSort>("date");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [resultSearch, setResultSearch] = useState("");
  const [scrapInstruction, setScrapInstruction] = useState("");
  const [keywordFilterOn, setKeywordFilterOn] = useState(true);
  const [includeKeywords, setIncludeKeywords] = useState<string[]>([]);
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([]);
  const [importantKeywords, setImportantKeywords] = useState<string[]>([]);
  const [includeDraft, setIncludeDraft] = useState("");
  const [excludeDraft, setExcludeDraft] = useState("");
  const [importantDraft, setImportantDraft] = useState("");
  const [bulkDraft, setBulkDraft] = useState("");
  const [keywordModalOpen, setKeywordModalOpen] = useState(false);
  const [keywordTab, setKeywordTab] = useState<KeywordTab>("include");
  const [scrapConfirmOpen, setScrapConfirmOpen] = useState(false);
  const [scrapInstructionEditMode, setScrapInstructionEditMode] = useState(false);
  const [activeInstructionPreset, setActiveInstructionPreset] = useState<InstructionPresetName>("GAME");
  const [instructionPresets, setInstructionPresets] = useState<Record<InstructionPresetName, string>>(DEFAULT_INSTRUCTION_PRESETS);
  const [activePreset, setActivePreset] = useState<KeywordPresetName>("GAME");
  const [keywordPresets, setKeywordPresets] = useState<Record<KeywordPresetName, KeywordPreset>>(DEFAULT_PRESETS);
  const [isKeywordConfigLoaded, setIsKeywordConfigLoaded] = useState(false);
  const [candidates, setCandidates] = useState<NaverCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scrapedItems, setScrapedItems] = useState<ScrapedItem[]>([]);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("LIBRARY");
  const [isSearching, setIsSearching] = useState(false);
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [isEmbedding2, setIsEmbedding2] = useState(false);
  const [isScrapping, setIsScrapping] = useState(false);
  const [clusterMeta, setClusterMeta] = useState<Record<string, { label: string; similarCount: number }>>({});
  const [similarClusterMap, setSimilarClusterMap] = useState<Record<string, SimilarPanelState>>({});
  const [activeSimilarRepresentativeId, setActiveSimilarRepresentativeId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [lastScrapAt, setLastScrapAt] = useState(0);
  const [lastScrapFingerprint, setLastScrapFingerprint] = useState("");

  useEffect(() => {
    const storedCandidates = loadState<NaverCandidate[]>(CANDIDATES_CACHE_KEY, []);
    const storedScraped = loadState<ScrapedItem[]>(SCRAPED_ITEMS_KEY, []);
    if (Array.isArray(storedCandidates)) setCandidates(storedCandidates);
    if (Array.isArray(storedScraped)) setScrapedItems(storedScraped);
  }, []);

  useEffect(() => {
    saveState(CANDIDATES_CACHE_KEY, candidates);
  }, [candidates]);

  useEffect(() => {
    saveState(SCRAPED_ITEMS_KEY, scrapedItems);
  }, [scrapedItems]);

  useEffect(() => {
    const storedInstruction = loadState<string>(SCRAP_INSTRUCTION_KEY, "");
    if (typeof storedInstruction === "string") setScrapInstruction(storedInstruction);
  }, []);

  useEffect(() => {
    saveState(SCRAP_INSTRUCTION_KEY, scrapInstruction);
  }, [scrapInstruction]);

  useEffect(() => {
    const stored = loadState<Partial<Record<InstructionPresetName, string>>>(SCRAP_INSTRUCTION_PRESETS_KEY, {});
    setInstructionPresets({
      GAME: typeof stored.GAME === "string" ? stored.GAME : "",
      STOCK: typeof stored.STOCK === "string" ? stored.STOCK : ""
    });
  }, []);

  useEffect(() => {
    saveState(SCRAP_INSTRUCTION_PRESETS_KEY, instructionPresets);
  }, [instructionPresets]);

  useEffect(() => {
    const stored = loadState<{ enabled?: boolean; includes?: string[]; excludes?: string[]; importants?: string[] }>(KEYWORD_FILTER_KEY, {});
    if (typeof stored.enabled === "boolean") setKeywordFilterOn(stored.enabled);
    if (Array.isArray(stored.includes)) setIncludeKeywords(stored.includes.map((v) => normalizeKeyword(String(v))).filter(Boolean));
    if (Array.isArray(stored.excludes)) setExcludeKeywords(stored.excludes.map((v) => normalizeKeyword(String(v))).filter(Boolean));
    if (Array.isArray(stored.importants)) setImportantKeywords(stored.importants.map((v) => normalizeKeyword(String(v))).filter(Boolean));
    setIsKeywordConfigLoaded(true);
  }, []);

  useEffect(() => {
    const stored = loadState<Partial<Record<KeywordPresetName, Partial<KeywordPreset>>>>(KEYWORD_PRESETS_KEY, {});
    const normalizePreset = (raw?: Partial<KeywordPreset>): KeywordPreset => ({
      enabled: typeof raw?.enabled === "boolean" ? raw.enabled : true,
      includes: Array.isArray(raw?.includes) ? raw.includes.map((v) => normalizeKeyword(String(v))).filter(Boolean) : [],
      excludes: Array.isArray(raw?.excludes) ? raw.excludes.map((v) => normalizeKeyword(String(v))).filter(Boolean) : [],
      importants: Array.isArray(raw?.importants) ? raw.importants.map((v) => normalizeKeyword(String(v))).filter(Boolean) : []
    });
    setKeywordPresets({
      GAME: normalizePreset(stored.GAME ?? DEFAULT_PRESETS.GAME),
      ECONOMY: normalizePreset(stored.ECONOMY ?? DEFAULT_PRESETS.ECONOMY)
    });
  }, []);

  useEffect(() => {
    if (!isKeywordConfigLoaded) return;
    saveState(KEYWORD_FILTER_KEY, {
      enabled: keywordFilterOn,
      includes: includeKeywords,
      excludes: excludeKeywords,
      importants: importantKeywords
    });
  }, [excludeKeywords, importantKeywords, includeKeywords, isKeywordConfigLoaded, keywordFilterOn]);

  useEffect(() => {
    saveState(KEYWORD_PRESETS_KEY, keywordPresets);
  }, [keywordPresets]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!keywordModalOpen) return;
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setKeywordModalOpen(false);
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [keywordModalOpen]);

  useEffect(() => {
    if (!scrapConfirmOpen) return;
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setScrapConfirmOpen(false);
        setScrapInstructionEditMode(false);
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [scrapConfirmOpen]);

  const activeRange = useMemo(
    () => buildDateRange(selectedDate, windowStartTime, windowEndTime),
    [selectedDate, windowStartTime, windowEndTime]
  );

  const candidateSources = useMemo(() => {
    const set = new Set<string>();
    candidates.forEach((item) => {
      if (item.source) set.add(item.source);
    });
    return ["ALL", ...[...set].sort((a, b) => a.localeCompare(b))];
  }, [candidates]);

  const visibleCandidates = useMemo(() => {
    const filtered = candidates.filter((item) => {
      const pub = parseDateSafe(item.pubDate);
      if (!pub) return false;
      if (activeRange.from && pub < activeRange.from) return false;
      if (activeRange.to && pub > activeRange.to) return false;
      if (sourceFilter !== "ALL" && item.source !== sourceFilter) return false;
      if (resultSearch.trim()) {
        const needle = resultSearch.trim().toLowerCase();
        const hay = `${item.title} ${item.snippet} ${item.source}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return matchKeywordFilter(item, query, keywordFilterOn, includeKeywords, excludeKeywords, importantKeywords);
    });
    return filtered.sort((a, b) => {
      if (candidateSort === "sim") return a.title.localeCompare(b.title);
      return b.pubDate.localeCompare(a.pubDate);
    });
  }, [activeRange.from, activeRange.to, candidateSort, candidates, excludeKeywords, importantKeywords, includeKeywords, keywordFilterOn, query, resultSearch, sourceFilter]);

  const selectedVisible = useMemo(() => visibleCandidates.filter((item) => selectedIds.has(item.id)), [selectedIds, visibleCandidates]);

  const candidateCountForScrap = selectedVisible.length > 0 ? selectedVisible.length : visibleCandidates.length;

  const scrapTargets = useMemo(
    () => (selectedVisible.length > 0 ? selectedVisible : visibleCandidates),
    [selectedVisible, visibleCandidates]
  );

  const libraryItems = useMemo(() => {
    if (libraryTab === "ARCHIVE_GAME") return scrapedItems.filter((item) => item.archivedBucket === "GAME");
    if (libraryTab === "ARCHIVE_STOCK") return scrapedItems.filter((item) => item.archivedBucket === "STOCK");
    return scrapedItems;
  }, [libraryTab, scrapedItems]);

  const handleSearch = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    const q = query.trim();
    if (!q) {
      setToast("Enter query first.");
      return;
    }
    if (!activeRange.isValid) {
      setToast("Set a valid date and time range.");
      return;
    }
    setIsSearching(true);
    setSelectedIds(new Set());
    try {
      const fetched: NaverCandidate[] = [];
      const seen = new Set<string>();
      let pages = 0;
      const shardCandidates = keywordFilterOn ? includeKeywords.map((kw) => normalizeKeyword(kw)).filter(Boolean) : [];
      const queryShards = [q, ...shardCandidates.map((kw) => `${q} ${kw}`)];
      const uniqueQueryShards = [...new Set(queryShards)].slice(0, QUERY_SHARD_LIMIT);
      const shardCapped = queryShards.length > uniqueQueryShards.length;

      for (let shardIdx = 0; shardIdx < uniqueQueryShards.length; shardIdx += 1) {
        const shardQuery = uniqueQueryShards[shardIdx];
        for (let start = 1; start <= NAVER_MAX_START; start += NAVER_PAGE_SIZE) {
          const params = new URLSearchParams();
          params.set("q", shardQuery);
          params.set("display", String(NAVER_PAGE_SIZE));
          params.set("start", String(start));
          params.set("sort", "date");
          params.set("from", selectedDate);
          params.set("to", selectedDate);

          const response = await fetch(`/api/news/search?${params.toString()}`, { cache: "no-store" });
          const body = (await response.json()) as { items?: NaverCandidate[]; error?: string; message?: string; detail?: string };
          if (!response.ok) {
            setToast(body.message || body.detail || body.error || "Search failed.");
            setCandidates([]);
            return;
          }

          const pageItems = Array.isArray(body.items) ? body.items : [];
          pages += 1;
          if (!pageItems.length) break;

          pageItems.forEach((item) => {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              fetched.push(item);
            }
          });

          const oldestInPage = parseDateSafe(pageItems[pageItems.length - 1]?.pubDate ?? "");
          if (activeRange.from && oldestInPage && oldestInPage < activeRange.from) break;
          if (pageItems.length < NAVER_PAGE_SIZE) break;
          if (start + NAVER_PAGE_SIZE > NAVER_MAX_START) break;
          await sleep(PAGE_DELAY_MS);
        }
        if (shardIdx < uniqueQueryShards.length - 1) await sleep(SHARD_DELAY_MS);
      }

      const itemsInRange = fetched.filter((item) => {
        const pub = parseDateSafe(item.pubDate);
        if (!pub) return false;
        if (activeRange.from && pub < activeRange.from) return false;
        if (activeRange.to && pub > activeRange.to) return false;
        return true;
      });
      const items = itemsInRange;
      setCandidates(items);
      setClusterMeta({});
      setToast(
        `Loaded ${items.length} raw candidates (${uniqueQueryShards.length} shards${shardCapped ? ", capped" : ""}, ${pages} pages).`
      );
    } catch {
      setToast("Search failed.");
      setCandidates([]);
    } finally {
      setIsSearching(false);
    }
  };

  const runScrap = async () => {
    if (!activeRange.isValid) {
      setToast("Set a valid date and time range.");
      return;
    }
    if (!scrapTargets.length) return;
    const fingerprint = buildFingerprint(query, domain, selectedDate, windowStartTime, windowEndTime, scrapInstruction);
    const now = Date.now();
    if (lastScrapFingerprint === fingerprint && now - lastScrapAt < SCRAP_COOLDOWN_MS) {
      setToast("Scrap cooldown active (30s). Change query/date or wait.");
      return;
    }

    const targets = [...scrapTargets];
    const chunks: NaverCandidate[][] = [];
    for (let i = 0; i < targets.length; i += LLM_LIMIT) {
      chunks.push(targets.slice(i, i + LLM_LIMIT));
    }
    setIsScrapping(true);
    try {
      const nowIso = new Date().toISOString();
      const keptAll: ScrapedItem[] = [];
      let droppedCount = 0;
      let completedBatches = 0;

      for (let batchIdx = 0; batchIdx < chunks.length; batchIdx += 1) {
        const chunk = chunks[batchIdx];
        const response = await fetch("/api/news/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain, candidates: chunk, instruction: scrapInstruction })
        });
        const body = (await response.json()) as LlmFilterResponse & { error?: string };
        if (!response.ok) {
          const partial = keptAll.length > 0;
          if (partial) {
            const nextScraped = dedupeById([...scrapedItems, ...keptAll]);
            setScrapedItems(nextScraped);
            setLastScrapAt(now);
            setLastScrapFingerprint(fingerprint);
            setToast(`Scrap partial: saved ${keptAll.length}, dropped ${droppedCount}, failed at batch ${batchIdx + 1}/${chunks.length}.`);
          } else {
            setToast(body.error || "LLM filter failed.");
          }
          return;
        }

        const keepMap = new Map<string, LlmFilterRow>((body.keep ?? []).map((row) => [row.id, row]));
        const dropMap = new Map<string, LlmFilterRow>((body.drop ?? []).map((row) => [row.id, row]));
        const keptChunk = chunk.filter((item) => keepMap.has(item.id) || !dropMap.has(item.id));
        droppedCount += chunk.length - keptChunk.length;
        keptAll.push(
          ...keptChunk.map((item) => {
            const keepRow = keepMap.get(item.id);
            return {
              ...item,
              domain,
              scrapedAt: nowIso,
              isRead: false,
              archivedBucket: null,
              mySummary: "",
              myComment: keepRow?.reason ?? "",
              tags: keepRow?.tags?.filter(Boolean) ?? []
            } satisfies ScrapedItem;
          })
        );
        completedBatches += 1;
        if (batchIdx < chunks.length - 1) await sleep(150);
      }

      const nextScraped = dedupeById([
        ...scrapedItems,
        ...keptAll
      ]);
      setScrapedItems(nextScraped);
      setLastScrapAt(now);
      setLastScrapFingerprint(fingerprint);
      setToast(`Saved ${keptAll.length} items, dropped ${droppedCount} items (${completedBatches}/${chunks.length} batches).`);
    } catch {
      setToast("Scrap failed.");
    } finally {
      setIsScrapping(false);
    }
  };

  const openScrapConfirm = () => {
    if (!activeRange.isValid) {
      setToast("Set a valid date and time range.");
      return;
    }
    if (!scrapTargets.length) {
      setToast("No candidates to scrap.");
      return;
    }
    setScrapInstructionEditMode(false);
    setScrapConfirmOpen(true);
  };

  const handleEmbed = async () => {
    const embedTargets = selectedVisible.length > 0 ? selectedVisible : visibleCandidates;
    if (!embedTargets.length) {
      setToast("No candidates to embed.");
      return;
    }
    setIsEmbedding(true);
    try {
      const response = await fetch("/api/news/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: embedTargets })
      });
      const body = (await response.json()) as EmbedResponse;
      if (!response.ok) {
        setToast(body.error || "Embed failed.");
        return;
      }

      const keepSet = new Set((body.keepIds ?? []).map((id) => String(id)));
      const targetSet = new Set(embedTargets.map((item) => item.id));

      setCandidates((prev) => prev.filter((item) => !targetSet.has(item.id) || keepSet.has(item.id)));
      setSelectedIds((prev) => {
        const next = new Set<string>();
        prev.forEach((id) => {
          if (!targetSet.has(id) || keepSet.has(id)) next.add(id);
        });
        return next;
      });

      const reducedFrom = typeof body.reducedFrom === "number" ? body.reducedFrom : embedTargets.length;
      const reducedTo = typeof body.reducedTo === "number" ? body.reducedTo : keepSet.size;
      const strictDropped = typeof body.droppedByStrict === "number" ? body.droppedByStrict : 0;
      const relaxedDropped = typeof body.droppedByRelaxed === "number" ? body.droppedByRelaxed : 0;
      setClusterMeta({});
      setSimilarClusterMap({});
      setActiveSimilarRepresentativeId(null);
      setToast(`Embed reduced ${reducedFrom} -> ${reducedTo} (A:${strictDropped}, B:${relaxedDropped})${body.fallback ? " (fallback)" : ""}.`);
    } catch {
      setToast("Embed failed.");
    } finally {
      setIsEmbedding(false);
    }
  };

  const handleEmbed2 = async () => {
    const embedTargets = selectedVisible.length > 0 ? selectedVisible : visibleCandidates;
    if (!embedTargets.length) {
      setToast("No candidates to embed-2.");
      return;
    }
    setIsEmbedding2(true);
    try {
      const response = await fetch("/api/news/embed2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: embedTargets })
      });
      const body = (await response.json()) as Embed2Response;
      if (!response.ok) {
        setToast(body.error || "Embed-2 failed.");
        return;
      }
      const clusters = Array.isArray(body.clusters) ? body.clusters : [];
      const representativeSet = new Set(clusters.map((cluster) => cluster.representativeId));
      const targetSet = new Set(embedTargets.map((item) => item.id));
      const nextMeta: Record<string, { label: string; similarCount: number }> = {};
      const nextSimilarMap: Record<string, SimilarPanelState> = {};
      const byId = new Map(embedTargets.map((item) => [item.id, item]));
      clusters.forEach((cluster) => {
        const similarCount = Math.max(0, cluster.itemIds.length - 1);
        if (representativeSet.has(cluster.representativeId) && similarCount > 0) {
          nextMeta[cluster.representativeId] = {
            label: cluster.label || "similar cluster",
            similarCount
          };
          nextSimilarMap[cluster.representativeId] = {
            representativeId: cluster.representativeId,
            label: cluster.label || "similar cluster",
            items: cluster.itemIds
              .map((id) => byId.get(id))
              .filter((item): item is NaverCandidate => !!item && item.id !== cluster.representativeId)
          };
        }
      });

      setCandidates((prev) => prev.filter((item) => !targetSet.has(item.id) || representativeSet.has(item.id)));
      setSelectedIds((prev) => {
        const next = new Set<string>();
        prev.forEach((id) => {
          if (!targetSet.has(id) || representativeSet.has(id)) next.add(id);
        });
        return next;
      });
      setClusterMeta(nextMeta);
      setSimilarClusterMap(nextSimilarMap);
      setActiveSimilarRepresentativeId(null);

      const reducedFrom = typeof body.reducedFrom === "number" ? body.reducedFrom : embedTargets.length;
      const reducedTo = typeof body.reducedTo === "number" ? body.reducedTo : representativeSet.size;
      setToast(`Embed-2 reduced ${reducedFrom} -> ${reducedTo}${body.fallback ? " (fallback)" : ""}${body.error ? ` [${body.error}]` : ""}.`);
    } catch {
      setToast("Embed-2 failed.");
    } finally {
      setIsEmbedding2(false);
    }
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(visibleCandidates.map((item) => item.id)));
  };

  const archiveSelectedCandidates = (bucket: "GAME" | "STOCK") => {
    const targets = selectedVisible.length > 0 ? selectedVisible : [];
    if (!targets.length) {
      setToast("Select candidates first.");
      return;
    }
    const nowIso = new Date().toISOString();
    const nextScraped = dedupeById([
      ...scrapedItems,
      ...targets.map((item) => ({
        ...item,
        domain,
        scrapedAt: nowIso,
        isRead: false,
        archivedBucket: bucket,
        mySummary: "",
        myComment: "",
        tags: []
      } satisfies ScrapedItem))
    ]);
    setScrapedItems(nextScraped);
    setToast(`Archived ${targets.length} items to ${bucket}.`);
  };

  const updateScrapedItem = (id: string, updater: (item: ScrapedItem) => ScrapedItem) => {
    setScrapedItems((prev) => prev.map((item) => (item.id === id ? updater(item) : item)));
  };

  const openAndMarkRead = (item: ScrapedItem) => {
    const url = item.originallink || item.link;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    updateScrapedItem(item.id, (prev) => ({ ...prev, isRead: true }));
  };

  const addKeyword = (type: KeywordTab) => {
    const raw = type === "include" ? includeDraft : type === "exclude" ? excludeDraft : importantDraft;
    const next = normalizeKeyword(raw);
    if (!next) return;
    if (type === "include") {
      setIncludeKeywords((prev) => (prev.includes(next) ? prev : [...prev, next]));
      setIncludeDraft("");
      return;
    }
    if (type === "exclude") {
      setExcludeKeywords((prev) => (prev.includes(next) ? prev : [...prev, next]));
      setExcludeDraft("");
      return;
    }
    setImportantKeywords((prev) => (prev.includes(next) ? prev : [...prev, next]));
    setImportantDraft("");
  };

  const updateKeyword = (type: KeywordTab, index: number, value: string) => {
    const next = normalizeKeyword(value);
    const setList = type === "include" ? setIncludeKeywords : type === "exclude" ? setExcludeKeywords : setImportantKeywords;
    setList((prev) => prev.map((entry, idx) => (idx === index ? next : entry)));
  };

  const removeKeyword = (type: KeywordTab, index: number) => {
    const setList = type === "include" ? setIncludeKeywords : type === "exclude" ? setExcludeKeywords : setImportantKeywords;
    setList((prev) => prev.filter((_, idx) => idx !== index));
  };

  const addBulkKeywords = (type: KeywordTab) => {
    const tokens = bulkDraft
      .split(/[\n,]/g)
      .map((token) => normalizeKeyword(token))
      .filter(Boolean);
    if (!tokens.length) return;
    const unique = [...new Set(tokens)];
    if (type === "include") {
      setIncludeKeywords((prev) => [...new Set([...prev, ...unique])]);
    } else if (type === "exclude") {
      setExcludeKeywords((prev) => [...new Set([...prev, ...unique])]);
    } else {
      setImportantKeywords((prev) => [...new Set([...prev, ...unique])]);
    }
    setBulkDraft("");
  };

  const applyKeywordPreset = (name: KeywordPresetName) => {
    const preset = keywordPresets[name];
    setKeywordFilterOn(preset.enabled);
    setIncludeKeywords(preset.includes);
    setExcludeKeywords(preset.excludes);
    setImportantKeywords(preset.importants);
    setActivePreset(name);
    setToast(`Loaded preset: ${name}`);
  };

  const overwriteKeywordPreset = (name: KeywordPresetName) => {
    setKeywordPresets((prev) => ({
      ...prev,
      [name]: {
        enabled: keywordFilterOn,
        includes: includeKeywords,
        excludes: excludeKeywords,
        importants: importantKeywords
      }
    }));
    setActivePreset(name);
    setToast(`Saved preset: ${name}`);
  };

  const loadInstructionPreset = (name: InstructionPresetName) => {
    setScrapInstruction(instructionPresets[name] ?? "");
    setActiveInstructionPreset(name);
    setToast(`Loaded instruction preset: ${name}`);
  };

  const saveInstructionPreset = (name: InstructionPresetName) => {
    setInstructionPresets((prev) => ({
      ...prev,
      [name]: scrapInstruction
    }));
    setActiveInstructionPreset(name);
    setToast(`Saved instruction preset: ${name}`);
  };

  return (
    <AppShell showTitle={false}>
      <div className="mx-auto w-full max-w-[1500px] pb-20 pt-10">
        <div className="mb-6">
          <h1 className="text-3xl">News v1.0</h1>
          <div className="text-sm text-[var(--ink-1)]">Search - Embed - Manual review</div>
        </div>

        <section className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={handleSearch}>
            <label className="text-xs text-[var(--ink-1)] xl:col-span-2">
              Query
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="keyword"
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="text-xs text-[var(--ink-1)]">
              Domain
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value as Domain)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
              >
                <option value="GAME">GAME</option>
                <option value="STOCK">STOCK</option>
                <option value="GENERAL">GENERAL</option>
              </select>
            </label>

            <label className="text-xs text-[var(--ink-1)]">
              Date
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
              />
            </label>

          </form>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs text-[var(--ink-1)]">
              Start time
              <input
                type="time"
                value={windowStartTime}
                onChange={(e) => setWindowStartTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-[var(--ink-1)]">
              End time
              <input
                type="time"
                value={windowEndTime}
                onChange={(e) => setWindowEndTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
              />
            </label>
            <div className="text-xs text-[var(--ink-1)] md:col-span-2">
              <div className="mt-6 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                Active window: {selectedDate} {windowStartTime} - {windowEndTime}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handleSearch()}
              disabled={isSearching}
              className="rounded-lg border border-cyan-300/55 px-4 py-2 text-sm text-cyan-300 disabled:border-white/10 disabled:text-[var(--ink-1)]"
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
            <button
              onClick={() => void handleEmbed()}
              disabled={isEmbedding || candidateCountForScrap === 0}
              className="rounded-lg border border-violet-300/55 px-4 py-2 text-sm text-violet-200 disabled:border-white/10 disabled:text-[var(--ink-1)]"
            >
              {isEmbedding ? "Embedding..." : "Embed"}
            </button>
            <button
              onClick={() => void handleEmbed2()}
              disabled={isEmbedding2 || candidateCountForScrap === 0}
              className="rounded-lg border border-fuchsia-300/55 px-4 py-2 text-sm text-fuchsia-200 disabled:border-white/10 disabled:text-[var(--ink-1)]"
            >
              {isEmbedding2 ? "Embedding-2..." : "Embed-2"}
            </button>
            <button
              onClick={() => {
                setCandidates([]);
                setSelectedIds(new Set());
              }}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm text-[var(--ink-1)]"
            >
              Clear results
            </button>
            <button
              onClick={() => {
                const seeded = seedTestItems(new Date().toISOString());
                setScrapedItems((prev) => dedupeById([...seeded, ...prev]));
                setToast(`Seeded ${seeded.length} test items.`);
              }}
              className="rounded-lg border border-amber-300/45 px-4 py-2 text-sm text-amber-200"
            >
              Generate Test Data
            </button>
          </div>

          <div className="mt-3 text-xs text-[var(--ink-1)]">
            Candidates: {visibleCandidates.length} | Selected: {selectedVisible.length}
            {" "} | Pipeline: Search -> Embed -> Embed-2
          </div>
        </section>

        <section className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-xs text-[var(--ink-1)]">
              Source
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="ml-2 rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-xs text-white"
              >
                {candidateSources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[var(--ink-1)]">
              In results
              <input
                value={resultSearch}
                onChange={(e) => setResultSearch(e.target.value)}
                placeholder="title/snippet/source"
                className="ml-2 rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-xs text-white"
              />
            </label>
            <button
              onClick={() => setKeywordFilterOn((prev) => !prev)}
              className={`rounded-full border px-3 py-1 text-xs ${keywordFilterOn ? "border-cyan-300/60 text-cyan-300" : "border-white/15 text-[var(--ink-1)]"}`}
            >
              Keyword Filtering: {keywordFilterOn ? "ON" : "OFF"}
            </button>
            <button
              onClick={() => setKeywordModalOpen(true)}
              className="rounded-full border border-white/15 px-3 py-1 text-xs text-[var(--ink-1)]"
            >
              Manage Keywords
            </button>
            <div className="text-xs text-[var(--ink-1)]">
              Include {includeKeywords.length} | Exclude {excludeKeywords.length} | Important {importantKeywords.length}
            </div>
            <label className="text-xs text-[var(--ink-1)]">
              Sort
              <select
                value={candidateSort}
                onChange={(e) => setCandidateSort(e.target.value as CandidateSort)}
                className="ml-2 rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-xs text-white"
              >
                <option value="date">date</option>
                <option value="sim">sim</option>
              </select>
            </label>
            <button
              onClick={() => toggleSelectAllVisible(true)}
              className="rounded-full border border-white/15 px-3 py-1 text-xs text-[var(--ink-1)]"
            >
              Select all
            </button>
            <button
              onClick={() => toggleSelectAllVisible(false)}
              className="rounded-full border border-white/15 px-3 py-1 text-xs text-[var(--ink-1)]"
            >
              Select none
            </button>
            <button
              onClick={() => archiveSelectedCandidates("GAME")}
              className="rounded-full border border-amber-300/40 px-3 py-1 text-xs text-amber-200"
            >
              Archive selected GAME
            </button>
            <button
              onClick={() => archiveSelectedCandidates("STOCK")}
              className="rounded-full border border-amber-300/40 px-3 py-1 text-xs text-amber-200"
            >
              Archive selected STOCK
            </button>
          </div>

          <div className="lifnux-scroll max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {visibleCandidates.length === 0 ? <div className="text-sm text-[var(--ink-1)]">No candidates.</div> : null}
            {visibleCandidates.map((item) => (
              <div key={item.id} className="rounded-lg border border-white/10 bg-black/25 p-3">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="lifnux-checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={(e) =>
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(item.id);
                        else next.delete(item.id);
                        return next;
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <a href={item.originallink || item.link} target="_blank" rel="noreferrer" className="line-clamp-2 text-sm text-white hover:underline">
                      {item.title}
                    </a>
                    <div className="mt-1 text-[11px] text-[var(--ink-1)]">
                      {item.source || "unknown"} | {formatPubDate(item.pubDate)}
                    </div>
                    {clusterMeta[item.id] ? (
                      <button
                        onClick={() => setActiveSimilarRepresentativeId(item.id)}
                        className="mt-1 rounded-full border border-fuchsia-300/40 px-2 py-[2px] text-[11px] text-fuchsia-200/90"
                      >
                        {clusterMeta[item.id].label} | 유사기사 +{clusterMeta[item.id].similarCount}
                      </button>
                    ) : null}
                    <div className="mt-1 line-clamp-2 text-xs text-[var(--ink-1)]">{item.snippet}</div>
                  </div>
                  <a
                    onClick={(event) => {
                      event.preventDefault();
                      setCandidates((prev) => prev.filter((entry) => entry.id !== item.id));
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        next.delete(item.id);
                        return next;
                      });
                    }}
                    href="#"
                    className="mr-1 rounded-full border border-rose-400/45 px-2 py-1 text-xs text-rose-200"
                    title="Delete candidate"
                  >
                    Del
                  </a>
                  <a
                    href={item.originallink || item.link}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-white/15 px-2 py-1 text-xs text-[var(--ink-1)]"
                    title="Open link"
                  >
                    open
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>

        {activeSimilarRepresentativeId && similarClusterMap[activeSimilarRepresentativeId] ? (
          <aside className="fixed right-5 top-24 z-40 w-[380px] max-w-[90vw] rounded-2xl border border-white/10 bg-[rgba(8,12,20,0.96)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm text-white">유사기사 목록</div>
              <button
                onClick={() => setActiveSimilarRepresentativeId(null)}
                className="rounded-lg border border-white/15 px-2 py-1 text-xs text-[var(--ink-1)]"
              >
                Close
              </button>
            </div>
            <div className="mb-2 text-xs text-fuchsia-200/90">{similarClusterMap[activeSimilarRepresentativeId].label}</div>
            <div className="lifnux-scroll max-h-[62vh] space-y-2 overflow-y-auto pr-1">
              {similarClusterMap[activeSimilarRepresentativeId].items.map((row) => (
                <div key={row.id} className="rounded-lg border border-white/10 bg-black/25 p-2">
                  <a href={row.originallink || row.link} target="_blank" rel="noreferrer" className="line-clamp-2 text-xs text-white hover:underline">
                    {row.title}
                  </a>
                  <div className="mt-1 text-[11px] text-[var(--ink-1)]">
                    {row.source || "unknown"} | {formatPubDate(row.pubDate)}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        ) : null}

        <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              className={`rounded-full border px-3 py-1 text-xs ${libraryTab === "LIBRARY" ? "border-cyan-300/60 text-cyan-300" : "border-white/15 text-[var(--ink-1)]"}`}
              onClick={() => setLibraryTab("LIBRARY")}
            >
              Library
            </button>
            <button
              className={`rounded-full border px-3 py-1 text-xs ${libraryTab === "ARCHIVE_GAME" ? "border-cyan-300/60 text-cyan-300" : "border-white/15 text-[var(--ink-1)]"}`}
              onClick={() => setLibraryTab("ARCHIVE_GAME")}
            >
              Archive: GAME
            </button>
            <button
              className={`rounded-full border px-3 py-1 text-xs ${libraryTab === "ARCHIVE_STOCK" ? "border-cyan-300/60 text-cyan-300" : "border-white/15 text-[var(--ink-1)]"}`}
              onClick={() => setLibraryTab("ARCHIVE_STOCK")}
            >
              Archive: STOCK
            </button>
          </div>

          <div className="space-y-3">
            {libraryItems.length === 0 ? <div className="text-sm text-[var(--ink-1)]">No saved items.</div> : null}
            {libraryItems.map((item) => (
              <article key={item.id} className="rounded-xl border border-white/10 bg-black/25 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm text-white">{item.title}</div>
                    <div className="mt-1 text-[11px] text-[var(--ink-1)]">
                      {item.source || "unknown"} | {formatPubDate(item.pubDate)} | domain: {item.domain} | status: {item.isRead ? "READ" : "NEW"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => openAndMarkRead(item)}
                      className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-[var(--ink-1)]"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => updateScrapedItem(item.id, (prev) => ({ ...prev, isRead: !prev.isRead }))}
                      className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-[var(--ink-1)]"
                    >
                      {item.isRead ? "Mark NEW" : "Mark READ"}
                    </button>
                    <button
                      onClick={async () => {
                        const url = item.originallink || item.link;
                        if (!url) return;
                        try {
                          await navigator.clipboard.writeText(url);
                          setToast("Link copied.");
                        } catch {
                          setToast("Copy failed.");
                        }
                      }}
                      className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-[var(--ink-1)]"
                    >
                      Copy link
                    </button>
                    <button
                      onClick={() => updateScrapedItem(item.id, (prev) => ({ ...prev, archivedBucket: "GAME" }))}
                      className="rounded-full border border-amber-300/40 px-2 py-1 text-[11px] text-amber-200"
                    >
                      Archive GAME
                    </button>
                    <button
                      onClick={() => updateScrapedItem(item.id, (prev) => ({ ...prev, archivedBucket: "STOCK" }))}
                      className="rounded-full border border-amber-300/40 px-2 py-1 text-[11px] text-amber-200"
                    >
                      Archive STOCK
                    </button>
                    <button
                      onClick={() => updateScrapedItem(item.id, (prev) => ({ ...prev, archivedBucket: null }))}
                      className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-[var(--ink-1)]"
                    >
                      Unarchive
                    </button>
                    <button
                      onClick={() => setScrapedItems((prev) => prev.filter((entry) => entry.id !== item.id))}
                      className="rounded-full border border-rose-400/45 px-2 py-1 text-[11px] text-rose-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <label className="text-xs text-[var(--ink-1)]">
                    My Summary
                    <textarea
                      rows={3}
                      value={item.mySummary}
                      onChange={(e) => updateScrapedItem(item.id, (prev) => ({ ...prev, mySummary: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-2 py-2 text-xs text-white"
                    />
                  </label>
                  <label className="text-xs text-[var(--ink-1)]">
                    My Comment
                    <textarea
                      rows={3}
                      value={item.myComment}
                      onChange={(e) => updateScrapedItem(item.id, (prev) => ({ ...prev, myComment: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-2 py-2 text-xs text-white"
                    />
                  </label>
                </div>
                <label className="mt-2 block text-xs text-[var(--ink-1)]">
                  Tags (comma separated)
                  <input
                    value={item.tags.join(", ")}
                    onChange={(e) => updateScrapedItem(item.id, (prev) => ({ ...prev, tags: parseTags(e.target.value) }))}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-2 py-2 text-xs text-white"
                  />
                </label>
              </article>
            ))}
          </div>
        </section>

        {keywordModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={() => setKeywordModalOpen(false)}>
            <div
              className="w-full max-w-[860px] rounded-2xl border border-white/10 bg-[rgba(8,12,20,0.98)] p-4"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm text-white">Keyword Manager</div>
                  <div className="text-xs text-[var(--ink-1)]">Manage in modal only. Supports large keyword sets.</div>
                </div>
                <button
                  onClick={() => setKeywordModalOpen(false)}
                  className="rounded-lg border border-white/15 px-3 py-1 text-xs text-[var(--ink-1)]"
                >
                  Close
                </button>
              </div>

              <div className="mb-3 rounded-lg border border-white/10 bg-black/20 p-2">
                <div className="mb-2 text-xs text-[var(--ink-1)]">Keyword Preset</div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setActivePreset("GAME")}
                    className={`rounded-full border px-3 py-1 text-xs ${activePreset === "GAME" ? "border-cyan-300/60 text-cyan-300" : "border-white/15 text-[var(--ink-1)]"}`}
                  >
                    GAME
                  </button>
                  <button
                    onClick={() => setActivePreset("ECONOMY")}
                    className={`rounded-full border px-3 py-1 text-xs ${activePreset === "ECONOMY" ? "border-cyan-300/60 text-cyan-300" : "border-white/15 text-[var(--ink-1)]"}`}
                  >
                    ECONOMY
                  </button>
                  <button
                    onClick={() => applyKeywordPreset(activePreset)}
                    className="rounded-lg border border-white/15 px-3 py-1 text-xs text-[var(--ink-1)]"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => overwriteKeywordPreset(activePreset)}
                    className="rounded-lg border border-amber-300/45 px-3 py-1 text-xs text-amber-200"
                  >
                    Save (Overwrite)
                  </button>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setKeywordTab("include")}
                  className={`rounded-full border px-3 py-1 text-xs ${keywordTab === "include" ? "border-cyan-300/60 text-cyan-300" : "border-white/15 text-[var(--ink-1)]"}`}
                >
                  Include ({includeKeywords.length})
                </button>
                <button
                  onClick={() => setKeywordTab("exclude")}
                  className={`rounded-full border px-3 py-1 text-xs ${keywordTab === "exclude" ? "border-cyan-300/60 text-cyan-300" : "border-white/15 text-[var(--ink-1)]"}`}
                >
                  Exclude ({excludeKeywords.length})
                </button>
                <button
                  onClick={() => setKeywordTab("important")}
                  className={`rounded-full border px-3 py-1 text-xs ${keywordTab === "important" ? "border-cyan-300/60 text-cyan-300" : "border-white/15 text-[var(--ink-1)]"}`}
                >
                  Important ({importantKeywords.length})
                </button>
                <button
                  onClick={() => setKeywordFilterOn((prev) => !prev)}
                  className={`rounded-full border px-3 py-1 text-xs ${keywordFilterOn ? "border-cyan-300/60 text-cyan-300" : "border-white/15 text-[var(--ink-1)]"}`}
                >
                  Filtering: {keywordFilterOn ? "ON" : "OFF"}
                </button>
              </div>

              <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto]">
                <input
                  value={keywordTab === "include" ? includeDraft : keywordTab === "exclude" ? excludeDraft : importantDraft}
                  onChange={(e) => {
                    if (keywordTab === "include") setIncludeDraft(e.target.value);
                    else if (keywordTab === "exclude") setExcludeDraft(e.target.value);
                    else setImportantDraft(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addKeyword(keywordTab);
                    }
                  }}
                  placeholder={
                    keywordTab === "include"
                      ? "add include keyword"
                      : keywordTab === "exclude"
                        ? "add exclude keyword"
                        : "add important keyword"
                  }
                  className="w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
                />
                <button
                  onClick={() => addKeyword(keywordTab)}
                  className="rounded-lg border border-white/15 px-3 py-2 text-xs text-[var(--ink-1)]"
                >
                  Add
                </button>
              </div>

              <div className="mb-3">
                <textarea
                  rows={3}
                  value={bulkDraft}
                  onChange={(e) => setBulkDraft(e.target.value)}
                  placeholder="Bulk add (comma or new line separated)"
                  className="w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-xs text-white"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={() => addBulkKeywords(keywordTab)}
                    className="rounded-lg border border-white/15 px-3 py-1 text-xs text-[var(--ink-1)]"
                  >
                    Add Bulk
                  </button>
                </div>
              </div>

              <div className="lifnux-scroll max-h-[380px] space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2">
                {(keywordTab === "include" ? includeKeywords : keywordTab === "exclude" ? excludeKeywords : importantKeywords).length === 0 ? (
                  <div className="text-xs text-[var(--ink-1)]">No keywords.</div>
                ) : null}
                {(keywordTab === "include" ? includeKeywords : keywordTab === "exclude" ? excludeKeywords : importantKeywords).map((kw, idx) => (
                  <div key={`${keywordTab}_${idx}`} className="flex items-center gap-2">
                    <input
                      value={kw}
                      onChange={(e) => updateKeyword(keywordTab, idx, e.target.value)}
                      className="w-full rounded-md border border-white/10 bg-black/25 px-2 py-1 text-xs text-white"
                    />
                    <button
                      onClick={() => removeKeyword(keywordTab, idx)}
                      className="rounded-md border border-rose-400/45 px-2 py-1 text-[11px] text-rose-200"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {toast ? (
          <div className="fixed bottom-5 right-5 z-50 rounded-lg border border-white/15 bg-black/75 px-4 py-2 text-xs text-white">
            {toast}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

