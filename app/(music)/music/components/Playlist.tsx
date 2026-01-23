"use client";

import type { QueueItem } from "../../../(shared)/types/music";

export function Playlist({
  queue,
  currentIndex,
  onSelect,
  onRemove,
  onReorder
}: {
  queue: QueueItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onRemove: (id: string) => void;
  onReorder: (next: QueueItem[]) => void;
}) {
  return (
    <div className="space-y-2">
      {queue.map((item, index) => (
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
          className={`flex items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-sm ${
            index === currentIndex ? "bg-white/10" : "bg-black/20"
          }`}
        >
          <button className="text-left" onClick={() => onSelect(index)}>
            <div>{item.title}</div>
          </button>
          <button className="text-xs text-[var(--ink-1)]" onClick={() => onRemove(item.id)}>
            X
          </button>
        </div>
      ))}
      {queue.length === 0 ? <div className="text-sm text-[var(--ink-1)]">Queue is empty.</div> : null}
    </div>
  );
}
