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
        return false;
    const serialized = JSON.stringify(value);
    try {
        window.localStorage.setItem(key, serialized);
    }
    catch {
        try {
            if (key !== "lifnux:backup" && window.localStorage.getItem("lifnux:backup") !== null) {
                window.localStorage.removeItem("lifnux:backup");
                window.localStorage.setItem(key, serialized);
            }
            else {
                return false;
            }
        }
        catch {
            return false;
        }
    }
    try {
        updateAutoBackup();
    }
    catch {
        // Ignore backup failures to avoid blocking primary app writes.
    }
    return true;
}
