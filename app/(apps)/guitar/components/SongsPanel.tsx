"use client";

import React from "react";
import { Pencil } from "lucide-react";
import { Modal } from "../../../(shared)/components/Modal";
import type { Song } from "../types";

export function SongsPanel({
  songs,
  selectedSongId,
  onSelect,
  onSave,
  onUpdate,
  onDelete
}: {
  songs: Song[];
  selectedSongId?: string;
  onSelect: (id: string) => void;
  onSave: (song: Song) => void;
  onUpdate: (song: Song) => void;
  onDelete: (song: Song) => void;
}) {
  return (
    <div className="lifnux-glass rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Songs</div>
        <SongModal onSave={onSave} />
      </div>
      <div className="mt-4 max-h-[210px] space-y-2 overflow-y-auto pr-1 text-sm lifnux-scroll">
        {songs.map((song) => (
          <div
            key={song.id}
            className={`flex w-full items-start justify-between gap-3 rounded-xl border border-white/10 px-3 py-2 text-left ${
              selectedSongId === song.id ? "bg-white/10" : "bg-black/20"
            }`}
          >
            <button className="flex-1 text-left" onClick={() => onSelect(song.id)}>
              <span className="font-medium">{song.title}</span>
              <span className="block text-xs text-[var(--ink-1)]">
                {song.artist}
                {typeof song.difficulty === "number" ? ` · ${toStars(song.difficulty)}` : ""}
                {song.bpm ? ` · ${song.bpm} BPM` : ""}
              </span>
            </button>
            <div className="flex items-center gap-2 text-[10px] text-[var(--ink-1)]">
              <EditSongModal song={song} onUpdate={onUpdate} />
              <button
                className="hover:text-[var(--accent-2)]"
                onClick={() => onDelete(song)}
                aria-label="Delete song"
              >
                X
              </button>
            </div>
          </div>
        ))}
        {songs.length === 0 ? <div className="text-sm text-[var(--ink-1)]">No songs yet.</div> : null}
      </div>
    </div>
  );
}

function SongModal({ onSave }: { onSave: (song: Song) => void }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [artist, setArtist] = React.useState("");
  const [difficulty, setDifficulty] = React.useState("");
  const [bpm, setBpm] = React.useState("");

  return (
    <>
      <button className="text-xs" onClick={() => setOpen(true)}>
        Add
      </button>
      <Modal
        open={open}
        title="Add Song"
        onClose={() => setOpen(false)}
        actions={
          <>
            <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black"
              onClick={() => {
                if (!title.trim() || !artist.trim()) return;
                const bpmValue = bpm.trim() ? Number(bpm) : undefined;
                const difficultyValue = difficulty ? Number(difficulty) : undefined;
                onSave({
                  id: crypto.randomUUID(),
                  title: title.trim(),
                  artist: artist.trim(),
                  difficulty: Number.isFinite(difficultyValue) ? (difficultyValue as Song["difficulty"]) : undefined,
                  bpm: Number.isFinite(bpmValue) ? bpmValue : undefined,
                  createdAt: Date.now()
                });
                setTitle("");
                setArtist("");
                setDifficulty("");
                setBpm("");
                setOpen(false);
              }}
            >
              Save
            </button>
          </>
        }
      >
        <label className="block text-xs uppercase tracking-wide">
          Title
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="block text-xs uppercase tracking-wide">
          Artist
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            value={artist}
            onChange={(event) => setArtist(event.target.value)}
          />
        </label>
        <label className="block text-xs uppercase tracking-wide">
          Difficulty (optional)
          <select
            className="lifnux-select mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value)}
          >
            <option value="">Select</option>
            <option value="1">★☆☆☆☆ (1)</option>
            <option value="2">★★☆☆☆ (2)</option>
            <option value="3">★★★☆☆ (3)</option>
            <option value="4">★★★★☆ (4)</option>
            <option value="5">★★★★★ (5)</option>
          </select>
        </label>
        <label className="block text-xs uppercase tracking-wide">
          BPM (optional)
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            value={bpm}
            onChange={(event) => setBpm(event.target.value)}
            inputMode="numeric"
          />
        </label>
      </Modal>
    </>
  );
}

function EditSongModal({ song, onUpdate }: { song: Song; onUpdate: (song: Song) => void }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(song.title);
  const [artist, setArtist] = React.useState(song.artist);
  const [difficulty, setDifficulty] = React.useState(song.difficulty ? String(song.difficulty) : "");
  const [bpm, setBpm] = React.useState(song.bpm ? String(song.bpm) : "");

  React.useEffect(() => {
    if (!open) return;
    setTitle(song.title);
    setArtist(song.artist);
    setDifficulty(song.difficulty ? String(song.difficulty) : "");
    setBpm(song.bpm ? String(song.bpm) : "");
  }, [open, song]);

  return (
    <>
      <button
        className="text-[10px] text-[var(--ink-1)] hover:text-[var(--accent-2)]"
        onClick={() => setOpen(true)}
        aria-label="Edit song"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <Modal
        open={open}
        title="Edit Song"
        onClose={() => setOpen(false)}
        actions={
          <>
            <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black"
              onClick={() => {
                if (!title.trim() || !artist.trim()) return;
                const bpmValue = bpm.trim() ? Number(bpm) : undefined;
                const difficultyValue = difficulty ? Number(difficulty) : undefined;
                onUpdate({
                  ...song,
                  title: title.trim(),
                  artist: artist.trim(),
                  difficulty: Number.isFinite(difficultyValue) ? (difficultyValue as Song["difficulty"]) : undefined,
                  bpm: Number.isFinite(bpmValue) ? bpmValue : undefined
                });
                setOpen(false);
              }}
            >
              Save
            </button>
          </>
        }
      >
        <label className="block text-xs uppercase tracking-wide">
          Title
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="block text-xs uppercase tracking-wide">
          Artist
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            value={artist}
            onChange={(event) => setArtist(event.target.value)}
          />
        </label>
        <label className="block text-xs uppercase tracking-wide">
          Difficulty (optional)
          <select
            className="lifnux-select mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value)}
          >
            <option value="">Select</option>
            <option value="1">★☆☆☆☆ (1)</option>
            <option value="2">★★☆☆☆ (2)</option>
            <option value="3">★★★☆☆ (3)</option>
            <option value="4">★★★★☆ (4)</option>
            <option value="5">★★★★★ (5)</option>
          </select>
        </label>
        <label className="block text-xs uppercase tracking-wide">
          BPM (optional)
          <input
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            value={bpm}
            onChange={(event) => setBpm(event.target.value)}
            inputMode="numeric"
          />
        </label>
      </Modal>
    </>
  );
}

function toStars(value: number) {
  const safe = Math.min(5, Math.max(1, Math.round(value)));
  return `${"★".repeat(safe)}${"☆".repeat(5 - safe)}`;
}
