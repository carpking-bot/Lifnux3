"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { QueueItem, RepeatMode } from "../types/music";
import { loadState, saveState } from "../lib/storage";

const STORAGE_KEY = "lifnux.music.state.v100";

type MusicState = {
  queue: QueueItem[];
  currentIndex: number;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
};

type MusicContextValue = MusicState & {
  setQueue: (queue: QueueItem[]) => void;
  setCurrentIndex: (index: number) => void;
  setIsPlaying: (value: boolean) => void;
  setShuffle: (value: boolean) => void;
  setRepeat: (value: RepeatMode) => void;
};

const MusicContext = createContext<MusicContextValue | null>(null);

const defaultState: MusicState = {
  queue: [],
  currentIndex: 0,
  isPlaying: false,
  shuffle: false,
  repeat: "OFF"
};

export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MusicState>(() => loadState(STORAGE_KEY, defaultState));

  useEffect(() => {
    if (!state) return;
    saveState(STORAGE_KEY, state);
  }, [state]);

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

  const setRepeat = useCallback((repeat: RepeatMode) => {
    setState((prev) => (prev.repeat === repeat ? prev : { ...prev, repeat }));
  }, []);

  const value = useMemo<MusicContextValue>(
    () => ({
      ...state,
      setQueue,
      setCurrentIndex,
      setIsPlaying,
      setShuffle,
      setRepeat
    }),
    [state, setQueue, setCurrentIndex, setIsPlaying, setShuffle, setRepeat]
  );

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export function useMusic() {
  const context = useContext(MusicContext);
  if (!context) throw new Error("useMusic must be used within MusicPlayerProvider");
  return context;
}
