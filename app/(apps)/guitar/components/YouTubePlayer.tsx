"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const API_SRC = "https://www.youtube.com/iframe_api";

function loadYouTubeAPI() {
  if (typeof window === "undefined") return Promise.reject();
  if (window.YT?.Player) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const existing = document.querySelector(`script[src="${API_SRC}"]`);
    if (existing) {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      return;
    }
    const script = document.createElement("script");
    script.src = API_SRC;
    window.onYouTubeIframeAPIReady = () => resolve();
    document.body.appendChild(script);
  });
}

export function YouTubePlayer({
  videoId,
  onReady
}: {
  videoId?: string;
  onReady: (player: any) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const onReadyRef = useRef(onReady);
  const videoIdRef = useRef(videoId);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    videoIdRef.current = videoId;
  }, [videoId]);

  useEffect(() => {
    let mounted = true;
    loadYouTubeAPI().then(() => {
      if (!mounted || !hostRef.current) return;
      if (playerRef.current) return;
      playerRef.current = new window.YT.Player(hostRef.current, {
        height: "100%",
        width: "100%",
        videoId: videoId ?? "",
        playerVars: {
          rel: 0,
          modestbranding: 1
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            const latestVideoId = videoIdRef.current;
            if (playerRef.current && latestVideoId) {
              playerRef.current.cueVideoById?.(latestVideoId);
            }
            if (playerRef.current) onReadyRef.current(playerRef.current);
          }
        }
      });
    });
    return () => {
      mounted = false;
      readyRef.current = false;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!playerRef.current || !videoId || !readyRef.current) return;
    if (typeof playerRef.current.cueVideoById === "function") {
      playerRef.current.cueVideoById(videoId);
      return;
    }
    playerRef.current.loadVideoById?.(videoId);
  }, [videoId]);

  return <div ref={hostRef} className="absolute inset-0" />;
}
