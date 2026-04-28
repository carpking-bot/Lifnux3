"use client";

type LifnuxExport = {
  meta: {
    app: "lifnux";
    version: string;
    exportedAt: string;
  };
  data: Record<string, Record<string, unknown>>;
};

const EXPORT_VERSION = "1.0.0";
const BACKUP_KEY = "lifnux:backup";
const BACKUP_ENABLED_KEY = "lifnux:backup.enabled";
const LOCAL_DATA_UPDATED_AT_KEY = "lifnux:data.lastUpdatedAt";
const LOCAL_DATA_IMPORTED_EVENT = "lifnux:data-imported";
const SYNC_EXACT_KEYS = new Set(["portfolio.positions", "investing.portfolio.performance.v1"]);
const SYNC_PREFIXES = ["lifnux", "investing_", "asset_", "music.", "career_", "news_"];
const EXCLUDED_KEYS = new Set(["lifnux_world_generator_state_v1", "lifnux_world_generator_state_v2"]);

function isLifnuxKey(key: string) {
  if (EXCLUDED_KEYS.has(key)) return false;
  if (SYNC_EXACT_KEYS.has(key)) return true;
  return SYNC_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function getCategory(key: string) {
  if (key === "portfolio.positions") return "finance";
  if (key.startsWith("career_")) return "career";
  const normalized = key.startsWith("lifnux:") ? key.slice(7) : key.startsWith("lifnux.") ? key.slice(7) : key.slice(6);
  const match = normalized.match(/^([^.:\s]+)/);
  return match?.[1] || "misc";
}

function safeParse(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

type TimestampCandidate = {
  value: string;
  ts: number;
};

function parseTimestamp(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value > 1e12 ? value : value * 1000;
  }

  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isLikelyDate =
    /\d{4}[.\-/]\s*\d{1,2}[.\-/]\s*\d{1,2}|\\d{4}-\d{2}-\d{2}T|오전|오후/.test(trimmed);
  if (isLikelyDate) {
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }

  const korean = trimmed.match(/^(\d{4})[.]\s*(\d{1,2})[.]\s*(\d{1,2})[.]?\s*(오전|오후)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (korean) {
    const [, year, month, day, meridiem, hourRaw, minuteRaw, secondRaw] = korean;
    const hourNumber = Number(hourRaw);
    const minute = Number(minuteRaw);
    const second = Number(secondRaw ?? 0);
    if (!Number.isFinite(hourNumber) || !Number.isFinite(minute) || !Number.isFinite(second)) return null;
    let hour = hourNumber % 24;
    if (meridiem === "오후" && hour < 12) hour += 12;
    if (meridiem === "오전" && hour === 12) hour = 0;
    const ts = new Date(Number(year), Number(month) - 1, Number(day), hour, minute, second).getTime();
    return Number.isFinite(ts) ? ts : null;
  }

  return null;
}

function collectLatestUpdatedAtFromValue(value: unknown): number | null {
  let latest: number | null = null;

  const walk = (node: unknown) => {
    if (node === null || node === undefined) return;

    const parsed = parseTimestamp(node);
    if (parsed !== null && (latest === null || parsed > latest)) {
      latest = parsed;
    }

    if (Array.isArray(node)) {
      node.forEach((entry) => walk(entry));
      return;
    }

    if (typeof node === "object") {
      const entries = Object.values(node as Record<string, unknown>);
      for (const entry of entries) {
        walk(entry);
      }
    }
  };

  walk(value);
  return latest;
}

function collectLatestUpdatedAtFromStorage(): number | null {
  if (typeof window === "undefined") return null;
  let latest: number | null = null;
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key || !isLifnuxKey(key) || key === BACKUP_KEY || key === LOCAL_DATA_UPDATED_AT_KEY) continue;
    const raw = window.localStorage.getItem(key);
    if (raw === null) continue;
    const parsed = safeParse(raw);
    const candidate = collectLatestUpdatedAtFromValue(parsed);
    if (candidate !== null && (latest === null || candidate > latest)) {
      latest = candidate;
    }
  }
  return latest;
}

function toCandidate(value: string | number): TimestampCandidate | null {
  const ts = parseTimestamp(value);
  if (ts === null) return null;
  return { value: new Date(ts).toISOString(), ts };
}

export function buildLifnuxExport(): LifnuxExport {
  const data: Record<string, Record<string, unknown>> = {};
  if (typeof window === "undefined") {
    return {
      meta: { app: "lifnux", version: EXPORT_VERSION, exportedAt: new Date().toISOString() },
      data
    };
  }
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key || !isLifnuxKey(key) || key === BACKUP_KEY) continue;
    const raw = window.localStorage.getItem(key);
    if (raw === null) continue;
    const category = getCategory(key);
    if (!data[category]) data[category] = {};
    data[category][key] = safeParse(raw);
  }
  return {
    meta: { app: "lifnux", version: EXPORT_VERSION, exportedAt: new Date().toISOString() },
    data
  };
}

export function getBackupExport(): LifnuxExport | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(BACKUP_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LifnuxExport;
  } catch {
    return null;
  }
}

export function getLocalDataLastUpdatedAt(): string | null {
  if (typeof window === "undefined") return null;
  const backup = getBackupExport();
  const direct = window.localStorage.getItem(LOCAL_DATA_UPDATED_AT_KEY);
  const directTs = direct && direct.trim() ? parseTimestamp(direct) : null;
  const storageTs = collectLatestUpdatedAtFromStorage();

  const candidates = [
    backup?.meta?.exportedAt,
    Number.isFinite(directTs) ? direct : null,
    storageTs !== null ? new Date(storageTs).toISOString() : null
  ].filter((value): value is string => Boolean(value));

  const timestamps = candidates.map((value) => toCandidate(value)).filter((entry): entry is TimestampCandidate => entry !== null);

  if (!timestamps.length) return null;
  timestamps.sort((a, b) => b.ts - a.ts);
  const latest = timestamps[0];

  try {
    if (direct !== latest.value) {
      window.localStorage.setItem(LOCAL_DATA_UPDATED_AT_KEY, latest.value);
    }
  } catch {
    // Ignore if local storage is blocked or quota is full.
  }

  return latest.value;
}

export function downloadLifnuxExport({ useBackup = false }: { useBackup?: boolean } = {}) {
  if (typeof window === "undefined") return;
  const payload = useBackup && isAutoBackupEnabled() ? getBackupExport() ?? buildLifnuxExport() : buildLifnuxExport();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  anchor.href = url;
  anchor.download = `lifnux-export-${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function validateLifnuxExport(payload: unknown): payload is LifnuxExport {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as LifnuxExport;
  return candidate.meta?.app === "lifnux" && !!candidate.data && typeof candidate.data === "object" && !Array.isArray(candidate.data);
}

export function importLifnuxExport(payload: LifnuxExport) {
  if (typeof window === "undefined") return;
  const keysToClear: string[] = [];
  const previousState = new Map<string, string | null>();
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key || !isLifnuxKey(key)) continue;
    keysToClear.push(key);
    previousState.set(key, window.localStorage.getItem(key));
  }

  const serializedEntries: Array<[string, string]> = [];
  Object.values(payload.data).forEach((group) => {
    Object.entries(group).forEach(([key, value]) => {
      if (!isLifnuxKey(key)) return;
      serializedEntries.push([key, typeof value === "string" ? value : JSON.stringify(value)]);
    });
  });

  try {
    keysToClear.forEach((key) => window.localStorage.removeItem(key));
    serializedEntries.forEach(([key, value]) => {
      window.localStorage.setItem(key, value);
    });
    const updatedAt = payload?.meta?.exportedAt ?? new Date().toISOString();
    try {
      window.localStorage.setItem(LOCAL_DATA_UPDATED_AT_KEY, updatedAt);
    } catch {
      // Ignore if local storage is blocked.
    }
    window.dispatchEvent(
      new CustomEvent(LOCAL_DATA_IMPORTED_EVENT, {
        detail: { updatedAt }
      })
    );
  } catch (error) {
    const touchedKeys = new Set<string>([...keysToClear, ...serializedEntries.map(([key]) => key)]);
    touchedKeys.forEach((key) => window.localStorage.removeItem(key));
    previousState.forEach((value, key) => {
      if (value !== null) {
        window.localStorage.setItem(key, value);
      }
    });
    throw error;
  }
}

export function isAutoBackupEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(BACKUP_ENABLED_KEY) === "true";
}

export function setAutoBackupEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BACKUP_ENABLED_KEY, enabled ? "true" : "false");
  if (enabled) {
    updateAutoBackup();
  }
}

export function updateAutoBackup() {
  if (typeof window === "undefined") return;
  if (!isAutoBackupEnabled()) return;
  const payload = buildLifnuxExport();
  window.localStorage.setItem(BACKUP_KEY, JSON.stringify(payload));
}

export function cleanupExcludedLocalData() {
  if (typeof window === "undefined") return false;
  let changed = false;
  EXCLUDED_KEYS.forEach((key) => {
    if (window.localStorage.getItem(key) !== null) {
      window.localStorage.removeItem(key);
      changed = true;
    }
  });
  if (changed) {
    try {
      window.localStorage.setItem(LOCAL_DATA_UPDATED_AT_KEY, new Date().toISOString());
    } catch {
      // Ignore storage write issues during cleanup.
    }
    try {
      if (isAutoBackupEnabled()) {
        updateAutoBackup();
      } else if (window.localStorage.getItem(BACKUP_KEY) !== null) {
        const backup = getBackupExport();
        if (backup?.data) {
          Object.values(backup.data).forEach((group) => {
            EXCLUDED_KEYS.forEach((key) => {
              delete (group as Record<string, unknown>)[key];
            });
          });
          window.localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
        }
      }
    } catch {
      // Ignore backup cleanup failures.
    }
  }
  return changed;
}
