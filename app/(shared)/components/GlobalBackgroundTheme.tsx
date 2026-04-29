"use client";

import { useEffect, useState } from "react";
import { loadState, saveState } from "../lib/storage";

const HOME_BACKGROUND_STORAGE_KEY = "lifnux:background:theme";
const LEGACY_HOME_BACKGROUND_STORAGE_KEY = "lifnux.home.background.theme";
const LOCAL_DATA_IMPORTED_EVENT = "lifnux:data-imported";

type HomeBackground = {
  id: string;
  label: string;
  src: string;
};

export function GlobalBackgroundTheme() {
  const [backgrounds, setBackgrounds] = useState<HomeBackground[]>([]);
  const [selectedThemeId, setSelectedThemeId] = useState("gradient");
  const [backgroundLoadFailed, setBackgroundLoadFailed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const resolveSavedThemeId = (themes: HomeBackground[]) => {
    const savedThemeId =
      loadState<string>(HOME_BACKGROUND_STORAGE_KEY, "") ||
      (typeof window !== "undefined" ? window.localStorage.getItem(LEGACY_HOME_BACKGROUND_STORAGE_KEY) : null) ||
      "gradient";
    const availableThemeIds = new Set(["gradient", ...themes.map((theme) => theme.id)]);
    return availableThemeIds.has(savedThemeId) ? savedThemeId : "gradient";
  };

  useEffect(() => {
    let cancelled = false;

    const loadBackgrounds = async () => {
      try {
        const response = await fetch("/api/home-backgrounds", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) {
            setBackgrounds([]);
            setSelectedThemeId(resolveSavedThemeId([]));
            setHydrated(true);
          }
          return;
        }
        const data = (await response.json()) as { backgrounds?: HomeBackground[] };
        if (cancelled) {
          return;
        }
        const themes = Array.isArray(data.backgrounds) ? data.backgrounds : [];
        setBackgrounds(themes);
        setSelectedThemeId(resolveSavedThemeId(themes));
        setHydrated(true);
      } catch {
        if (!cancelled) {
          setBackgrounds([]);
          setSelectedThemeId(resolveSavedThemeId([]));
          setHydrated(true);
        }
      }
    };

    loadBackgrounds();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveState(HOME_BACKGROUND_STORAGE_KEY, selectedThemeId);
    try {
      window.localStorage.removeItem(LEGACY_HOME_BACKGROUND_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
  }, [hydrated, selectedThemeId]);

  useEffect(() => {
    const reloadTheme = () => {
      setSelectedThemeId(resolveSavedThemeId(backgrounds));
    };
    window.addEventListener(LOCAL_DATA_IMPORTED_EVENT, reloadTheme);
    return () => window.removeEventListener(LOCAL_DATA_IMPORTED_EVENT, reloadTheme);
  }, [backgrounds]);

  const selectedBackground = backgrounds.find((background) => background.id === selectedThemeId);
  const themeIds = ["gradient", ...backgrounds.map((background) => background.id)];

  const cycleTheme = (direction: -1 | 1) => {
    if (themeIds.length === 0) {
      return;
    }
    const currentIndex = Math.max(0, themeIds.indexOf(selectedThemeId));
    const nextIndex = (currentIndex + direction + themeIds.length) % themeIds.length;
    setSelectedThemeId(themeIds[nextIndex]);
  };

  useEffect(() => {
    setBackgroundLoadFailed(false);
  }, [selectedBackground?.src]);

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_top,_#20324b_0%,_#0b121c_55%,_#080c13_100%)]" />
      {selectedBackground && !backgroundLoadFailed ? (
        <img
          src={selectedBackground.src}
          alt={`${selectedBackground.label} background`}
          className="pointer-events-none fixed inset-0 z-0 h-full w-full object-cover"
          onError={() => setBackgroundLoadFailed(true)}
        />
      ) : null}
      <div className={`pointer-events-none fixed inset-0 z-0 ${selectedBackground && !backgroundLoadFailed ? "bg-black/60" : "bg-black/35"}`} />
      <div className="pointer-events-none fixed -top-40 left-10 z-0 h-96 w-96 rounded-full bg-[radial-gradient(circle,_rgba(90,214,208,0.25)_0%,_transparent_70%)] blur-2xl" />
      <div className="pointer-events-none fixed bottom-0 right-0 z-0 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,_rgba(90,120,214,0.22)_0%,_transparent_70%)] blur-2xl" />

      <div className="fixed bottom-4 right-4 z-[950] flex items-center gap-2 rounded-full border border-white/20 bg-black/45 px-3 py-2 text-xs text-white backdrop-blur">
        <button
          type="button"
          className="rounded-full border border-white/20 px-2 py-1 hover:bg-white/10"
          onClick={() => cycleTheme(-1)}
          aria-label="Previous background"
        >
          Prev
        </button>
        <select
          className="rounded-full border border-white/20 bg-black/40 px-3 py-1 outline-none"
          value={selectedThemeId}
          onChange={(event) => setSelectedThemeId(event.target.value)}
          aria-label="Global background theme"
        >
          <option value="gradient">Default Gradient</option>
          {backgrounds.map((background) => (
            <option key={background.id} value={background.id}>
              {background.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded-full border border-white/20 px-2 py-1 hover:bg-white/10"
          onClick={() => cycleTheme(1)}
          aria-label="Next background"
        >
          Next
        </button>
      </div>
    </>
  );
}
