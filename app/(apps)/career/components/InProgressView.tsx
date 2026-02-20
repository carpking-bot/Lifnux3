import { deriveCurrentStage, stageLabel } from "../lib/stageHelpers";
import type { Application, JobPosting } from "../types";

type Props = {
  applications: Application[];
  postingMap: Map<string, JobPosting>;
  onOpen: (app: Application) => void;
};

export function InProgressView({ applications, postingMap, onOpen }: Props) {
  return (
    <div className="space-y-2">
      {applications.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-[var(--ink-1)]">No in-progress applications.</div>
      ) : (
        applications.map((app) => {
          const posting = postingMap.get(app.postingId);
          const current = deriveCurrentStage(app);
          return (
            <button key={app.applicationId} className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-left" onClick={() => onOpen(app)}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm text-white">{posting?.companyName ?? "Unknown"} · {posting?.postingTitle ?? "Missing posting"}</div>
                <div className="text-xs text-[var(--ink-1)]">Applied {app.appliedAt}</div>
                <div className="ml-auto rounded-full border border-cyan-300/40 px-2 py-1 text-[10px] text-cyan-300">{current ? stageLabel(current) : "-"}</div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {app.stages.map((stage) => (
                  <span key={stage.stageId} className={`rounded-full border px-2 py-0.5 text-[10px] ${stage.result === "PENDING" ? "border-white/20 text-[var(--ink-1)]" : stage.result === "PASS" ? "border-emerald-300/50 text-emerald-300" : "border-rose-400/50 text-rose-300"}`}>
                    {stageLabel(stage)}
                  </span>
                ))}
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
