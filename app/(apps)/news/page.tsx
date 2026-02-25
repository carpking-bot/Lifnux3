"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../(shared)/components/AppShell";
import { loadState, saveState } from "../../(shared)/lib/storage";

type Domain = "GAME" | "STOCK" | "GENERAL";
type DatePreset = "24h" | "3d" | "7d" | "30d" | "custom";
type CandidateSort = "date" | "sim";
type LibraryTab = "LIBRARY" | "ARCHIVE_GAME" | "ARCHIVE_STOCK";

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

const CANDIDATES_CACHE_KEY = "news_candidates_cache";
const SCRAPED_ITEMS_KEY = "news_scraped_items";
const LLM_LIMIT = 60;
const SCRAP_COOLDOWN_MS = 30_000;

function parseDateSafe(value: string) {
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatPubDate(iso: string) {
  const dt = parseDateSafe(iso);
  if (!dt) return "-";
  return dt.toLocaleString("ko-KR", { hour12: false });
}

function buildDateRange(preset: DatePreset, customStart: string, customEnd: string) {
  const now = new Date();
  if (preset === "custom") {
    const from = customStart ? new Date(`${customStart}T00:00:00.000Z`) : null;
    const to = customEnd ? new Date(`${customEnd}T23:59:59.999Z`) : null;
    return { from: from && !Number.isNaN(from.getTime()) ? from : null, to: to && !Number.isNaN(to.getTime()) ? to : null };
  }
  const days = preset === "24h" ? 1 : preset === "3d" ? 3 : preset === "7d" ? 7 : 30;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to: now };
}

function toYmd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseTags(raw: string) {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function matchKeywordFilter(item: NaverCandidate, includeText: string, excludeText: string) {
  const hay = `${item.title} ${item.snippet} ${item.source}`.toLowerCase();
  const includes = includeText
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const excludes = excludeText
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const includePass = includes.length === 0 || includes.every((kw) => hay.includes(kw));
  const excludePass = excludes.length === 0 || excludes.every((kw) => !hay.includes(kw));
  return includePass && excludePass;
}

function dedupeById(items: ScrapedItem[]) {
  const map = new Map<string, ScrapedItem>();
  items.forEach((item) => map.set(item.id, item));
  return [...map.values()].sort((a, b) => b.scrapedAt.localeCompare(a.scrapedAt));
}

function buildFingerprint(query: string, domain: Domain, preset: DatePreset, customStart: string, customEnd: string) {
  return `${query.trim().toLowerCase()}|${domain}|${preset}|${customStart}|${customEnd}`;
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
  const [datePreset, setDatePreset] = useState<DatePreset>("7d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [maxCandidates, setMaxCandidates] = useState(50);
  const [candidateSort, setCandidateSort] = useState<CandidateSort>("date");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [includeKeyword, setIncludeKeyword] = useState("");
  const [excludeKeyword, setExcludeKeyword] = useState("");
  const [candidates, setCandidates] = useState<NaverCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scrapedItems, setScrapedItems] = useState<ScrapedItem[]>([]);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("LIBRARY");
  const [isSearching, setIsSearching] = useState(false);
  const [isScrapping, setIsScrapping] = useState(false);
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
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const activeRange = useMemo(() => buildDateRange(datePreset, customStart, customEnd), [datePreset, customStart, customEnd]);

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
      return matchKeywordFilter(item, includeKeyword, excludeKeyword);
    });
    return filtered.sort((a, b) => {
      if (candidateSort === "sim") return a.title.localeCompare(b.title);
      return b.pubDate.localeCompare(a.pubDate);
    });
  }, [activeRange.from, activeRange.to, candidateSort, candidates, excludeKeyword, includeKeyword, sourceFilter]);

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
    setIsSearching(true);
    setSelectedIds(new Set());
    try {
      const params = new URLSearchParams();
      params.set("q", q);
      params.set("display", String(Math.max(1, Math.min(100, maxCandidates))));
      params.set("sort", candidateSort);
      if (activeRange.from) params.set("from", toYmd(activeRange.from));
      if (activeRange.to) params.set("to", toYmd(activeRange.to));
      const response = await fetch(`/api/news/search?${params.toString()}`, { cache: "no-store" });
      const body = (await response.json()) as { items?: NaverCandidate[]; error?: string };
      if (!response.ok) {
        setToast(body.error || "Search failed.");
        setCandidates([]);
        return;
      }
      const items = Array.isArray(body.items) ? body.items : [];
      setCandidates(items);
      setToast(`Loaded ${items.length} candidates.`);
    } catch {
      setToast("Search failed.");
      setCandidates([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleScrap = async () => {
    if (!scrapTargets.length) return;
    const fingerprint = buildFingerprint(query, domain, datePreset, customStart, customEnd);
    const now = Date.now();
    if (lastScrapFingerprint === fingerprint && now - lastScrapAt < SCRAP_COOLDOWN_MS) {
      setToast("Scrap cooldown active (30s). Change query/date or wait.");
      return;
    }

    const capped = scrapTargets.slice(0, LLM_LIMIT);
    if (!window.confirm(`This will call gpt-4o-mini once to filter ${capped.length} items. Proceed?`)) {
      return;
    }

    if (scrapTargets.length > LLM_LIMIT) {
      setToast(`Too many candidates. Sending newest ${LLM_LIMIT} only.`);
    }

    setIsScrapping(true);
    try {
      const response = await fetch("/api/news/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, candidates: capped })
      });
      const body = (await response.json()) as LlmFilterResponse;
      if (!response.ok) {
        setToast("LLM filter failed.");
        return;
      }
      const keepMap = new Map<string, LlmFilterRow>((body.keep ?? []).map((row) => [row.id, row]));
      const dropMap = new Map<string, LlmFilterRow>((body.drop ?? []).map((row) => [row.id, row]));
      const keptItems = capped.filter((item) => keepMap.has(item.id) || !dropMap.has(item.id));
      const droppedCount = capped.length - keptItems.length;
      const nowIso = new Date().toISOString();

      const nextScraped = dedupeById([
        ...scrapedItems,
        ...keptItems.map((item) => {
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
      ]);
      setScrapedItems(nextScraped);
      setLastScrapAt(now);
      setLastScrapFingerprint(fingerprint);
      setToast(`Saved ${keptItems.length} items, dropped ${droppedCount} items.`);
    } catch {
      setToast("Scrap failed.");
    } finally {
      setIsScrapping(false);
    }
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(visibleCandidates.map((item) => item.id)));
  };

  const updateScrapedItem = (id: string, updater: (item: ScrapedItem) => ScrapedItem) => {
    setScrapedItems((prev) => prev.map((item) => (item.id === id ? updater(item) : item)));
  };

  const openAndMarkRead = (item: ScrapedItem) => {
    const url = item.originallink || item.link;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    updateScrapedItem(item.id, (prev) => ({ ...prev, isRead: true }));
  };

  return (
    <AppShell showTitle={false}>
      <div className="mx-auto w-full max-w-[1500px] pb-20 pt-10">
        <div className="mb-6">
          <h1 className="text-3xl">News v1.0</h1>
          <div className="text-sm text-[var(--ink-1)]">Search - optional LLM filter on Scrap - Save - Archive</div>
        </div>

        <section className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-5" onSubmit={handleSearch}>
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
              Date Preset
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as DatePreset)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
              >
                <option value="24h">24h</option>
                <option value="3d">3d</option>
                <option value="7d">7d</option>
                <option value="30d">30d</option>
                <option value="custom">custom</option>
              </select>
            </label>

            <label className="text-xs text-[var(--ink-1)]">
              Max candidates
              <input
                type="number"
                min={1}
                max={100}
                value={maxCandidates}
                onChange={(e) => setMaxCandidates(Math.max(1, Math.min(100, Number(e.target.value) || 50)))}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
              />
            </label>
          </form>

          {datePreset === "custom" ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-[var(--ink-1)]">
                Start
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-[var(--ink-1)]">
                End
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handleSearch()}
              disabled={isSearching}
              className="rounded-lg border border-cyan-300/55 px-4 py-2 text-sm text-cyan-300 disabled:border-white/10 disabled:text-[var(--ink-1)]"
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
            <button
              onClick={() => void handleScrap()}
              disabled={isScrapping || candidateCountForScrap === 0}
              className="rounded-lg border border-emerald-300/55 px-4 py-2 text-sm text-emerald-300 disabled:border-white/10 disabled:text-[var(--ink-1)]"
            >
              {isScrapping ? "Scrapping..." : "Scrap (Filter + Save)"}
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
            Candidates: {visibleCandidates.length} | Selected: {selectedVisible.length} | Scrap target: {candidateCountForScrap}
            {" "} | LLM calls only on Scrap
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
              Include
              <input
                value={includeKeyword}
                onChange={(e) => setIncludeKeyword(e.target.value)}
                placeholder="comma separated"
                className="ml-2 rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-xs text-white"
              />
            </label>
            <label className="text-xs text-[var(--ink-1)]">
              Exclude
              <input
                value={excludeKeyword}
                onChange={(e) => setExcludeKeyword(e.target.value)}
                placeholder="comma separated"
                className="ml-2 rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-xs text-white"
              />
            </label>
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
          </div>

          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {visibleCandidates.length === 0 ? <div className="text-sm text-[var(--ink-1)]">No candidates.</div> : null}
            {visibleCandidates.map((item) => (
              <div key={item.id} className="rounded-lg border border-white/10 bg-black/25 p-3">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
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
                    <div className="mt-1 line-clamp-2 text-xs text-[var(--ink-1)]">{item.snippet}</div>
                  </div>
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

        {toast ? (
          <div className="fixed bottom-5 right-5 z-50 rounded-lg border border-white/15 bg-black/75 px-4 py-2 text-xs text-white">
            {toast}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
