"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
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
  const playerRef = useRef<any>(null);
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerState, setPlayerState] = useState<"PLAYING" | "PAUSED" | "OTHER">("OTHER");
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);

  const {
    queue,
    currentIndex,
    setCurrentIndex,
    isPlaying,
    setIsPlaying,
    shuffle,
    repeat,
    setShuffle,
    setRepeat
  } = useMusic();

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
  const coverUrl = activeItem?.videoId
    ? `https://i.ytimg.com/vi/${activeItem.videoId}/hqdefault.jpg`
    : null;

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
            handleNext();
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
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.playVideo();
    } else {
      playerRef.current.pauseVideo();
    }
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
    if (queue.length === 0) {
      playerRef.current?.stopVideo?.();
      if (isPlaying) setIsPlaying(false);
    }
    if (queue.length > 0 && currentIndex >= queue.length && currentIndex !== 0) {
      setCurrentIndex(0);
    }
  }, [queue.length, currentIndex, isPlaying, setCurrentIndex, setIsPlaying]);

  const handleNext = () => {
    if (!queue.length) return;
    if (repeat === "ONE") {
      playerRef.current?.seekTo(0);
      playerRef.current?.playVideo();
      return;
    }
    if (shuffle) {
      const nextIndex = Math.floor(Math.random() * queue.length);
      setCurrentIndex(nextIndex);
      return;
    }
    const next = currentIndex + 1;
    if (next < queue.length) {
      setCurrentIndex(next);
    } else if (repeat === "ALL") {
      setCurrentIndex(0);
    } else {
      setIsPlaying(false);
    }
  };

  const handlePrev = () => {
    if (!queue.length) return;
    const prev = currentIndex - 1;
    if (prev >= 0) {
      setCurrentIndex(prev);
    } else if (repeat === "ALL") {
      setCurrentIndex(queue.length - 1);
    }
  };

  const repeatLabel = useMemo(() => {
    if (repeat === "ONE") return "ONE";
    if (repeat === "ALL") return "ALL";
    return "OFF";
  }, [repeat]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      <div className="absolute left-1/2 top-1/2 h-px w-px -translate-x-1/2 -translate-y-1/2 opacity-0">
        <div ref={playerHostRef} className="h-full w-full" />
      </div>

      <motion.div
        layout
        className={`pointer-events-auto fixed bottom-6 left-1/2 w-[92vw] max-w-[720px] -translate-x-1/2 rounded-3xl lifnux-glass shadow-[0_30px_80px_rgba(0,0,0,0.5)] ${
          expanded ? "px-5 py-4" : "px-4 py-2"
        }`}
        animate={expanded ? { y: 0 } : { y: 16 }}
        transition={{ type: "spring", stiffness: 120, damping: 16 }}
      >
        {expanded ? (
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
                <div className="max-w-[260px] truncate text-base text-[var(--ink-0)]">
                  {activeItem?.title || "No track"}
                </div>
                <div className="text-xs text-[var(--ink-1)]">Lifnux Audio</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10"
                onClick={() => setExpanded(false)}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
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
              <div className="truncate text-sm text-[var(--ink-0)]">{activeItem?.title || "No track"}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10"
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10"
                onClick={handleNext}
              >
                <SkipForward className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2 pl-2">
                <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)]">Now Playing</span>
                <button
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10"
                  onClick={() => setExpanded(true)}
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {expanded ? (
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
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </button>
                <button className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10" onClick={handleNext}>
                  <SkipForward className="h-4 w-4" />
                </button>
                <button
                  className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/10 ${
                    repeat !== "OFF" ? "text-[var(--accent-1)]" : ""
                  }`}
                  onClick={() => setRepeat(repeat === "OFF" ? "ALL" : repeat === "ALL" ? "ONE" : "OFF")}
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
          </motion.div>
        ) : null}
      </motion.div>
    </div>
  );
}
