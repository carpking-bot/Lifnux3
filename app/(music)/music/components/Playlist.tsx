"use client";

import { useState } from "react";
import type { QueueItem } from "../../../(shared)/types/music";

export function Playlist({
  queue,
  currentIndex,
  onSelect,
  onRemove,
  onReorder,
  onUpdateTitle
}: {
  queue: QueueItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onRemove: (id: string) => void;
  onReorder: (next: QueueItem[]) => void;
  onUpdateTitle: (id: string, customTitle: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const startEditing = (item: QueueItem) => {
    setEditingId(item.id);
    setDraftTitle(item.customTitle ?? item.title ?? "");
  };

  const commitEditing = (item: QueueItem) => {
    const nextTitle = draftTitle.trim();
    onUpdateTitle(item.id, nextTitle);
    setEditingId(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setDraftTitle("");
  };

  return (
    <div className="space-y-2">
      {queue.map((item, index) => {
        const isEditing = editingId === item.id;
        const displayTitle = item.customTitle || item.title || item.videoId;
        return (
          <div
            key={item.id}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", item.id);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const draggedId = event.dataTransfer.getData("text/plain");
              const fromIndex = queue.findIndex((entry) => entry.id === draggedId);
              if (fromIndex < 0 || fromIndex === index) return;
              const next = [...queue];
              const [moved] = next.splice(fromIndex, 1);
              next.splice(index, 0, moved);
              onReorder(next);
            }}
            className={`flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2 text-sm ${
              index === currentIndex ? "bg-white/10" : "bg-black/20"
            }`}
          >
            <button className="min-w-0 flex-1 text-left" onClick={() => onSelect(index)}>
              {isEditing ? (
                <input
                  className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onBlur={() => commitEditing(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      commitEditing(item);
                    } else if (event.key === "Escape") {
                      cancelEditing();
                    }
                  }}
                  autoFocus
                />
              ) : (
                <div className="truncate">{displayTitle}</div>
              )}
            </button>
            <div className="flex items-center gap-2">
              <button
                className="text-xs text-[var(--ink-1)]"
                onClick={(event) => {
                  event.stopPropagation();
                  startEditing(item);
                }}
              >
                ✎
              </button>
              <button
                className="text-xs text-[var(--ink-1)]"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(item.id);
                }}
              >
                X
              </button>
            </div>
          </div>
        );
      })}
      {queue.length === 0 ? <div className="text-sm text-[var(--ink-1)]">Queue is empty.</div> : null}
    </div>
  );
}
