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
const SYNC_EXACT_KEYS = new Set(["portfolio.positions", "investing.portfolio.performance.v1"]);
const SYNC_PREFIXES = ["lifnux", "investing_", "asset_", "music."];

function isLifnuxKey(key: string) {
  if (SYNC_EXACT_KEYS.has(key)) return true;
  return SYNC_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function getCategory(key: string) {
  if (key === "portfolio.positions") return "finance";
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
  return candidate.meta?.app === "lifnux" && typeof candidate.data === "object";
}

export function importLifnuxExport(payload: LifnuxExport) {
  if (typeof window === "undefined") return;
  const keysToClear: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key && isLifnuxKey(key)) keysToClear.push(key);
  }
  keysToClear.forEach((key) => window.localStorage.removeItem(key));
  Object.values(payload.data).forEach((group) => {
    Object.entries(group).forEach(([key, value]) => {
      if (typeof value === "string") {
        window.localStorage.setItem(key, value);
      } else {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
    });
  });
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
