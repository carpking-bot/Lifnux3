"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "../../(shared)/components/AppShell";
import { Modal } from "../../(shared)/components/Modal";
import { ConfirmModal } from "../../(shared)/components/ConfirmModal";
import { Playlist } from "./components/Playlist";
import { TrackEditor } from "./components/TrackEditor";
import { useMusic } from "../../(shared)/components/MusicPlayerProvider";
import { isRatingPresetName, parseVideoId } from "../../(shared)/lib/music";
import type { Preset, PresetTrack, QueueItem } from "../../(shared)/types/music";
import { Pencil } from "lucide-react";

declare global {
  interface Window {
    YT?: any;
  }
}

export default function MusicPage() {
  const {
    queue,
    setQueue,
    currentIndex,
    setCurrentIndex,
    setIsPlaying,
    presets,
    setPresets,
    selectedPresetId,
    setSelectedPresetId
  } = useMusic();
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [overwriteModalOpen, setOverwriteModalOpen] = useState(false);
  const [pendingPresetName, setPendingPresetName] = useState("");
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renamingPreset, setRenamingPreset] = useState<Preset | null>(null);
  const [expandedPresetId, setExpandedPresetId] = useState<string | null>(null);
  const [loadingPresetId, setLoadingPresetId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmDetail, setConfirmDetail] = useState<string | undefined>(undefined);
  const [confirmDanger, setConfirmDanger] = useState(false);
  const [confirmShowCancel, setConfirmShowCancel] = useState(true);
  const [confirmConfirmLabel, setConfirmConfirmLabel] = useState("Confirm");
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const metaHostRef = useRef<HTMLDivElement | null>(null);
  const metaPlayerRef = useRef<any>(null);

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

  const updatePreset = (presetId: string, updater: (preset: Preset) => Preset) => {
    setPresets(presets.map((preset) => (preset.id === presetId ? updater(preset) : preset)));
  };

  const getPresetItems = async (preset: Preset) => {
    if (preset.tracks?.length) return preset.tracks;
    setLoadingPresetId(preset.id);
    const items = await buildPresetItems(preset);
    updatePreset(preset.id, (current) => ({ ...current, tracks: items, urls: items.map((item) => item.url) }));
    setLoadingPresetId(null);
    return items;
  };

  const applyPreset = (items: QueueItem[], autoPlay: boolean) => {
    setQueue(items);
    setCurrentIndex(0);
    setIsPlaying(autoPlay);
  };

  const normalizeName = (value: string) => value.trim().toLowerCase();

  const buildPresetPayload = (name: string): Preset => {
    const tracks: PresetTrack[] = queue.map((item) => ({
      id: item.id,
      videoId: item.videoId,
      title: item.title || item.videoId,
      url: item.url,
      customTitle: item.customTitle
    }));
    return { id: crypto.randomUUID(), name: name.trim(), urls: tracks.map((item) => item.url), tracks };
  };

  const savePreset = (name: string, overwriteId?: string) => {
    const trimmed = name.trim();
    if (!trimmed || queue.length === 0) return;
    const payload = buildPresetPayload(trimmed);
    if (overwriteId) {
      updatePreset(overwriteId, (preset) => ({ ...preset, ...payload, id: preset.id }));
      return;
    }
    setPresets([...presets, payload]);
  };

  const openRename = (preset: Preset) => {
    setRenamingPreset(preset);
    setRenameModalOpen(true);
  };

  const applyRename = (nameInput: string) => {
    if (!renamingPreset) return;
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    if (isRatingPresetName(trimmed)) {
      openConfirmModal({
        title: "Preset Name",
        message: "별점 프리셋 이름은 사용할 수 없습니다.",
        showCancel: false,
        confirmLabel: "OK",
        onConfirm: () => undefined
      });
      return;
    }
    const normalizedName = normalizeName(trimmed);
    const match = presets.find(
      (preset) => preset.id !== renamingPreset.id && normalizeName(preset.name) === normalizedName
    );
    if (match) {
      openConfirmModal({
        title: "Preset Name",
        message: "같은 이름의 프리셋이 이미 있습니다.",
        showCancel: false,
        confirmLabel: "OK",
        onConfirm: () => undefined
      });
      return;
    }
    updatePreset(renamingPreset.id, (current) => ({ ...current, name: trimmed }));
    setRenameModalOpen(false);
    setRenamingPreset(null);
  };

  const isRatingPreset = (preset: Preset) => preset.isRatingPreset || isRatingPresetName(preset.name);

  const openConfirmModal = ({
    title,
    message,
    detail,
    danger = false,
    showCancel = true,
    confirmLabel = "Confirm",
    onConfirm
  }: {
    title: string;
    message: string;
    detail?: string;
    danger?: boolean;
    showCancel?: boolean;
    confirmLabel?: string;
    onConfirm: () => void;
  }) => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmDetail(detail);
    setConfirmDanger(danger);
    setConfirmShowCancel(showCancel);
    setConfirmConfirmLabel(confirmLabel);
    setConfirmAction(() => onConfirm);
    setConfirmOpen(true);
  };
  const closeConfirmModal = () => {
    setConfirmOpen(false);
    setConfirmAction(null);
    setConfirmDetail(undefined);
  };
  const handleConfirm = () => {
    if (confirmAction) confirmAction();
    closeConfirmModal();
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
                  const items = preset.tracks;
                  const selected = selectedPresetId === preset.id;
                  const ratingPreset = isRatingPreset(preset);
                  return (
                    <div
                      key={preset.id}
                      className={`rounded-xl border border-white/10 bg-black/20 p-3 ${selected ? "ring-1 ring-[var(--accent-1)]" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <button
                          className="flex-1 text-left"
                          onClick={async () => {
                            setSelectedPresetId(preset.id);
                            if (isOpen) {
                              setExpandedPresetId(null);
                              return;
                            }
                            setExpandedPresetId(preset.id);
                            await getPresetItems(preset);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span>{preset.name}</span>
                            {selected ? (
                              <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--accent-1)]">Selected</span>
                            ) : null}
                          </div>
                        </button>
                        {!ratingPreset ? (
                          <button
                            className="text-xs text-[var(--ink-1)] hover:text-[var(--accent-2)]"
                            onClick={(event) => {
                              event.stopPropagation();
                              openRename(preset);
                            }}
                            aria-label="Rename preset"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        ) : null}
                        {!ratingPreset ? (
                          <button
                            className="text-xs text-[var(--ink-1)]"
                            onClick={(event) => {
                              event.stopPropagation();
                              openConfirmModal({
                                title: "Delete Preset",
                                message: "Delete this preset?",
                                detail: preset.name,
                                danger: true,
                                confirmLabel: "Delete",
                                onConfirm: () => {
                                  setPresets(presets.filter((item) => item.id !== preset.id));
                                  if (selectedPresetId === preset.id) setSelectedPresetId(null);
                                  if (expandedPresetId === preset.id) setExpandedPresetId(null);
                                }
                              });
                            }}
                          >
                            X
                          </button>
                        ) : null}
                      </div>
                      {isOpen ? (
                        <div className="mt-3 space-y-3 text-xs text-[var(--ink-1)]">
                          <div className="space-y-2">
                            {loadingPresetId === preset.id ? (
                              <div>Loading...</div>
                            ) : items?.length ? (
                              items.map((item, index) => (
                                <div
                                  key={item.id}
                                  draggable={!ratingPreset}
                                  onDragStart={(event) => {
                                    if (ratingPreset) return;
                                    event.dataTransfer.setData("text/plain", item.id);
                                  }}
                                  onDragOver={(event) => {
                                    if (!ratingPreset) event.preventDefault();
                                  }}
                                  onDrop={(event) => {
                                    if (ratingPreset) return;
                                    const draggedId = event.dataTransfer.getData("text/plain");
                                    const fromIndex = items.findIndex((entry) => entry.id === draggedId);
                                    if (fromIndex < 0 || fromIndex === index) return;
                                    const next = [...items];
                                    const [moved] = next.splice(fromIndex, 1);
                                    next.splice(index, 0, moved);
                                    updatePreset(preset.id, (current) => ({
                                      ...current,
                                      tracks: next,
                                      urls: next.map((track) => track.url)
                                    }));
                                  }}
                                  className={`flex items-center justify-between gap-2 rounded-lg border border-white/5 px-2 py-1 ${
                                    ratingPreset ? "bg-black/10" : "bg-black/30"
                                  }`}
                                >
                                  <div className="min-w-0 flex-1 truncate">
                                    {index + 1}. {item.customTitle || item.title || item.videoId}
                                  </div>
                                  {!ratingPreset ? (
                                    <div className="flex items-center gap-1">
                                      <button
                                        className="px-1 text-[10px]"
                                        onClick={() => {
                                          if (index === 0) return;
                                          const next = [...items];
                                          [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                          updatePreset(preset.id, (current) => ({
                                            ...current,
                                            tracks: next,
                                            urls: next.map((track) => track.url)
                                          }));
                                        }}
                                      >
                                        Up
                                      </button>
                                      <button
                                        className="px-1 text-[10px]"
                                        onClick={() => {
                                          if (index === items.length - 1) return;
                                          const next = [...items];
                                          [next[index + 1], next[index]] = [next[index], next[index + 1]];
                                          updatePreset(preset.id, (current) => ({
                                            ...current,
                                            tracks: next,
                                            urls: next.map((track) => track.url)
                                          }));
                                        }}
                                      >
                                        Down
                                      </button>
                                      <button
                                        className="text-[10px] text-[var(--ink-1)]"
                                        onClick={() => {
                                          const next = items.filter((entry) => entry.id !== item.id);
                                          updatePreset(preset.id, (current) => ({
                                            ...current,
                                            tracks: next,
                                            urls: next.map((track) => track.url)
                                          }));
                                        }}
                                      >
                                        X
                                      </button>
                                    </div>
                                  ) : null}
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
            <div className="mx-auto w-full max-w-[720px]" id="music-player-portal" />

            <div className="lifnux-glass rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Queue</div>
                <div className="flex items-center gap-3 text-xs text-[var(--ink-1)]">
                  <button onClick={() => setPresetModalOpen(true)}>Save as preset</button>
                  <button
                    onClick={() => {
                      if (!queue.length) return;
                      openConfirmModal({
                        title: "Clear Queue",
                        message: "Clear queue?",
                        danger: true,
                        confirmLabel: "Delete",
                        onConfirm: () => {
                          setQueue([]);
                          setCurrentIndex(0);
                        }
                      });
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
                  onUpdateTitle={(id, customTitle) => {
                    const next = queue.map((item) =>
                      item.id === id ? { ...item, customTitle: customTitle ? customTitle : undefined } : item
                    );
                    setQueue(next);
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
                const normalizedName = normalizeName(nameInput);
                if (!normalizedName) return;
                if (isRatingPresetName(nameInput.trim())) {
                  openConfirmModal({
                    title: "Preset Name",
                    message: "별점 프리셋 이름은 사용할 수 없습니다.",
                    showCancel: false,
                    confirmLabel: "OK",
                    onConfirm: () => undefined
                  });
                  return;
                }
                const match = presets.find((preset) => normalizeName(preset.name) === normalizedName);
                if (match) {
                  setPendingPresetName(nameInput);
                  setOverwriteModalOpen(true);
                  return;
                }
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

      <Modal
        open={overwriteModalOpen}
        title="Overwrite Preset"
        onClose={() => setOverwriteModalOpen(false)}
        actions={
          <>
            <button
              className="rounded-full border border-white/10 px-4 py-2 text-xs"
              onClick={() => setOverwriteModalOpen(false)}
            >
              Cancel
            </button>
            <button
              className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black"
              onClick={() => {
                const normalizedName = normalizeName(pendingPresetName);
                const match = presets.find((preset) => normalizeName(preset.name) === normalizedName);
                if (match) {
                  savePreset(pendingPresetName, match.id);
                }
                setOverwriteModalOpen(false);
                setPresetModalOpen(false);
              }}
            >
              Overwrite
            </button>
          </>
        }
      >
        <div className="text-sm">같은 이름의 프리셋이 이미 있습니다. 덮어쓸까요?</div>
      </Modal>

      <Modal
        open={renameModalOpen}
        title="Rename Preset"
        onClose={() => {
          setRenameModalOpen(false);
          setRenamingPreset(null);
        }}
        actions={
          <>
            <button
              className="rounded-full border border-white/10 px-4 py-2 text-xs"
              onClick={() => {
                setRenameModalOpen(false);
                setRenamingPreset(null);
              }}
            >
              Cancel
            </button>
            <button
              className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black"
              onClick={() => {
                const nameInput = (document.getElementById("preset-rename") as HTMLInputElement).value;
                applyRename(nameInput);
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
            id="preset-rename"
            defaultValue={renamingPreset?.name ?? ""}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          />
        </label>
      </Modal>

      <ConfirmModal
        open={confirmOpen}
        title={confirmTitle}
        description={confirmMessage}
        detail={confirmDetail}
        confirmLabel={confirmConfirmLabel}
        cancelLabel="Cancel"
        variant={confirmDanger ? "danger" : "default"}
        showCancel={confirmShowCancel}
        onConfirm={handleConfirm}
        onCancel={closeConfirmModal}
      />
    </AppShell>
  );
}
