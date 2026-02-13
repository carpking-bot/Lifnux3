"use client";
import { useRef } from "react";
import { resolveActivityIcon } from "../lib/icon";
export function ActivityIconRow({ types, selectedTypeId, onSelect }) {
    const railRef = useRef(null);
    const moveRail = (direction) => {
        const rail = railRef.current;
        if (!rail)
            return;
        rail.scrollBy({ left: direction === "left" ? -340 : 340, behavior: "smooth" });
    };
    return (<section className="rounded-2xl border border-[#223248] bg-[#0f1725] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs uppercase tracking-[0.2em] text-[#8ea7c0]">Activities</div>
        <div className="flex items-center gap-2">
          <button className="rounded-full border border-[#2b3b53] bg-[#0b1220] px-3 py-1 text-xs text-[#8ea7c0] hover:border-[#3a4f6d] hover:text-[#cfe2f7]" onClick={() => moveRail("left")}>
            Prev
          </button>
          <button className="rounded-full border border-[#2b3b53] bg-[#0b1220] px-3 py-1 text-xs text-[#8ea7c0] hover:border-[#3a4f6d] hover:text-[#cfe2f7]" onClick={() => moveRail("right")}>
            Next
          </button>
        </div>
      </div>
      <div ref={railRef} className="flex gap-2 overflow-x-auto pb-1 [scrollbar-color:#2d3f59_#0b1220]">
        {types.map((type) => {
            const selected = type.id === selectedTypeId;
            return (<button key={type.id} onClick={() => onSelect(type.id)} className={`min-w-[152px] rounded-xl border px-3 py-4 text-center transition ${selected
                    ? "border-[var(--accent-1)] bg-[rgba(90,214,208,0.16)] text-[var(--ink-0)]"
                    : "border-[#2a3a52] bg-[#0b1220] text-[#90a7c0] hover:border-[#3a4f6d] hover:text-[#d8e8f8]"}`}>
              <div className="text-2xl">{resolveActivityIcon(type.id, type.icon)}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.15em]">{type.name}</div>
            </button>);
        })}
      </div>
    </section>);
}
