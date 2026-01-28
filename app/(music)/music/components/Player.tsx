"use client";

import { useEffect, useRef, useState } from "react";
import { useMusic } from "../../../(shared)/components/MusicPlayerProvider";
import { isRatingPresetName } from "../../../(shared)/lib/music";
import type { PresetTrack } from "../../../(shared)/types/music";

export function Player() {
  const {
    queue,
    currentIndex,
    isPlaying,
    setIsPlaying,
    setCurrentIndex,
    repeatMode,
    presets,
    setPresets,
    selectedPresetId,
    ratings,
    setRating
  } = useMusic();
  const current = queue[currentIndex];
  const currentTitle = current?.customTitle || current?.title || "No track loaded";
  const currentRating = current ? ratings[current.videoId] ?? 0 : 0;
  const [presetMessage, setPresetMessage] = useState("");
  const messageTimer = useRef<number | null>(null);
  const selectedPreset = selectedPresetId ? presets.find((preset) => preset.id === selectedPresetId) ?? null : null;
  const selectedIsRatingPreset = selectedPreset ? selectedPreset.isRatingPreset || isRatingPresetName(selectedPreset.name) : false;

  useEffect(() => {
    return () => {
      if (messageTimer.current) window.clearTimeout(messageTimer.current);
    };
  }, []);

  const flashMessage = (message: string) => {
    setPresetMessage(message);
    if (messageTimer.current) window.clearTimeout(messageTimer.current);
    messageTimer.current = window.setTimeout(() => setPresetMessage(""), 2000);
  };

  const addToPreset = () => {
    if (!current) {
      flashMessage("현재 곡이 없습니다.");
      return;
    }
    if (!selectedPresetId) {
      flashMessage("프리셋을 먼저 선택하세요.");
      return;
    }
    const target = presets.find((preset) => preset.id === selectedPresetId);
    if (!target) {
      flashMessage("선택된 프리셋을 찾을 수 없습니다.");
      return;
    }
    if (target.isRatingPreset || isRatingPresetName(target.name)) {
      flashMessage("별점 프리셋에는 추가할 수 없습니다.");
      return;
    }
    const tracks = target.tracks ?? [];
    if (tracks.some((item) => item.videoId === current.videoId)) {
      flashMessage("이미 추가된 곡입니다.");
      return;
    }
    const nextTrack: PresetTrack = {
      id: crypto.randomUUID(),
      videoId: current.videoId,
      title: current.title || current.videoId,
      url: current.url,
      customTitle: current.customTitle
    };
    setPresets(
      presets.map((preset) =>
        preset.id === target.id
          ? {
              ...preset,
              tracks: [...tracks, nextTrack],
              urls: [...tracks.map((item) => item.url), nextTrack.url]
            }
          : preset
      )
    );
    flashMessage("프리셋에 추가했습니다.");
  };

  return (
    <div className="lifnux-glass rounded-2xl p-6">
      <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Now Playing</div>
      <div className="mt-3 text-2xl">{currentTitle}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-1)]">
        {Array.from({ length: 5 }, (_, index) => {
          const value = index + 1;
          return (
            <button
              key={value}
              className={`text-lg ${currentRating >= value ? "text-[var(--accent-1)]" : "text-[var(--ink-1)]"}`}
              onClick={() => current && setRating(current, value)}
            >
              ★
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
        <button
          className="rounded-full border border-white/10 px-3 py-2"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          className="rounded-full border border-white/10 px-3 py-2"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("lifnux:music-prev"));
              return;
            }
            if (queue.length === 0) return;
            const prev = currentIndex - 1;
            if (prev >= 0) {
              setCurrentIndex(prev);
            } else if (repeatMode === "all") {
              setCurrentIndex(queue.length - 1);
            }
          }}
        >
          Prev
        </button>
        <button
          className="rounded-full border border-white/10 px-3 py-2"
          onClick={() => setCurrentIndex(Math.min(queue.length - 1, currentIndex + 1))}
        >
          Next
        </button>
        {selectedIsRatingPreset ? (
          <span className="text-[var(--ink-1)]">별점 프리셋은 편집할 수 없습니다.</span>
        ) : (
          <button className="rounded-full border border-white/10 px-3 py-2" onClick={addToPreset}>
            Add to Preset
          </button>
        )}
        {presetMessage ? <span className="text-[var(--accent-1)]">{presetMessage}</span> : null}
      </div>
      <div className="mt-4 text-xs text-[var(--ink-1)]">
        Player stays active across pages. Use the overlay to control playback anytime.
      </div>
    </div>
  );
}
