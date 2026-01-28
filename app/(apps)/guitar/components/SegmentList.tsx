"use client";

import { formatSec } from "../lib/time";
import type { Segment } from "../types";

export function SegmentList({
  segments,
  onSelect,
  onDelete
}: {
  segments: Segment[];
  onSelect: (segment: Segment) => void;
  onDelete: (segment: Segment) => void;
}) {
  return (
    <div className="lifnux-glass rounded-2xl p-6">
      <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Segments</div>
      <div className="mt-4 space-y-2">
        {segments.map((segment) => (
          <div
            key={segment.id}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left text-sm"
          >
            <button className="flex-1 text-left" onClick={() => onSelect(segment)}>
              <div>{segment.name}</div>
              <div className="text-xs text-[var(--ink-1)]">
                {formatSec(segment.startSec)} - {formatSec(segment.endSec)} · {segment.speed}x
              </div>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)]">Loop</span>
              <button
                className="text-[10px] text-[var(--ink-1)] hover:text-[var(--accent-2)]"
                onClick={() => onDelete(segment)}
                aria-label="Delete segment"
              >
                X
              </button>
            </div>
          </div>
        ))}
        {segments.length === 0 ? <div className="text-sm text-[var(--ink-1)]">No segments yet.</div> : null}
      </div>
    </div>
  );
}
