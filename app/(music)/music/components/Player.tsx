"use client";

import { useMusic } from "../../../(shared)/components/MusicPlayerProvider";

export function Player() {
  const { queue, currentIndex, isPlaying, setIsPlaying, setCurrentIndex } = useMusic();
  const current = queue[currentIndex];

  return (
    <div className="lifnux-glass rounded-2xl p-6">
      <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Now Playing</div>
      <div className="mt-3 text-2xl">{current ? current.title : "No track loaded"}</div>
      <div className="mt-4 flex gap-3 text-xs">
        <button
          className="rounded-full border border-white/10 px-3 py-2"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          className="rounded-full border border-white/10 px-3 py-2"
          onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
        >
          Prev
        </button>
        <button
          className="rounded-full border border-white/10 px-3 py-2"
          onClick={() => setCurrentIndex(Math.min(queue.length - 1, currentIndex + 1))}
        >
          Next
        </button>
      </div>
      <div className="mt-4 text-xs text-[var(--ink-1)]">
        Player stays active across pages. Use the overlay to control playback anytime.
      </div>
    </div>
  );
}
