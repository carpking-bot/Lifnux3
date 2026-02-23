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
  if (stage.type === "CUSTOM") return stage.customLabel || "커스텀";
  if (stage.type === "INTERVIEW_1") return "1차 면접";
  if (stage.type === "INTERVIEW_2") return "2차 면접";
  if (stage.type === "DOCUMENT") return "서류";
  return "최종";
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
  // Rule:
  // 1) Any failed stage means the process is done with FAIL.
  // 2) If the last stage is PASS, the process is done with PASS.
  // 3) Otherwise still in progress.
  const hasFail = app.stages.some((stage) => stage.result === "FAIL");
  if (hasFail) {
    return {
      ...app,
      status: "DONE",
      finalResult: "FAIL"
    };
  }
  const lastStage = app.stages[app.stages.length - 1];
  if (!lastStage || lastStage.result !== "PASS") {
    return { ...app, status: "IN_PROGRESS", finalResult: null };
  }
  return {
    ...app,
    status: "DONE",
    finalResult: "PASS"
  };
}
