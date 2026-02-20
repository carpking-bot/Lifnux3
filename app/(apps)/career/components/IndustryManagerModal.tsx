import { useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "../../../(shared)/components/ConfirmModal";
import { Modal } from "../../../(shared)/components/Modal";
import type { Industry, JobPosting } from "../types";

type Props = {
  open: boolean;
  industries: Industry[];
  postings: JobPosting[];
  onClose: () => void;
  onSave: (next: Industry[]) => void;
};

export function IndustryManagerModal({ open, industries, postings, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<Industry[]>([]);
  const [newName, setNewName] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(industries);
    setNewName("");
    setPendingDeleteId(null);
  }, [open, industries]);

  const usedIndustryIds = useMemo(() => new Set(postings.map((item) => item.industryId).filter((v): v is string => Boolean(v))), [postings]);

  const apply = () => onSave(draft);

  return (
    <>
      <Modal
        open={open}
        title="Manage Categories"
        onClose={onClose}
        closeOnBackdrop
        closeOnEsc
        actions={
          <>
            <button className="rounded-full border border-white/20 px-4 py-2 text-xs" onClick={onClose}>Close</button>
            <button className="rounded-full border border-cyan-300/50 px-4 py-2 text-xs text-cyan-300" onClick={apply}>Save</button>
          </>
        }
      >
        <div className="flex gap-2">
          <input className="flex-1 rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Industry name" />
          <button
            className="rounded-full border border-cyan-300/50 px-3 py-1 text-xs text-cyan-300"
            onClick={() => {
              if (!newName.trim()) return;
              setDraft((prev) => [...prev, { industryId: crypto.randomUUID(), name: newName.trim() }]);
              setNewName("");
            }}
          >
            Add
          </button>
        </div>

        <div className="space-y-2">
          {draft.map((industry) => {
            const used = usedIndustryIds.has(industry.industryId);
            return (
              <div key={industry.industryId} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-2">
                <input className="flex-1 rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-sm text-white" value={industry.name} onChange={(e) => setDraft((prev) => prev.map((item) => (item.industryId === industry.industryId ? { ...item, name: e.target.value } : item)))} />
                <button className="rounded-full border border-rose-400/50 px-2 py-1 text-xs text-rose-300 disabled:opacity-50" disabled={used} onClick={() => setPendingDeleteId(industry.industryId)}>Delete</button>
              </div>
            );
          })}
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(pendingDeleteId)}
        title="Delete Industry"
        description="Delete this industry category?"
        detail="Used categories cannot be deleted while postings reference them."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (!pendingDeleteId) return;
          if (usedIndustryIds.has(pendingDeleteId)) {
            window.alert("This category is used by postings. Remove references first.");
            setPendingDeleteId(null);
            return;
          }
          setDraft((prev) => prev.filter((item) => item.industryId !== pendingDeleteId));
          setPendingDeleteId(null);
        }}
      />
    </>
  );
}
