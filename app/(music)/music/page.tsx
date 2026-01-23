"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "../../(shared)/components/AppShell";
import { Modal } from "../../(shared)/components/Modal";
import { Player } from "./components/Player";
import { Playlist } from "./components/Playlist";
import { TrackEditor } from "./components/TrackEditor";
import { useMusic } from "../../(shared)/components/MusicPlayerProvider";
import { loadState, saveState } from "../../(shared)/lib/storage";
import { parseVideoId } from "../../(shared)/lib/music";
import type { Preset, PresetTrack, QueueItem } from "../../(shared)/types/music";

declare global {
  interface Window {
    YT?: any;
  }
}

const PRESET_KEY = "lifnux.music.presets.v100";

export default function MusicPage() {
  const { queue, setQueue, currentIndex, setCurrentIndex, setIsPlaying } = useMusic();
  const [presets, setPresets] = useState<Preset[]>(() => loadState(PRESET_KEY, []));
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [expandedPresetId, setExpandedPresetId] = useState<string | null>(null);
  const [loadingPresetId, setLoadingPresetId] = useState<string | null>(null);
  const [presetItems, setPresetItems] = useState<Record<string, QueueItem[]>>({});
  const metaHostRef = useRef<HTMLDivElement | null>(null);
  const metaPlayerRef = useRef<any>(null);

  useEffect(() => {
    saveState(PRESET_KEY, presets);
  }, [presets]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (window.YT?.Player && metaHostRef.current && !metaPlayerRef.current) {
        metaPlayerRef.current = new window.YT.Player(metaHostRef.current, {
          height: "0",
          width: "0",
          playerVars: { controls: 0 },
          events: { onReady: () => undefined }
        });
        clearInterval(interval);
      }
    }, 300);
    return () => clearInterval(interval);
  }, []);

  const prefetchTitle = async (videoId: string) => {
    if (!metaPlayerRef.current) return videoId;
    metaPlayerRef.current.cueVideoById(videoId);
    return new Promise<string>((resolve) => {
      let tries = 0;
      const interval = setInterval(() => {
        tries += 1;
        const title = metaPlayerRef.current?.getVideoData()?.title;
        if (title && title !== "undefined") {
          clearInterval(interval);
          resolve(title);
        }
        if (tries > 10) {
          clearInterval(interval);
          resolve(videoId);
        }
      }, 200);
    });
  };

  const addToQueue = async (url: string) => {
    const videoId = parseVideoId(url) || url;
    const title = await prefetchTitle(videoId);
    const item: QueueItem = {
      id: crypto.randomUUID(),
      videoId,
      title,
      url
    };
    const next = [...queue, item];
    setQueue(next);
    if (next.length === 1) {
      setCurrentIndex(0);
      setIsPlaying(false);
    }
  };

  const buildPresetItems = async (preset: Preset): Promise<PresetTrack[]> => {
    if (preset.tracks?.length) return preset.tracks;
    const items: PresetTrack[] = [];
    for (const url of preset.urls) {
      const videoId = parseVideoId(url) || url;
      const title = await prefetchTitle(videoId);
      items.push({ id: crypto.randomUUID(), url, videoId, title });
    }
    return items;
  };

  const getPresetItems = async (preset: Preset) => {
    if (presetItems[preset.id]) return presetItems[preset.id];
    setLoadingPresetId(preset.id);
    const items = await buildPresetItems(preset);
    setPresetItems((prev) => ({ ...prev, [preset.id]: items }));
    setLoadingPresetId(null);
    return items;
  };

  const applyPreset = (items: QueueItem[], autoPlay: boolean) => {
    setQueue(items);
    setCurrentIndex(0);
    setIsPlaying(autoPlay);
  };

  const savePreset = (name: string) => {
    const urls = queue.map((item) => item.url);
    if (!name.trim() || urls.length === 0) return;
    const tracks: PresetTrack[] = queue.map((item) => ({
      id: item.id,
      videoId: item.videoId,
      title: item.title || item.videoId,
      url: item.url
    }));
    const next: Preset = { id: crypto.randomUUID(), name, urls, tracks };
    setPresets([...presets, next]);
  };

  return (
    <AppShell showTitle={false}>
      <div className="mx-auto w-full max-w-[1200px] pb-28 pt-10">
        <div className="mb-8">
          <h1 className="text-3xl">Lifnux Audio Hub</h1>
          <div className="text-sm text-[var(--ink-1)]">Curate queues and presets for your focus flow.</div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
          <aside className="space-y-4">
            <div className="lifnux-glass rounded-2xl p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Presets</div>
              <div className="mt-4 space-y-3 text-sm">
                {presets.map((preset) => {
                  const isOpen = expandedPresetId === preset.id;
                  const items = presetItems[preset.id] ?? preset.tracks;
                  return (
                    <div key={preset.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between">
                        <button
                          className="text-left"
                          onClick={async () => {
                            if (isOpen) {
                              setExpandedPresetId(null);
                              return;
                            }
                            setExpandedPresetId(preset.id);
                            if (!presetItems[preset.id]) {
                              await getPresetItems(preset);
                            }
                          }}
                        >
                          {preset.name}
                        </button>
                        <button
                          className="text-xs text-[var(--ink-1)]"
                          onClick={() => {
                            if (confirm("Delete this preset?")) {
                              setPresets(presets.filter((item) => item.id !== preset.id));
                            }
                          }}
                        >
                          X
                        </button>
                      </div>
                      {isOpen ? (
                        <div className="mt-3 space-y-3 text-xs text-[var(--ink-1)]">
                          <div className="space-y-2">
                            {loadingPresetId === preset.id ? (
                              <div>Loading...</div>
                            ) : items?.length ? (
                              items.map((item, index) => (
                                <div key={item.id} className="truncate">
                                  {index + 1}. {item.title || item.videoId}
                                </div>
                              ))
                            ) : (
                              <div>No tracks.</div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              className="rounded-full border border-white/10 px-3 py-1"
                              onClick={async () => {
                                const nextItems = await getPresetItems(preset);
                                applyPreset(nextItems, false);
                              }}
                            >
                              Load
                            </button>
                            <button
                              className="rounded-full bg-[var(--accent-1)] px-3 py-1 text-black"
                              onClick={async () => {
                                const nextItems = await getPresetItems(preset);
                                applyPreset(nextItems, true);
                              }}
                            >
                              Play
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {presets.length === 0 ? <div className="text-sm text-[var(--ink-1)]">No presets.</div> : null}
              </div>
            </div>
          </aside>

          <div className="space-y-6">
            <Player />

            <div className="lifnux-glass rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Queue</div>
                <div className="flex items-center gap-3 text-xs text-[var(--ink-1)]">
                  <button onClick={() => setPresetModalOpen(true)}>Save as preset</button>
                  <button
                    onClick={() => {
                      if (queue.length && confirm("Clear queue?")) {
                        setQueue([]);
                        setCurrentIndex(0);
                      }
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="mt-4 space-y-4">
                <TrackEditor onAdd={addToQueue} />
                <Playlist
                  queue={queue}
                  currentIndex={currentIndex}
                  onSelect={(index) => setCurrentIndex(index)}
                  onRemove={(id) => {
                    const index = queue.findIndex((item) => item.id === id);
                    const next = queue.filter((item) => item.id !== id);
                    setQueue(next);
                    if (index <= currentIndex && currentIndex > 0) {
                      setCurrentIndex(currentIndex - 1);
                    } else if (currentIndex >= next.length) {
                      setCurrentIndex(Math.max(0, next.length - 1));
                    }
                  }}
                  onReorder={(next) => {
                    const activeId = queue[currentIndex]?.id;
                    setQueue(next);
                    if (activeId) {
                      const nextIndex = next.findIndex((item) => item.id === activeId);
                      if (nextIndex >= 0) setCurrentIndex(nextIndex);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div ref={metaHostRef} className="hidden" />

      <Modal
        open={presetModalOpen}
        title="Save Preset"
        onClose={() => setPresetModalOpen(false)}
        actions={
          <>
            <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setPresetModalOpen(false)}>
              Cancel
            </button>
            <button
              className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black"
              onClick={() => {
                const nameInput = (document.getElementById("preset-name") as HTMLInputElement).value;
                savePreset(nameInput);
                setPresetModalOpen(false);
              }}
            >
              Save
            </button>
          </>
        }
      >
        <label className="block text-xs uppercase tracking-wide">
          Preset Name
          <input
            id="preset-name"
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            placeholder="Night Focus"
          />
        </label>
        <div className="text-xs text-[var(--ink-1)]">Current queue will be saved as a preset bundle.</div>
      </Modal>
    </AppShell>
  );
}
