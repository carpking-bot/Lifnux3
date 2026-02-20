import type { Application, Stage } from "../types";

export function createDefaultStageTemplate(): Stage[] {
  return [
    { stageId: crypto.randomUUID(), type: "DOCUMENT", submittedAt: null, resultAt: null, result: "PENDING", notes: "" },
    { stageId: crypto.randomUUID(), type: "INTERVIEW_1", submittedAt: null, resultAt: null, result: "PENDING", notes: "" },
    { stageId: crypto.randomUUID(), type: "INTERVIEW_2", submittedAt: null, resultAt: null, result: "PENDING", notes: "" },
    { stageId: crypto.randomUUID(), type: "FINAL", submittedAt: null, resultAt: null, result: "PENDING", notes: "" }
  ];
}

export function stageLabel(stage: Stage) {
  if (stage.type === "CUSTOM") return stage.customLabel || "Custom";
  if (stage.type === "INTERVIEW_1") return "Interview 1";
  if (stage.type === "INTERVIEW_2") return "Interview 2";
  if (stage.type === "DOCUMENT") return "Document";
  return "Final";
}

export function deriveCurrentStage(app: Application): Stage | null {
  const pending = app.stages.find((stage) => stage.result === "PENDING");
  return pending ?? app.stages[app.stages.length - 1] ?? null;
}

export function latestStageResultDate(app: Application): string | null {
  const dates = app.stages.map((stage) => stage.resultAt).filter((v): v is string => Boolean(v));
  if (!dates.length) return null;
  return [...dates].sort((a, b) => b.localeCompare(a))[0];
}

export function updatedAtForApplication(app: Application): string {
  const stageDates = app.stages
    .flatMap((stage) => [stage.submittedAt, stage.resultAt])
    .filter((v): v is string => Boolean(v));
  const all = [app.appliedAt, ...stageDates];
  return [...all].sort((a, b) => b.localeCompare(a))[0] ?? app.appliedAt;
}

export function autoDoneOnFinal(app: Application): Application {
  const finalStage = app.stages.find((stage) => stage.type === "FINAL");
  if (!finalStage || finalStage.result === "PENDING") return { ...app, status: "IN_PROGRESS", finalResult: null };
  return {
    ...app,
    status: "DONE",
    finalResult: finalStage.result
  };
}
