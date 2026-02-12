import { useMemo, useState } from "react";
import type { Goal, GoalDomain } from "../types";

type Props = {
  domains: GoalDomain[];
  goals: Goal[];
  onAddDomain: (name: string, color: string) => void;
  onRenameDomain: (id: string, name: string) => void;
  onChangeColor: (id: string, color: string) => void;
  onDeleteDomain: (id: string) => void;
};

export function DomainManagerPanel({ domains, goals, onAddDomain, onRenameDomain, onChangeColor, onDeleteDomain }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#67e8f9");
  const goalCountByDomain = useMemo(() => {
    const map = new Map<string, number>();
    goals.forEach((goal) => map.set(goal.domainId, (map.get(goal.domainId) ?? 0) + 1));
    return map;
  }, [goals]);

  return (
    <aside className="lifnux-glass h-fit rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Manage Domains</div>
        <button
          className={`rounded-full border px-3 py-1 text-[11px] ${isEditing ? "border-cyan-300/50 text-cyan-300" : "border-white/20 text-[var(--ink-1)]"}`}
          onClick={() => setIsEditing((prev) => !prev)}
        >
          {isEditing ? "DONE" : "EDIT"}
        </button>
      </div>
      <div className="space-y-2">
        {domains.map((domain) => {
          const linkedCount = goalCountByDomain.get(domain.id) ?? 0;
          return (
            <div key={domain.id} className="rounded-xl border border-white/10 bg-black/20 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: domain.color }} />
                  <input
                    value={domain.name}
                    onChange={(event) => onRenameDomain(domain.id, event.target.value)}
                    readOnly={!isEditing}
                    className={`min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white ${!isEditing ? "cursor-default opacity-80" : ""}`}
                  />
                </div>
                <span className="text-[11px] text-[var(--ink-1)]">{linkedCount}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <input
                  type="color"
                  value={domain.color}
                  onChange={(event) => onChangeColor(domain.id, event.target.value)}
                  disabled={!isEditing}
                  className="h-7 w-12 rounded border border-white/20 bg-transparent disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  className={`rounded-full border px-2 py-1 text-[11px] ${linkedCount > 0 ? "border-white/10 text-[var(--ink-1)]" : "border-rose-400/40 text-rose-300"}`}
                  disabled={!isEditing || linkedCount > 0}
                  onClick={() => onDeleteDomain(domain.id)}
                  title={!isEditing ? "Turn on EDIT mode to delete" : linkedCount > 0 ? `Linked goals: ${linkedCount}. Move goals first.` : "Delete domain"}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-2">
        <div className="text-xs text-[var(--ink-1)]">Add Domain</div>
        <div className="mt-2 flex gap-2">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="domain name"
            disabled={!isEditing}
            className="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60"
          />
          <input
            type="color"
            value={newColor}
            onChange={(event) => setNewColor(event.target.value)}
            disabled={!isEditing}
            className="h-7 w-10 rounded border border-white/20 bg-transparent disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            className="rounded-full border border-cyan-300/40 px-3 py-1 text-xs text-cyan-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-[var(--ink-1)]"
            disabled={!isEditing}
            onClick={() => {
              if (!newName.trim()) return;
              onAddDomain(newName.trim(), newColor);
              setNewName("");
            }}
          >
            Add
          </button>
        </div>
      </div>
    </aside>
  );
}
