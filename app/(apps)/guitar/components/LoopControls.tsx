"use client";

import { useState } from "react";
import { formatSec, parseTimeToSec } from "../lib/time";

export function LoopControls({
  aSec,
  bSec,
  speed,
  loopEnabled,
  onSetA,
  onSetB,
  onLoopToggle,
  onSpeedChange,
  onApplyRange,
  onSaveSegment
}: {
  aSec?: number;
  bSec?: number;
  speed: number;
  loopEnabled: boolean;
  onSetA: () => void;
  onSetB: () => void;
  onLoopToggle: () => void;
  onSpeedChange: (next: number) => void;
  onApplyRange: (startSec: number, endSec: number) => void;
  onSaveSegment: (payload: { name: string; startSec: number; endSec: number; speed: number }) => void;
}) {
  const [name, setName] = useState("");
  const [aInput, setAInput] = useState("");
  const [bInput, setBInput] = useState("");
  const [error, setError] = useState("");
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];

  return (
    <div className="lifnux-glass rounded-2xl p-6">
      <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Loop Controls</div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <button className="rounded-full border border-white/10 px-3 py-2 text-xs" onClick={onSetA}>
              Set A = current
            </button>
            <span className="text-xs text-[var(--ink-1)]">A: {aSec !== undefined ? formatSec(aSec) : "--:--"}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <button className="rounded-full border border-white/10 px-3 py-2 text-xs" onClick={onSetB}>
              Set B = current
            </button>
            <span className="text-xs text-[var(--ink-1)]">B: {bSec !== undefined ? formatSec(bSec) : "--:--"}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <input
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              placeholder="A (mm:ss)"
              value={aInput}
              onChange={(event) => setAInput(event.target.value)}
            />
            <input
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              placeholder="B (mm:ss)"
              value={bInput}
              onChange={(event) => setBInput(event.target.value)}
            />
          </div>
          {error ? <div className="text-xs text-[var(--accent-2)]">{error}</div> : null}
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-full border border-white/10 px-3 py-2 text-xs"
              onClick={() => {
                const aParsed = aInput ? parseTimeToSec(aInput) : aSec ?? null;
                const bParsed = bInput ? parseTimeToSec(bInput) : bSec ?? null;
                if (aParsed === null || bParsed === null) {
                  setError("Use mm:ss for start/end.");
                  return;
                }
                if (aParsed >= bParsed) {
                  setError("Start must be before end.");
                  return;
                }
                setError("");
                onApplyRange(aParsed, bParsed);
              }}
            >
              Apply
            </button>
            <button
              className="rounded-full bg-[var(--accent-1)] px-3 py-2 text-xs text-black"
              onClick={() => {
                const aParsed = aInput ? parseTimeToSec(aInput) : aSec ?? null;
                const bParsed = bInput ? parseTimeToSec(bInput) : bSec ?? null;
                if (aParsed === null || bParsed === null) {
                  setError("Use mm:ss for start/end.");
                  return;
                }
                if (aParsed >= bParsed) {
                  setError("Start must be before end.");
                  return;
                }
                setError("");
                onSaveSegment({ name: name.trim() || "Segment", startSec: aParsed, endSec: bParsed, speed });
                setName("");
                setAInput("");
                setBInput("");
              }}
            >
              Save Segment
            </button>
          </div>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">
            Speed
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {speeds.map((value) => (
              <button
                key={value}
                className={`rounded-full border border-white/10 px-3 py-2 ${
                  speed === value ? "bg-[var(--accent-1)] text-black" : "text-[var(--ink-1)]"
                }`}
                onClick={() => onSpeedChange(value)}
              >
                {value}x
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <div className="text-xs text-[var(--ink-1)]">Speed: {speed.toFixed(2)}x</div>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={speed}
              onChange={(event) => onSpeedChange(Number(event.target.value))}
              className="w-full accent-[var(--accent-1)]"
            />
          </div>
          <label className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">
            <input type="checkbox" checked={loopEnabled} onChange={onLoopToggle} />
            Loop
          </label>
          <label className="block text-xs uppercase tracking-wide">
            Segment Name
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Verse riff"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
