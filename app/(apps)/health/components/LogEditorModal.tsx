"use client";

import { useEffect, useState } from "react";
import { PlainModal } from "./PlainModal";
import { todayDateKey } from "../lib/date";
import type { ActivityLog, ActivityLogDraft, ActivityType } from "../types";

type LogEditorModalProps = {
  open: boolean;
  selectedType: ActivityType;
  editingLog: ActivityLog | null;
  initialDateKey?: string;
  onClose: () => void;
  onSubmit: (draft: ActivityLogDraft) => void;
  onNotify: (message: string) => void;
};

type FormState = {
  loggedForDate: string;
  durationMin: string;
  memo: string;
  distanceKm: string;
  paceText: string;
  cadence: string;
  maxSpeedKmh: string;
  calorieOverride: string;
};

function toFormState(typeId: ActivityType["id"], log: ActivityLog | null, initialDateKey?: string): FormState {
  if (!log) {
    return {
      loggedForDate: initialDateKey || todayDateKey(),
      durationMin: "",
      memo: "",
      distanceKm: "",
      paceText: "",
      cadence: "",
      maxSpeedKmh: "",
      calorieOverride: ""
    };
  }
  return {
    loggedForDate: log.loggedForDate,
    durationMin: typeof log.durationMin === "number" ? String(log.durationMin) : "",
    memo: log.memo ?? "",
    distanceKm: (typeId === "running" || typeId === "walking" || typeId === "bicycle") && typeof log.distanceKm === "number" ? String(log.distanceKm) : "",
    paceText: typeId === "running" ? (log.paceText ?? "") : "",
    cadence: typeId === "running" && typeof log.cadence === "number" ? String(log.cadence) : "",
    maxSpeedKmh: typeId === "running" && typeof log.maxSpeedKmh === "number" ? String(log.maxSpeedKmh) : "",
    calorieOverride: typeof log.calorieOverride === "number" ? String(log.calorieOverride) : ""
  };
}

function fieldClassName() {
  return "w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-[var(--ink-0)] outline-none";
}

export function LogEditorModal({ open, selectedType, editingLog, initialDateKey, onClose, onSubmit, onNotify }: LogEditorModalProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(selectedType.id, editingLog, initialDateKey));
  const isDistanceType = selectedType.id === "running" || selectedType.id === "walking" || selectedType.id === "bicycle";

  useEffect(() => {
    if (!open) return;
    setForm(toFormState(selectedType.id, editingLog, initialDateKey));
  }, [open, selectedType.id, editingLog, initialDateKey]);

  const submit = () => {
    const durationMin = form.durationMin.trim() === "" ? undefined : Number(form.durationMin);
    if (typeof durationMin === "number" && (Number.isNaN(durationMin) || durationMin < 0)) {
      onNotify("Duration must be >= 0.");
      return;
    }

    const distanceKm = form.distanceKm.trim() === "" ? undefined : Number(form.distanceKm);
    if (typeof distanceKm === "number" && (Number.isNaN(distanceKm) || distanceKm <= 0)) {
      onNotify("Distance must be > 0 when provided.");
      return;
    }

    const cadence = form.cadence.trim() === "" ? undefined : Number(form.cadence);
    if (typeof cadence === "number" && Number.isNaN(cadence)) {
      onNotify("Cadence must be a number.");
      return;
    }

    const maxSpeedKmh = form.maxSpeedKmh.trim() === "" ? undefined : Number(form.maxSpeedKmh);
    if (typeof maxSpeedKmh === "number" && Number.isNaN(maxSpeedKmh)) {
      onNotify("Max speed must be a number.");
      return;
    }

    const calorieOverride = form.calorieOverride.trim() === "" ? undefined : Number(form.calorieOverride);
    if (typeof calorieOverride === "number" && (Number.isNaN(calorieOverride) || calorieOverride <= 0)) {
      onNotify("Calorie override must be > 0.");
      return;
    }

    onSubmit({
      typeId: selectedType.id,
      loggedForDate: form.loggedForDate || todayDateKey(),
      durationMin,
      memo: form.memo.trim() || undefined,
      distanceKm: isDistanceType ? distanceKm : undefined,
      paceText: selectedType.id === "running" ? (form.paceText.trim() || undefined) : undefined,
      cadence: selectedType.id === "running" ? cadence : undefined,
      maxSpeedKmh: selectedType.id === "running" ? maxSpeedKmh : undefined,
      calorieOverride
    });
  };

  return (
    <PlainModal
      open={open}
      title={editingLog ? `Edit ${selectedType.name} Log` : `Log ${selectedType.name} Workout`}
      onClose={onClose}
      actions={
        <>
          <button className="rounded-full border border-white/15 px-4 py-2 text-xs text-[var(--ink-1)]" onClick={onClose}>
            Cancel
          </button>
          <button className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black" onClick={submit}>
            Save
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-[var(--ink-1)]">
          Date
          <input
            type="date"
            className={fieldClassName()}
            value={form.loggedForDate}
            onChange={(event) => setForm((prev) => ({ ...prev, loggedForDate: event.target.value }))}
          />
        </label>
        <label className="text-xs text-[var(--ink-1)]">
          Duration (min)
          <input
            type="number"
            min={0}
            className={fieldClassName()}
            value={form.durationMin}
            onChange={(event) => setForm((prev) => ({ ...prev, durationMin: event.target.value }))}
          />
        </label>
        <label className="text-xs text-[var(--ink-1)] sm:col-span-2">
          Calorie Override
          <input
            type="number"
            min={1}
            className={fieldClassName()}
            value={form.calorieOverride}
            onChange={(event) => setForm((prev) => ({ ...prev, calorieOverride: event.target.value }))}
          />
        </label>
        <label className="text-xs text-[var(--ink-1)] sm:col-span-2">
          Memo
          <textarea
            rows={3}
            className={fieldClassName()}
            value={form.memo}
            onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))}
          />
        </label>
        {isDistanceType ? (
          <>
            <label className="text-xs text-[var(--ink-1)]">
              Distance (km)
              <input
                type="number"
                step="0.1"
                min="0.1"
                className={fieldClassName()}
                value={form.distanceKm}
                onChange={(event) => setForm((prev) => ({ ...prev, distanceKm: event.target.value }))}
              />
            </label>
            {selectedType.id === "running" ? (
              <>
                <label className="text-xs text-[var(--ink-1)]">
                  Pace Text
                  <input
                    type="text"
                    placeholder={`5'10"`}
                    className={fieldClassName()}
                    value={form.paceText}
                    onChange={(event) => setForm((prev) => ({ ...prev, paceText: event.target.value }))}
                  />
                </label>
                <label className="text-xs text-[var(--ink-1)]">
                  Cadence
                  <input
                    type="number"
                    className={fieldClassName()}
                    value={form.cadence}
                    onChange={(event) => setForm((prev) => ({ ...prev, cadence: event.target.value }))}
                  />
                </label>
                <label className="text-xs text-[var(--ink-1)]">
                  Max Speed (km/h)
                  <input
                    type="number"
                    step="0.1"
                    className={fieldClassName()}
                    value={form.maxSpeedKmh}
                    onChange={(event) => setForm((prev) => ({ ...prev, maxSpeedKmh: event.target.value }))}
                  />
                </label>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </PlainModal>
  );
}
