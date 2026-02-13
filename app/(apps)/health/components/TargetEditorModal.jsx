"use client";
import { useEffect, useState } from "react";
import { PlainModal } from "./PlainModal";
export function TargetEditorModal({ open, selectedType, currentTarget, weekLabel, onClose, onSave, onNotify }) {
    const [value, setValue] = useState(String(currentTarget));
    useEffect(() => {
        if (!open)
            return;
        setValue(String(currentTarget));
    }, [open, currentTarget]);
    const submit = () => {
        const parsed = Number(value);
        const max = selectedType.planMode === "monthly" ? 60 : 14;
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
            onNotify(`${selectedType.planMode === "monthly" ? "Monthly" : "Weekly"} target must be an integer between 0 and ${max}.`);
            return;
        }
        onSave(parsed);
    };
    return (<PlainModal open={open} title={`Edit ${selectedType.name} ${selectedType.planMode === "monthly" ? "Monthly" : "Weekly"} Target`} onClose={onClose} actions={<>
          <button className="rounded-full border border-white/15 px-4 py-2 text-xs text-[var(--ink-1)]" onClick={onClose}>
            Cancel
          </button>
          <button className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black" onClick={submit}>
            Save
          </button>
        </>}>
      <label className="text-xs text-[var(--ink-1)]">
        {selectedType.planMode === "monthly" ? "Monthly Target (0..60)" : "Weekly Target (0..14)"}
        <input type="number" min={0} max={selectedType.planMode === "monthly" ? 60 : 14} step={1} className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-[var(--ink-0)] outline-none" value={value} onChange={(event) => setValue(event.target.value)}/>
      </label>
      {selectedType.planMode === "weekly" ? (<div className="mt-2 text-xs text-[var(--ink-1)]">Applied week: {weekLabel}</div>) : null}
    </PlainModal>);
}
