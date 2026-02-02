"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  Music2,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Shuffle,
  Repeat,
  Volume2,
  VolumeX
} from "lucide-react";
import { useMusic } from "./MusicPlayerProvider";
import { parseVideoId } from "../lib/music";
import { loadState, saveState } from "../lib/storage";

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

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function GlobalMusicPlayerOverlay() {
  const pathname = usePathname();
  const isMusicRoute = pathname?.startsWith("/music");
  const playerRef = useRef<any>(null);
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const resumeRef = useRef<{
    videoId: string;
    queueIndex: number;
    currentTime: number;
    isPlaying: boolean;
    repeatMode: "off" | "all" | "one";
    shuffle: boolean;
  } | null>(null);
  const resumeAppliedRef = useRef(false);
  const resumePendingRef = useRef(false);
  const [apiReady, setApiReady] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerState, setPlayerState] = useState<"PLAYING" | "PAUSED" | "OTHER">("OTHER");
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [resumePrompt, setResumePrompt] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [uiHidden, setUiHidden] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const {
    queue,
    currentIndex,
    setCurrentIndex,
    isPlaying,
    setIsPlaying,
    shuffle,
    repeatMode,
    setShuffle,
    setRepeatMode,
    ratings,
    setRating
  } = useMusic();
  const repeatModeRef = useRef(repeatMode);
  const activeVideoIdRef = useRef<string | null>(null);
  const queueRef = useRef(queue);
  const currentIndexRef = useRef(currentIndex);
  const shuffleRef = useRef(shuffle);
  const lastErrorRef = useRef<{ index: number; videoId: string; retries: number } | null>(null);
  const isDev = process.env.NODE_ENV === "development";
  const RESUME_KEY = "lifnux.music.resume.v110";
  const LAST_STATE_KEY = "music.lastState";
  const USER_INTERACTED_KEY = "music.userInteracted";
  const ONBOARDING_KEY = "music.onboardingDismissed";
  const UI_OPEN_KEY = "music.playerUIOpen";

  const markUserInteracted = useCallback(() => {
    if (userInteracted) return;
    setUserInteracted(true);
    saveState(USER_INTERACTED_KEY, true);
  }, [userInteracted]);

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

  useEffect(() => {
    if (!isMusicRoute) {
      setPortalTarget(null);
      return;
    }
    setPortalTarget(document.getElementById("music-player-portal"));
  }, [isMusicRoute]);

  useEffect(() => {
    const savedOpen = Boolean(loadState(UI_OPEN_KEY, false));
    if (!isMusicRoute && pathname === "/") {
      saveState(UI_OPEN_KEY, false);
      setExpanded(false);
      return;
    }
    setExpanded(isMusicRoute ? true : savedOpen);
  }, [isMusicRoute, pathname]);

  useEffect(() => {
    if (isMusicRoute) setUiHidden(false);
  }, [isMusicRoute]);

  useEffect(() => {
    const savedResume = loadState(RESUME_KEY, null);
    const lastState = loadState<{
      trackId?: string;
      volume?: number;
      position?: number;
    } | null>(LAST_STATE_KEY, null);
    if (lastState && Number.isFinite(lastState.volume)) {
      setVolume(Number(lastState.volume));
    }
    if (lastState) {
      resumeRef.current =
        savedResume ??
        ({
          videoId: lastState.trackId ?? "",
          queueIndex: 0,
          currentTime: lastState.position ?? 0,
          isPlaying: false,
          repeatMode: "off",
          shuffle: false
        } as typeof resumeRef.current);
    } else {
      resumeRef.current = savedResume;
    }
    setUserInteracted(Boolean(loadState(USER_INTERACTED_KEY, false)));
    setOnboardingDismissed(Boolean(loadState(ONBOARDING_KEY, false)));
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
  const coverUrl = activeItem?.videoId ? `https://i.ytimg.com/vi/${activeItem.videoId}/hqdefault.jpg` : null;
  const displayTitle = activeItem?.customTitle || activeItem?.title || "No track";
  const currentRating = activeItem ? ratings[activeItem.videoId] ?? 0 : 0;

  useEffect(() => {
    if (!apiReady || !playerHostRef.current) return;
    if (playerRef.current) return;
    playerRef.current = new window.YT.Player(playerHostRef.current, {
      height: "100%",
      width: "100%",
      playerVars: { playsinline: 1, controls: 0, modestbranding: 1 },
      events: {
        onReady: () => {
          setPlayerReady(true);
          if (activeItem?.videoId) {
            playerRef.current.cueVideoById(activeItem.videoId);
          }
        },
        onStateChange: (event: any) => {
          if (event.data === window.YT.PlayerState.PLAYING) setPlayerState("PLAYING");
          else if (event.data === window.YT.PlayerState.PAUSED) setPlayerState("PAUSED");
          else setPlayerState("OTHER");
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
    if (isPlaying) {
      playerRef.current.loadVideoById(activeItem.videoId);
    } else {
      playerRef.current.cueVideoById?.(activeItem.videoId);
    }
  }, [activeItem?.videoId, isPlaying]);

  useEffect(() => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.playVideo();
    } else {
      playerRef.current.pauseVideo();
    }
  }, [isPlaying, markUserInteracted]);

  useEffect(() => {
    if (isPlaying) setResumePrompt(false);
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) markUserInteracted();
  }, [isPlaying]);

  useEffect(() => {
    if (!playerRef.current) return;
    playerRef.current.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    if (!playerRef.current) return;
    if (muted) {
      playerRef.current.mute();
    } else {
      playerRef.current.unMute();
    }
  }, [muted]);

  useEffect(() => {
    if (!playerReady || !activeItem?.videoId) return;
    if (playerState !== "PLAYING" && playerState !== "PAUSED") return;
    const interval = setInterval(() => {
      if (!playerRef.current || isSeeking) return;
      const time = playerRef.current.getCurrentTime?.() ?? 0;
      const total = playerRef.current.getDuration?.() ?? 0;
      setCurrentTime(time);
      setDuration(total);
    }, 250);
    return () => clearInterval(interval);
  }, [playerReady, playerState, activeItem?.videoId, isSeeking]);

  useEffect(() => {
    if (!playerReady || !queue.length || resumeAppliedRef.current || !resumeRef.current) return;
    const saved = resumeRef.current;
    let targetIndex = saved.queueIndex;
    if (targetIndex < 0 || targetIndex >= queue.length || queue[targetIndex]?.videoId !== saved.videoId) {
      targetIndex = queue.findIndex((item) => item.videoId === saved.videoId);
    }
    if (targetIndex < 0) return;
    if (saved.shuffle !== shuffle) setShuffle(saved.shuffle);
    if (saved.repeatMode && saved.repeatMode !== repeatMode) setRepeatMode(saved.repeatMode);
    if (currentIndex !== targetIndex) {
      setCurrentIndex(targetIndex);
    }
    resumePendingRef.current = true;
  }, [playerReady, queue, queue.length, shuffle, repeatMode, currentIndex, setShuffle, setRepeatMode, setCurrentIndex]);

  useEffect(() => {
    if (!playerReady || !playerRef.current || !resumePendingRef.current) return;
    const saved = resumeRef.current;
    if (!saved || !activeItem?.videoId || activeItem.videoId !== saved.videoId) return;
    playerRef.current.seekTo?.(saved.currentTime || 0, true);
    setIsPlaying(false);
    if ((saved.currentTime ?? 0) > 0) {
      setResumePrompt(true);
    }
    resumePendingRef.current = false;
    resumeAppliedRef.current = true;
  }, [playerReady, activeItem?.videoId, setIsPlaying]);

  const persistResume = () => {
    if (!playerRef.current || !activeItem?.videoId || queue.length === 0) return;
    const time = playerRef.current.getCurrentTime?.() ?? 0;
    saveState(LAST_STATE_KEY, {
      trackId: activeItem.videoId,
      volume,
      position: time
    });
    saveState(RESUME_KEY, {
      videoId: activeItem.videoId,
      queueIndex: currentIndex,
      currentTime: time,
      repeatMode,
      shuffle
    });
  };

  useEffect(() => {
    if (!playerReady || !activeItem?.videoId) return;
    const interval = setInterval(() => {
      if (isSeeking) return;
      persistResume();
    }, 1000);
    return () => clearInterval(interval);
  }, [playerReady, activeItem?.videoId, isSeeking, isPlaying, repeatMode, shuffle, currentIndex]);

  useEffect(() => {
    const handleBeforeUnload = () => persistResume();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeItem?.videoId, isPlaying, repeatMode, shuffle, currentIndex]);

  useEffect(() => {
    if (queue.length === 0) {
      playerRef.current?.stopVideo?.();
      if (isPlaying) setIsPlaying(false);
    }
    if (queue.length > 0 && currentIndex >= queue.length && currentIndex !== 0) {
      setCurrentIndex(0);
    }
  }, [queue.length, currentIndex, isPlaying, setCurrentIndex, setIsPlaying]);

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

  useEffect(() => {
    const onPrev = () => handlePrev();
    window.addEventListener("lifnux:music-prev", onPrev);
    return () => window.removeEventListener("lifnux:music-prev", onPrev);
  }, [handlePrev]);

  const handleNext = () => {
    const nextIndex = computeNextIndex(currentIndexRef.current);
    if (nextIndex === null) {
      setIsPlaying(false);
      return;
    }
    playIndex(nextIndex);
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
    markUserInteracted();
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
    markUserInteracted();
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
    if (repeatMode === "one") return "ONE";
    if (repeatMode === "all") return "ALL";
    return "OFF";
  }, [repeatMode]);

  const showExpanded = isMusicRoute || expanded;
  const cardClass = isMusicRoute
    ? `pointer-events-auto w-full rounded-3xl lifnux-glass shadow-[0_30px_80px_rgba(0,0,0,0.5)] ${
        expanded ? "px-5 py-4" : "px-4 py-2"
      }`
    : `pointer-events-auto fixed bottom-6 left-1/2 w-[92vw] max-w-[720px] -translate-x-1/2 rounded-3xl lifnux-glass shadow-[0_30px_80px_rgba(0,0,0,0.5)] ${
        expanded ? "px-5 py-4" : "px-4 py-2"
      }`;

  const card = (
    <motion.div
      layout
      className={cardClass}
      animate={!isMusicRoute ? (expanded ? { y: 0 } : { y: 16 }) : undefined}
      transition={{ type: "spring", stiffness: 120, damping: 16 }}
    >
        {showExpanded ? (
          <motion.div layout className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 overflow-hidden rounded-2xl bg-white/5">
                {coverUrl ? (
                  <img src={coverUrl} alt="cover" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-white/10 to-white/5" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm text-[var(--ink-1)]">Now Playing</div>
                <div className="max-w-[260px] truncate text-base text-[var(--ink-0)]">{displayTitle}</div>
                <div className="flex items-center gap-1 text-[10px] text-[var(--ink-1)]">
                  {Array.from({ length: 5 }, (_, index) => {
                    const value = index + 1;
                    return (
                      <button
                        key={value}
                        className={currentRating >= value ? "text-[var(--accent-1)]" : "text-[var(--ink-1)]"}
                        onClick={() => activeItem && setRating(activeItem, value)}
                      >
                        ★
                      </button>
                    );
                  })}
                </div>
                <div className="text-xs text-[var(--ink-1)]">Lifnux Audio</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isMusicRoute ? (
                <Link
                  href="/music"
                  title="Open Music"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10"
                >
                  <Music2 className="h-4 w-4" />
                </Link>
              ) : null}
              {!isMusicRoute ? (
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10"
                  onClick={() => {
                    setExpanded(false);
                    saveState(UI_OPEN_KEY, false);
                  }}
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              ) : null}
              {!isMusicRoute ? (
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-[var(--ink-1)] hover:text-[var(--accent-2)]"
                  onClick={() => {
                    setIsPlaying(false);
                    setExpanded(false);
                    saveState(UI_OPEN_KEY, false);
                    setCurrentIndex(0);
                    setShuffle(false);
                    setRepeatMode("off");
                    setUiHidden(true);
                    setTimeout(() => {
                      playerRef.current?.stopVideo?.();
                    }, 0);
                  }}
                  aria-label="Close player"
                  title="Close player"
                >
                  X
                </button>
              ) : null}
            </div>
          </motion.div>
        ) : (
          <motion.div layout className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="h-9 w-9 overflow-hidden rounded-xl bg-white/5">
                {coverUrl ? (
                  <img src={coverUrl} alt="cover" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-white/10 to-white/5" />
                )}
              </div>
              <div className="truncate text-sm text-[var(--ink-0)]">{displayTitle}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10"
                onClick={() => {
                  if (!isPlaying) markUserInteracted();
                  setIsPlaying(!isPlaying);
                }}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              {resumePrompt ? (
                <button
                  className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em]"
                  onClick={() => {
                    markUserInteracted();
                    playerRef.current?.playVideo?.();
                    setIsPlaying(true);
                    setResumePrompt(false);
                  }}
                >
                  Resume
                </button>
              ) : null}
              <button className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10" onClick={handleNext}>
                <SkipForward className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2 pl-2">
                <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)]">Now Playing</span>
                {!isMusicRoute ? (
                  <Link
                    href="/music"
                    title="Open Music"
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10"
                  >
                    <Music2 className="h-3 w-3" />
                  </Link>
                ) : null}
                <button
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10"
                  onClick={() => {
                    setExpanded(true);
                    saveState(UI_OPEN_KEY, true);
                  }}
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {showExpanded ? (
          <motion.div
            className="mt-4 space-y-4"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="space-y-2">
              <input
                type="range"
                min={0}
                max={duration || 0}
                value={isSeeking ? currentTime : currentTime}
                onChange={(event) => {
                  if (duration <= 0) return;
                  setIsSeeking(true);
                  setCurrentTime(Number(event.target.value));
                }}
                onMouseUp={() => {
                  if (duration <= 0) return;
                  playerRef.current?.seekTo?.(currentTime, true);
                  setIsSeeking(false);
                }}
                onTouchEnd={() => {
                  if (duration <= 0) return;
                  playerRef.current?.seekTo?.(currentTime, true);
                  setIsSeeking(false);
                }}
                disabled={duration <= 0}
                className={`w-full ${duration <= 0 ? "opacity-40" : ""}`}
              />
              <div className="flex items-center justify-between text-xs text-[var(--ink-1)]">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/10 ${
                    shuffle ? "text-[var(--accent-1)]" : ""
                  }`}
                  onClick={() => setShuffle(!shuffle)}
                >
                  <Shuffle className="h-4 w-4" />
                </button>
                <button className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10" onClick={handlePrev}>
                  <SkipBack className="h-4 w-4" />
                </button>
                <button
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-1)] text-black"
                  onClick={() => {
                    if (!isPlaying) markUserInteracted();
                    setIsPlaying(!isPlaying);
                  }}
                >
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </button>
                {resumePrompt ? (
                  <button
                    className="rounded-full border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em]"
                    onClick={() => {
                      markUserInteracted();
                      playerRef.current?.playVideo?.();
                      setIsPlaying(true);
                      setResumePrompt(false);
                    }}
                  >
                    Resume
                  </button>
                ) : null}
                <button className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10" onClick={handleNext}>
                  <SkipForward className="h-4 w-4" />
                </button>
                <button
                  className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/10 ${
                    repeatMode !== "off" ? "text-[var(--accent-1)]" : ""
                  }`}
                  onClick={() =>
                    setRepeatMode(repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off")
                  }
                >
                  <Repeat className="h-4 w-4" />
                </button>
                <span className="text-[10px] text-[var(--ink-1)]">{repeatLabel}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--ink-1)]">
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10"
                  onClick={() => setMuted(!muted)}
                >
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                />
              </div>
            </div>
            {!userInteracted && !onboardingDismissed ? (
              <div className="flex items-center justify-between rounded-2xl border border-white/10 px-3 py-2 text-xs text-[var(--ink-1)]">
                <span>Press Play to start background music.</span>
                <button
                  className="text-[10px] uppercase tracking-[0.2em] text-[var(--ink-0)]"
                  onClick={() => {
                    setOnboardingDismissed(true);
                    saveState(ONBOARDING_KEY, true);
                  }}
                >
                  Got it
                </button>
              </div>
            ) : null}
          </motion.div>
        ) : null}
    </motion.div>
  );

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-40">
        <div className="absolute left-1/2 top-1/2 h-px w-px -translate-x-1/2 -translate-y-1/2 opacity-0">
          <div ref={playerHostRef} className="h-full w-full" />
        </div>
      </div>
      {uiHidden && !isMusicRoute
        ? null
        : portalTarget
        ? createPortal(card, portalTarget)
        : <div className="pointer-events-none fixed inset-0 z-40">{card}</div>}
    </>
  );
}
