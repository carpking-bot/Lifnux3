import { loadState, saveState } from "../../../(shared)/lib/storage";
import type { Goal, GoalDomain, ProgressUpdate, WeeklyChecklistState } from "../types";

const GOALS_KEY = "lifnux.personalGrowth.goals.v2";
const DOMAINS_KEY = "lifnux.personalGrowth.domains.v1";
const UPDATES_KEY = "lifnux.personalGrowth.updates.v1";
const CHECKLIST_KEY = "lifnux.personalGrowth.weeklyChecklist.v1";
const LEGACY_GOALS_KEY = "lifnux.personalGrowth.goals.v1";

const SYSTEM_DOMAINS: Array<{ name: string; color: string }> = [
  { name: "Health", color: "#67e8f9" },
  { name: "Asset", color: "#86efac" },
  { name: "Investing", color: "#f9a8d4" },
  { name: "Career", color: "#fcd34d" },
  { name: "Personal", color: "#a5b4fc" }
];

function nowIso() {
  return new Date().toISOString();
}

function createDefaultDomains(): GoalDomain[] {
  const now = nowIso();
  return SYSTEM_DOMAINS.map((item, index) => ({
    id: item.name.toLowerCase(),
    name: item.name,
    color: item.color,
    order: index,
    isSystem: true,
    createdAt: now,
    updatedAt: now
  }));
}

function migrateGoal(legacy: any, domains: GoalDomain[]): Goal {
  const domainName = typeof legacy.domain === "string" ? legacy.domain : "Personal";
  const domain = domains.find((d) => d.name.toLowerCase() === domainName.toLowerCase()) ?? domains[0];
  const goalType =
    legacy.goalType ??
    (legacy.goalKind === "CHECKLIST" ? "CHECKLIST" : legacy.goalKind === "TARGET" ? "VALUE" : "COUNT");

  return {
    id: legacy.id ?? crypto.randomUUID(),
    scope: legacy.scope ?? "WEEKLY",
    domainId: legacy.domainId ?? domain.id,
    title: legacy.title ?? "Untitled",
    startDate: legacy.startDate,
    details: legacy.details ?? "",
    notes: legacy.notes ?? "",
    links: Array.isArray(legacy.links) ? legacy.links : [],
    importance: legacy.importance ?? "MIDDLE",
    status: legacy.status ?? "NOT_STARTED",
    deadline: legacy.deadline,
    goalType,
    trackingMode: legacy.trackingMode ?? "MANUAL",
    displayMode: legacy.displayMode ?? (goalType === "COUNT" ? "TRACKER" : "TARGET"),
    linkedSource: legacy.linkedSource,
    metric:
      goalType === "VALUE"
        ? {
            unit: legacy.metric?.unit ?? "",
            startValue: legacy.metric?.startValue,
            targetValue: legacy.metric?.targetValue
          }
        : undefined,
    countMetric:
      goalType === "COUNT"
        ? {
            countTarget: legacy.countMetric?.countTarget ?? 1,
            period: legacy.countMetric?.period ?? "WEEK",
            periodRange: legacy.countMetric?.periodRange,
            unitLabel: legacy.countMetric?.unitLabel ?? "times"
          }
        : undefined,
    checklistItems:
      goalType === "CHECKLIST"
        ? (legacy.checklistItems ?? []).map((item: any, idx: number) => ({
            id: item.id ?? crypto.randomUUID(),
            text: item.text ?? "",
            order: item.order ?? idx,
            isRequired: item.isRequired
          }))
        : undefined
  };
}

export interface PersonalGrowthStore {
  loadDomains(): GoalDomain[];
  saveDomains(domains: GoalDomain[]): void;
  loadGoals(): Goal[];
  saveGoals(goals: Goal[]): void;
  loadProgressUpdates(): ProgressUpdate[];
  saveProgressUpdates(updates: ProgressUpdate[]): void;
  loadWeeklyChecklistStates(): WeeklyChecklistState[];
  saveWeeklyChecklistStates(states: WeeklyChecklistState[]): void;
}

export class LocalStoragePersonalGrowthStore implements PersonalGrowthStore {
  loadDomains() {
    const loaded = loadState<GoalDomain[]>(DOMAINS_KEY, []);
    if (loaded.length) return loaded.sort((a, b) => a.order - b.order);
    const defaults = createDefaultDomains();
    this.saveDomains(defaults);
    return defaults;
  }

  saveDomains(domains: GoalDomain[]) {
    saveState(DOMAINS_KEY, domains);
  }

  loadGoals() {
    const domains = this.loadDomains();
    const current = loadState<Goal[]>(GOALS_KEY, []);
    if (current.length) return current;
    const legacy = loadState<any[]>(LEGACY_GOALS_KEY, []);
    if (!legacy.length) return [];
    const migrated = legacy.map((item) => migrateGoal(item, domains));
    this.saveGoals(migrated);
    return migrated;
  }

  saveGoals(goals: Goal[]) {
    saveState(GOALS_KEY, goals);
  }

  loadProgressUpdates() {
    return loadState<ProgressUpdate[]>(UPDATES_KEY, []);
  }

  saveProgressUpdates(updates: ProgressUpdate[]) {
    saveState(UPDATES_KEY, updates);
  }

  loadWeeklyChecklistStates() {
    return loadState<WeeklyChecklistState[]>(CHECKLIST_KEY, []);
  }

  saveWeeklyChecklistStates(states: WeeklyChecklistState[]) {
    saveState(CHECKLIST_KEY, states);
  }
}

export const personalGrowthStore: PersonalGrowthStore = new LocalStoragePersonalGrowthStore();
