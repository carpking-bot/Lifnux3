"use client";

import { useState } from "react";

export function TrackEditor({ onAdd }: { onAdd: (url: string) => void }) {
  const [url, setUrl] = useState("");

  return (
    <div className="flex gap-2">
      <input
        className="flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
        placeholder="Paste YouTube link"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
      />
      <button
        className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black"
        onClick={() => {
          if (!url.trim()) return;
          onAdd(url.trim());
          setUrl("");
        }}
      >
        Add
      </button>
    </div>
  );
}
