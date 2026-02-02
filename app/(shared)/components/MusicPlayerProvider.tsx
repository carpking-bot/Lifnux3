"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Preset, PresetTrack, QueueItem, RepeatMode } from "../types/music";
import { isRatingPresetName, ratingToPresetName } from "../lib/music";
import { loadState, saveState } from "../lib/storage";

const STORAGE_KEY = "lifnux.music.state.v100";

type MusicState = {
  queue: QueueItem[];
  currentIndex: number;
  isPlaying: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  presets: Preset[];
  selectedPresetId: string | null;
  ratings: Record<string, number>;
};

type MusicContextValue = MusicState & {
  setQueue: (queue: QueueItem[]) => void;
  setCurrentIndex: (index: number) => void;
  setIsPlaying: (value: boolean) => void;
  setShuffle: (value: boolean) => void;
  setRepeatMode: (value: RepeatMode) => void;
  setPresets: (presets: Preset[]) => void;
  setSelectedPresetId: (id: string | null) => void;
  setRating: (item: QueueItem | PresetTrack | null, rating: number) => void;
};

const MusicContext = createContext<MusicContextValue | null>(null);

const defaultState: MusicState = {
  queue: [],
  currentIndex: 0,
  isPlaying: false,
  shuffle: false,
  repeatMode: "off",
  presets: [],
  selectedPresetId: null,
  ratings: {}
};

export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MusicState>(defaultState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const loaded = loadState(STORAGE_KEY, defaultState);
    const repeatMode =
      loaded && typeof loaded === "object" && "repeatMode" in loaded
        ? normalizeRepeatMode((loaded as MusicState).repeatMode)
        : normalizeRepeatMode((loaded as { repeat?: unknown })?.repeat);
    const presets = normalizePresets((loaded as MusicState)?.presets ?? []);
    setState({
      ...defaultState,
      ...loaded,
      isPlaying: false,
      repeatMode,
      presets,
      selectedPresetId: (loaded as MusicState)?.selectedPresetId ?? null,
      ratings: (loaded as MusicState)?.ratings ?? {}
    });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveState(STORAGE_KEY, state);
  }, [hydrated, state]);

  const setQueue = useCallback((queue: QueueItem[]) => {
    setState((prev) => (prev.queue === queue ? prev : { ...prev, queue }));
  }, []);

  const setCurrentIndex = useCallback((currentIndex: number) => {
    setState((prev) => (prev.currentIndex === currentIndex ? prev : { ...prev, currentIndex }));
  }, []);

  const setIsPlaying = useCallback((isPlaying: boolean) => {
    setState((prev) => (prev.isPlaying === isPlaying ? prev : { ...prev, isPlaying }));
  }, []);

  const setShuffle = useCallback((shuffle: boolean) => {
    setState((prev) => (prev.shuffle === shuffle ? prev : { ...prev, shuffle }));
  }, []);

  const setRepeatMode = useCallback((repeatMode: RepeatMode) => {
    setState((prev) => (prev.repeatMode === repeatMode ? prev : { ...prev, repeatMode }));
  }, []);

  const setPresets = useCallback((presets: Preset[]) => {
    setState((prev) => (prev.presets === presets ? prev : { ...prev, presets }));
  }, []);

  const setSelectedPresetId = useCallback((selectedPresetId: string | null) => {
    setState((prev) => (prev.selectedPresetId === selectedPresetId ? prev : { ...prev, selectedPresetId }));
  }, []);

  const setRating = useCallback((item: QueueItem | PresetTrack | null, rating: number) => {
    if (!item?.videoId) return;
    const safeRating = Math.min(5, Math.max(1, Math.round(rating)));
    setState((prev) => {
      const previousRating = prev.ratings[item.videoId];
      const nextRatings = { ...prev.ratings, [item.videoId]: safeRating };
      const nextPresets = updateRatingPresets(prev.presets, item, previousRating, safeRating);
      return { ...prev, ratings: nextRatings, presets: nextPresets };
    });
  }, []);

  const value = useMemo<MusicContextValue>(
    () => ({
      ...state,
      setQueue,
      setCurrentIndex,
      setIsPlaying,
      setShuffle,
      setRepeatMode,
      setPresets,
      setSelectedPresetId,
      setRating
    }),
    [state, setQueue, setCurrentIndex, setIsPlaying, setShuffle, setRepeatMode, setPresets, setSelectedPresetId, setRating]
  );

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export function useMusic() {
  const context = useContext(MusicContext);
  if (!context) throw new Error("useMusic must be used within MusicPlayerProvider");
  return context;
}

function normalizeRepeatMode(value: unknown): RepeatMode {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  if (raw === "one") return "one";
  if (raw === "all") return "all";
  if (raw === "off") return "off";
  if (value === "ONE") return "one";
  if (value === "ALL") return "all";
  return "off";
}

function normalizePresets(presets: Preset[]) {
  if (!Array.isArray(presets)) return [];
  return presets.map((preset) => {
    const isRatingPreset = preset.isRatingPreset ?? isRatingPresetName(preset.name);
    const tracks = Array.isArray(preset.tracks) ? preset.tracks : undefined;
    return { ...preset, isRatingPreset, tracks };
  });
}

function updateRatingPresets(
  presets: Preset[],
  item: QueueItem | PresetTrack,
  previousRating: number | undefined,
  nextRating: number
) {
  const fromName = previousRating ? ratingToPresetName(previousRating) : null;
  const toName = ratingToPresetName(nextRating);
  if (!toName) return presets;

  let nextPresets = presets.map((preset) => {
    if (fromName && preset.name === fromName) {
      return removeTrackByVideoId(preset, item.videoId);
    }
    return preset;
  });

  const existingIndex = nextPresets.findIndex((preset) => preset.name === toName);
  const track = toPresetTrack(item);
  if (existingIndex >= 0) {
    const preset = nextPresets[existingIndex];
    const tracks = preset.tracks ?? [];
    if (!tracks.some((entry) => entry.videoId === item.videoId)) {
      const nextTracks = [...tracks, track];
      nextPresets = [
        ...nextPresets.slice(0, existingIndex),
        { ...preset, tracks: nextTracks, urls: nextTracks.map((entry) => entry.url), isRatingPreset: true },
        ...nextPresets.slice(existingIndex + 1)
      ];
    }
  } else {
    nextPresets = [
      ...nextPresets,
      {
        id: crypto.randomUUID(),
        name: toName,
        urls: [track.url],
        tracks: [track],
        isRatingPreset: true
      }
    ];
  }

  if (fromName) {
    nextPresets = nextPresets.filter((preset) => {
      if (preset.name !== fromName) return true;
      const tracks = preset.tracks ?? [];
      return tracks.length > 0;
    });
  }

  return nextPresets.map((preset) => {
    if (isRatingPresetName(preset.name)) {
      return { ...preset, isRatingPreset: true };
    }
    return preset;
  });
}

function removeTrackByVideoId(preset: Preset, videoId: string) {
  const tracks = preset.tracks ?? [];
  const nextTracks = tracks.filter((track) => track.videoId !== videoId);
  return { ...preset, tracks: nextTracks, urls: nextTracks.map((track) => track.url) };
}

function toPresetTrack(item: QueueItem | PresetTrack): PresetTrack {
  return {
    id: crypto.randomUUID(),
    videoId: item.videoId,
    title: item.title,
    url: item.url ?? `https://youtu.be/${item.videoId}`,
    customTitle: item.customTitle
  };
}
