"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useMusic } from "./MusicPlayerProvider";
import { parseVideoId } from "../lib/music";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

function loadYouTubeApi(onReady: () => void) {
  if (window.YT && window.YT.Player) {
    onReady();
    return;
  }
  if (document.getElementById("yt-iframe-api")) {
    return;
  }
  const tag = document.createElement("script");
  tag.id = "yt-iframe-api";
  tag.src = "https://www.youtube.com/iframe_api";
  window.onYouTubeIframeAPIReady = onReady;
  document.body.appendChild(tag);
}

export function GlobalMusicPlayer() {
  const pathname = usePathname();
  const isMusicRoute = pathname?.startsWith("/music");
  const playerRef = useRef<any>(null);
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const {
    queue,
    currentIndex,
    setCurrentIndex,
    isPlaying,
    setIsPlaying,
    shuffle,
    repeatMode,
    setShuffle,
    setRepeatMode
  } = useMusic();
  const repeatModeRef = useRef(repeatMode);
  const activeVideoIdRef = useRef<string | null>(null);
  const queueRef = useRef(queue);
  const currentIndexRef = useRef(currentIndex);
  const shuffleRef = useRef(shuffle);
  const lastErrorRef = useRef<{ index: number; videoId: string; retries: number } | null>(null);
  const isDev = process.env.NODE_ENV === "development";

  useEffect(() => {
    loadYouTubeApi(() => setApiReady(true));
    const interval = setInterval(() => {
      if (window.YT?.Player) {
        setApiReady(true);
        clearInterval(interval);
      }
    }, 300);
    return () => clearInterval(interval);
  }, []);

  const activeItem = queue[currentIndex];
  useEffect(() => {
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);

  useEffect(() => {
    activeVideoIdRef.current = activeItem?.videoId ?? null;
  }, [activeItem?.videoId]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
  useEffect(() => {
    shuffleRef.current = shuffle;
  }, [shuffle]);

  useEffect(() => {
    if (!apiReady || !playerHostRef.current) return;
    if (playerRef.current) return;
    playerRef.current = new window.YT.Player(playerHostRef.current, {
      height: "100%",
      width: "100%",
      playerVars: { playsinline: 1, controls: 0, modestbranding: 1 },
      events: {
        onReady: () => {
          if (activeItem?.videoId) {
            playerRef.current.cueVideoById(activeItem.videoId);
          }
        },
        onStateChange: (event: any) => {
          if (event.data === window.YT.PlayerState.ENDED) {
            if (isDev) {
              console.log("[ENDED]", {
                currentIndex: currentIndexRef.current,
                repeatMode: repeatModeRef.current,
                shuffleMode: shuffleRef.current,
                queueLen: queueRef.current.length
              });
            }
            handleTrackEnded();
          }
          if (event.data === window.YT.PlayerState.PLAYING) {
            lastErrorRef.current = null;
          }
        },
        onError: (event: any) => {
          const videoId = activeVideoIdRef.current;
          const index = currentIndexRef.current;
          if (!videoId) return;
          if (isDev) {
            console.warn("[YT_ERROR]", { code: event?.data, index, videoId });
          }
          const last = lastErrorRef.current;
          if (!last || last.videoId !== videoId || last.index !== index) {
            lastErrorRef.current = { index, videoId, retries: 1 };
            playIndex(index, { retry: true });
            return;
          }
          if (last.retries < 1) {
            lastErrorRef.current = { ...last, retries: last.retries + 1 };
            playIndex(index, { retry: true });
            return;
          }
          lastErrorRef.current = null;
          const nextIndex = computeNextIndex(index);
          if (nextIndex !== null) {
            playIndex(nextIndex);
          } else {
            setIsPlaying(false);
          }
        }
      }
    });
  }, [apiReady, activeItem]);

  useEffect(() => {
    if (!playerRef.current || !activeItem) return;
    playerRef.current.loadVideoById(activeItem.videoId);
  }, [activeItem?.videoId]);

  useEffect(() => {
    if (queue.length === 0) {
      playerRef.current?.stopVideo?.();
      if (isPlaying) setIsPlaying(false);
    }
    if (queue.length > 0 && currentIndex >= queue.length && currentIndex !== 0) {
      setCurrentIndex(0);
    }
  }, [queue.length, currentIndex, isPlaying, setCurrentIndex, setIsPlaying]);

  useEffect(() => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.playVideo();
    } else {
      playerRef.current.pauseVideo();
    }
  }, [isPlaying]);

  const handleTrackEnded = () => {
    if (!queueRef.current.length) return;
    if (repeatModeRef.current === "one") {
      const videoId = activeVideoIdRef.current;
      if (videoId) restartCurrent(videoId);
      return;
    }
    const nextIndex = computeNextIndex(currentIndexRef.current);
    if (nextIndex === null) {
      setIsPlaying(false);
      return;
    }
    playIndex(nextIndex);
  };

  const handlePrev = () => {
    if (!queue.length) return;
    const time = playerRef.current?.getCurrentTime?.() ?? 0;
    if (time > 2) {
      playerRef.current?.seekTo?.(0, true);
      if (isPlaying) {
        playerRef.current?.playVideo?.();
      }
      return;
    }
    const prev = currentIndex - 1;
    if (prev >= 0) {
      setCurrentIndex(prev);
    } else if (repeatMode === "all") {
      setCurrentIndex(queue.length - 1);
    }
  };

  const normalizeVideoId = (value: string) => parseVideoId(value) || value;

  const computeNextIndex = (index: number) => {
    const items = queueRef.current;
    if (items.length === 0) return null;
    if (shuffleRef.current) {
      if (items.length === 1) return index;
      let nextIndex = index;
      let tries = 0;
      while (nextIndex === index && tries < 5) {
        nextIndex = Math.floor(Math.random() * items.length);
        tries += 1;
      }
      return nextIndex;
    }
    const next = index + 1;
    if (next < items.length) return next;
    return repeatModeRef.current === "all" ? 0 : null;
  };

  const playIndex = (index: number, options?: { retry?: boolean }) => {
    const items = queueRef.current;
    if (index < 0 || index >= items.length) return;
    const target = items[index];
    const videoId = normalizeVideoId(target.videoId || target.url);
    if (isDev) {
      console.log("[PLAY]", { index, videoId, title: target.title });
    }
    playerRef.current?.loadVideoById(videoId, 0);
    setCurrentIndex(index);
    setIsPlaying(true);
    if (options?.retry) {
      setTimeout(() => {
        const state = playerRef.current?.getPlayerState?.();
        if (state === window.YT?.PlayerState?.ENDED || state === window.YT?.PlayerState?.PAUSED) {
          playerRef.current?.loadVideoById(videoId, 0);
          playerRef.current?.playVideo();
        }
      }, 120);
    }
  };

  const restartCurrent = (videoId: string) => {
    if (!playerRef.current) return;
    playerRef.current.seekTo(0, true);
    playerRef.current.playVideo();
    setTimeout(() => {
      if (!playerRef.current) return;
      const state = playerRef.current.getPlayerState?.();
      if (state === window.YT?.PlayerState?.ENDED || state === window.YT?.PlayerState?.PAUSED) {
        playerRef.current.loadVideoById(videoId, 0);
        playerRef.current.playVideo();
      }
    }, 120);
  };

  const repeatLabel = useMemo(() => {
    if (repeatMode === "one") return "One";
    if (repeatMode === "all") return "All";
    return "Off";
  }, [repeatMode]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      <div
        className={`pointer-events-auto ${
          isMusicRoute
            ? "absolute left-1/2 top-20 w-[92vw] max-w-[960px]"
            : "absolute bottom-6 right-6 h-[160px] w-[240px]"
        } rounded-2xl overflow-hidden lifnux-glass transition-all duration-500`}
        style={isMusicRoute ? { aspectRatio: "16 / 9", transform: "translateX(-50%)" } : undefined}
      >
        <div ref={playerHostRef} className="h-full w-full" />
      </div>
      <div
        className={`pointer-events-auto ${
          isMusicRoute ? "absolute left-1/2" : "absolute bottom-6 right-6 translate-y-[170px]"
        } flex items-center gap-2 rounded-full lifnux-glass px-4 py-2 text-xs text-[var(--ink-1)]`}
        style={
          isMusicRoute
            ? {
                top: "calc(20px + (min(92vw, 960px) * 9 / 16) + 24px)",
                transform: "translateX(-50%)"
              }
            : undefined
        }
      >
        <button onClick={() => setIsPlaying(!isPlaying)}>{isPlaying ? "Pause" : "Play"}</button>
        <button onClick={handlePrev}>Prev</button>
        <button onClick={handleNext}>Next</button>
        <button onClick={() => setShuffle(!shuffle)} className={shuffle ? "text-[var(--accent-1)]" : ""}>
          Shuffle
        </button>
        <button
          onClick={() => setRepeatMode(repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off")}
          className={repeatMode !== "off" ? "text-[var(--accent-1)]" : ""}
        >
          Repeat {repeatLabel}
        </button>
      </div>
    </div>
  );
}
