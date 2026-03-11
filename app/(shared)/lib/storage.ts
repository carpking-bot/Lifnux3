"use client";

import { updateAutoBackup } from "./persistence";

const LOCAL_DATA_UPDATED_AT_KEY = "lifnux:data.lastUpdatedAt";

export function loadState<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveState<T>(key: string, value: T): boolean {
  if (typeof window === "undefined") return false;
  const serialized = JSON.stringify(value);
  try {
    window.localStorage.setItem(key, serialized);
    window.localStorage.setItem(LOCAL_DATA_UPDATED_AT_KEY, new Date().toISOString());
  } catch {
    try {
      // If storage is full, remove backup payload and retry once.
      if (key !== "lifnux:backup" && window.localStorage.getItem("lifnux:backup") !== null) {
        window.localStorage.removeItem("lifnux:backup");
        window.localStorage.setItem(key, serialized);
        window.localStorage.setItem(LOCAL_DATA_UPDATED_AT_KEY, new Date().toISOString());
      } else {
        return false;
      }
    } catch {
      return false;
    }
  }
  try {
    updateAutoBackup();
  } catch {
    // Ignore backup failures to avoid blocking primary app writes.
  }
  return true;
}
