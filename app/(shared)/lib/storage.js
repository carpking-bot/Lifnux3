"use client";
import { updateAutoBackup } from "./persistence";
export function loadState(key, fallback) {
    if (typeof window === "undefined")
        return fallback;
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw)
            return fallback;
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
export function saveState(key, value) {
    if (typeof window === "undefined")
        return;
    window.localStorage.setItem(key, JSON.stringify(value));
    updateAutoBackup();
}
