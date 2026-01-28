"use client";

import React, { useState } from "react";
import { Music4, FileMusic, Play, Layers, Pencil } from "lucide-react";
import type { Song, Video, VideoType } from "../types";
import { parseVideoId } from "../../../(shared)/lib/music";
import { Modal } from "../../../(shared)/components/Modal";

const typeMeta: Record<VideoType, { label: string; color: string; icon: React.ReactNode }> = {
  BACKING: { label: "BACKING", color: "bg-emerald-500/20 text-emerald-100", icon: <Music4 className="h-3 w-3" /> },
  TAB: { label: "TAB", color: "bg-sky-500/20 text-sky-100", icon: <FileMusic className="h-3 w-3" /> },
  PRACTICE: { label: "PRACTICE", color: "bg-amber-500/20 text-amber-100", icon: <Play className="h-3 w-3" /> },
  OTHER: { label: "OTHER", color: "bg-white/10 text-[var(--ink-1)]", icon: <Layers className="h-3 w-3" /> }
};

export function VideosPanel({
  song,
  videos,
  selectedVideoId,
  onSelect,
  onSave,
  onUpdate,
  onDelete
}: {
  song?: Song;
  videos: Video[];
  selectedVideoId?: string;
  onSelect: (video: Video) => void;
  onSave: (video: Video) => void;
  onUpdate: (video: Video) => void;
  onDelete: (video: Video) => void;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<VideoType>("BACKING");
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  return (
    <div className="lifnux-glass rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Videos</div>
        <button className="text-xs" onClick={() => setOpen(true)} disabled={!song}>
          Add Video
        </button>
      </div>
      {song ? (
        <>
          <div className="mt-5 max-h-[320px] space-y-2 overflow-y-auto pr-1 lifnux-scroll">
            {videos.map((video) => {
              const meta = typeMeta[video.kind];
              const isEditing = editingId === video.id;
              const displayTitle = video.customTitle || video.youtubeTitle || "Untitled";
              return (
                <div
                  key={video.id}
                  className={`rounded-xl border border-white/10 px-3 py-3 text-left ${
                    selectedVideoId === video.id ? "bg-white/10" : "bg-black/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button className="flex-1 text-left" onClick={() => onSelect(video)}>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] ${meta.color}`}>
                          {meta.icon}
                          {meta.label}
                        </span>
                        {isEditing ? (
                          <input
                            className="flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm"
                            value={editingTitle}
                            onChange={(event) => setEditingTitle(event.target.value)}
                            onClick={(event) => event.stopPropagation()}
                          />
                        ) : (
                          <span className="text-sm">{displayTitle}</span>
                        )}
                      </div>
                      {video.notes ? <div className="mt-1 text-xs text-[var(--ink-1)]">{video.notes}</div> : null}
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-[10px] text-[var(--ink-1)]"
                        onClick={() => {
                          setEditingId(null);
                          setEditingTitle("");
                          setEditingVideo(video);
                          setUrl(video.youtubeId);
                          setTitle(video.customTitle || "");
                          setType(video.kind);
                          setNotes(video.notes || "");
                          setEditOpen(true);
                        }}
                        aria-label="Edit video"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="text-[10px] text-[var(--ink-1)] hover:text-[var(--accent-2)]"
                        onClick={() => onDelete(video)}
                        aria-label="Delete video"
                      >
                        X
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {videos.length === 0 ? <div className="text-sm text-[var(--ink-1)]">No videos yet.</div> : null}
          </div>

          <Modal
            open={open}
            title="Add Video"
            onClose={() => setOpen(false)}
            actions={
              <>
                <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button
                  className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black"
                  onClick={async () => {
                    const parsedId = parseVideoId(url.trim()) || url.trim();
                    if (!parsedId) return;
                    setSaving(true);
                    const fetchedTitle = await fetchYouTubeTitle(parsedId);
                    onSave({
                      id: crypto.randomUUID(),
                      songId: song.id,
                      youtubeId: parsedId,
                      kind: type,
                      customTitle: title.trim() || undefined,
                      youtubeTitle: fetchedTitle || undefined,
                      notes: notes.trim() || undefined,
                      createdAt: Date.now()
                    });
                    setUrl("");
                    setTitle("");
                    setNotes("");
                    setType("BACKING");
                    setSaving(false);
                    setOpen(false);
                  }}
                >
                  {saving ? "Adding..." : "Add"}
                </button>
              </>
            }
          >
            <input
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              placeholder="YouTube URL or ID"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <input
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              placeholder="Custom title (optional)"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                className="lifnux-select rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                value={type}
                onChange={(event) => setType(event.target.value as VideoType)}
              >
                <option value="BACKING">Backing</option>
                <option value="TAB">Tab</option>
                <option value="PRACTICE">Practice</option>
                <option value="OTHER">Other</option>
              </select>
              <input
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                placeholder="Notes (optional)"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </Modal>
          <Modal
            open={editOpen}
            title="Edit Video"
            onClose={() => {
              setEditOpen(false);
              setEditingVideo(null);
            }}
            actions={
              <>
                <button
                  className="rounded-full border border-white/10 px-4 py-2 text-xs"
                  onClick={() => {
                    setEditOpen(false);
                    setEditingVideo(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black"
                  onClick={async () => {
                    if (!editingVideo) return;
                    const parsedId = parseVideoId(url.trim()) || url.trim();
                    if (!parsedId) return;
                    setSaving(true);
                    const fetchedTitle = await fetchYouTubeTitle(parsedId);
                    onUpdate({
                      ...editingVideo,
                      youtubeId: parsedId,
                      kind: type,
                      customTitle: title.trim() || undefined,
                      youtubeTitle: fetchedTitle || editingVideo.youtubeTitle,
                      notes: notes.trim() || undefined
                    });
                    setSaving(false);
                    setEditOpen(false);
                    setEditingVideo(null);
                  }}
                >
                  Save
                </button>
              </>
            }
          >
            <input
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              placeholder="YouTube URL or ID"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <input
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              placeholder="Custom title (optional)"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                className="lifnux-select rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                value={type}
                onChange={(event) => setType(event.target.value as VideoType)}
              >
                <option value="BACKING">Backing</option>
                <option value="TAB">Tab</option>
                <option value="PRACTICE">Practice</option>
                <option value="OTHER">Other</option>
              </select>
              <input
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                placeholder="Notes (optional)"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </Modal>
        </>
      ) : (
        <div className="mt-4 text-sm text-[var(--ink-1)]">Select a song to manage videos.</div>
      )}
    </div>
  );
}

async function fetchYouTubeTitle(videoId: string) {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (!response.ok) return "";
    const data = (await response.json()) as { title?: string };
    return data.title ?? "";
  } catch {
    return "";
  }
}
