"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
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
    if (repeat === "ONE") return "One";
    if (repeat === "ALL") return "All";
    return "Off";
  }, [repeat]);

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
          onClick={() => setRepeat(repeat === "OFF" ? "ALL" : repeat === "ALL" ? "ONE" : "OFF")}
          className={repeat !== "OFF" ? "text-[var(--accent-1)]" : ""}
        >
          Repeat {repeatLabel}
        </button>
      </div>
    </div>
  );
}
