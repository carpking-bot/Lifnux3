import { loadState, saveState } from "../../../(shared)/lib/storage";
import type {
  ActivityLog,
  ActivityLogDraft,
  ActivityPlanMode,
  ActivityType,
  ActivityTypeId,
  ActivityWeeklyTarget
} from "../types";

export type HealthStoreMode = "main" | "test";

const STORE_KEYS: Record<HealthStoreMode, { types: string; logs: string; weeklyTargets: string }> = {
  main: {
    types: "lifnux.health.activityTypes.v1",
    logs: "lifnux.health.activityLogs.v1",
    weeklyTargets: "lifnux.health.weeklyTargets.v1"
  },
  test: {
    types: "lifnux.health.test.activityTypes.v1",
    logs: "lifnux.health.test.activityLogs.v1",
    weeklyTargets: "lifnux.health.test.weeklyTargets.v1"
  }
};

function nowIso() {
  return new Date().toISOString();
}

function isDistanceTypeId(typeId: ActivityTypeId) {
  return typeId === "running" || typeId === "walking" || typeId === "bicycle";
}

function defaultMainActivityTypes(): ActivityType[] {
  const now = nowIso();
  return [
    { id: "running", name: "Running", icon: "run", planMode: "weekly", weeklyTargetCount: 0, monthlyTargetCount: 0, createdAt: now, updatedAt: now },
    { id: "walking", name: "Walking", icon: "walk", planMode: "unplanned", weeklyTargetCount: 0, monthlyTargetCount: 0, createdAt: now, updatedAt: now },
    { id: "bicycle", name: "Bicycle", icon: "bicycle", planMode: "unplanned", weeklyTargetCount: 0, monthlyTargetCount: 0, createdAt: now, updatedAt: now },
    { id: "swimming", name: "Swimming", icon: "swim", planMode: "weekly", weeklyTargetCount: 3, monthlyTargetCount: 12, createdAt: now, updatedAt: now },
    { id: "home", name: "Home Training", icon: "home", planMode: "weekly", weeklyTargetCount: 3, monthlyTargetCount: 12, createdAt: now, updatedAt: now },
    { id: "soccer", name: "Soccer", icon: "soccer", planMode: "unplanned", weeklyTargetCount: 0, monthlyTargetCount: 0, createdAt: now, updatedAt: now },
    { id: "gym", name: "Gym", icon: "gym", planMode: "weekly", weeklyTargetCount: 0, monthlyTargetCount: 0, createdAt: now, updatedAt: now },
    { id: "tennis", name: "Tennis", icon: "tennis", planMode: "unplanned", weeklyTargetCount: 0, monthlyTargetCount: 0, createdAt: now, updatedAt: now }
  ];
}

function defaultTestActivityTypes(): ActivityType[] {
  return defaultMainActivityTypes().map((item) => ({ ...item }));
}

export interface HealthStore {
  loadActivityTypes(): ActivityType[];
  saveActivityTypes(types: ActivityType[]): void;
  updatePlanMode(typeId: ActivityTypeId, planMode: ActivityPlanMode): ActivityType[];
  updateTarget(typeId: ActivityTypeId, planMode: ActivityPlanMode, targetCount: number): ActivityType[];
  loadActivityLogs(): ActivityLog[];
  saveActivityLogs(logs: ActivityLog[]): void;
  createActivityLog(draft: ActivityLogDraft): ActivityLog;
  updateActivityLog(id: string, draft: ActivityLogDraft): ActivityLog | null;
  deleteActivityLog(id: string): void;
  loadWeeklyTargets(): ActivityWeeklyTarget[];
  saveWeeklyTargets(targets: ActivityWeeklyTarget[]): void;
  upsertWeeklyTarget(typeId: ActivityTypeId, weekKey: string, targetCount: number): ActivityWeeklyTarget[];
}

export class LocalStorageHealthStore implements HealthStore {
  private readonly mode: HealthStoreMode;
  private readonly keys: { types: string; logs: string; weeklyTargets: string };
  private readonly defaults: ActivityType[];

  constructor(mode: HealthStoreMode = "main") {
    this.mode = mode;
    this.keys = STORE_KEYS[mode];
    this.defaults = mode === "test" ? defaultTestActivityTypes() : defaultMainActivityTypes();
  }

  loadActivityTypes() {
    const loadedRaw = loadState<any>(this.keys.types, []);
    const loaded = Array.isArray(loadedRaw) ? loadedRaw : [];
    if (loaded.length) {
      const migratedMap = new Map<ActivityTypeId, ActivityType>();
      const allowedIds = new Set<ActivityTypeId>(this.defaults.map((item) => item.id));
      for (const item of loaded) {
        if (!item || typeof item !== "object") continue;
        if (typeof item.id !== "string") continue;
        const id = item.id as ActivityTypeId;
        if (!allowedIds.has(id)) continue;
        const legacyMode: ActivityPlanMode = item.planMode ?? (item.isPlanned ? "weekly" : "unplanned");
        migratedMap.set(id, {
          id,
          name: item.name,
          icon: typeof item.icon === "string" ? item.icon : item.id,
          planMode: legacyMode,
          weeklyTargetCount: Number.isFinite(item.weeklyTargetCount) ? item.weeklyTargetCount : 0,
          monthlyTargetCount: Number.isFinite(item.monthlyTargetCount)
            ? item.monthlyTargetCount
            : Number.isFinite(item.weeklyTargetCount)
              ? item.weeklyTargetCount * 4
              : 0,
          createdAt: item.createdAt ?? nowIso(),
          updatedAt: item.updatedAt ?? nowIso()
        });
      }
      for (const seeded of this.defaults) {
        if (!migratedMap.has(seeded.id)) migratedMap.set(seeded.id, seeded);
      }
      const migrated = [...migratedMap.values()];
      if (migrated.length) {
        this.saveActivityTypes(migrated);
        return migrated;
      }
      this.saveActivityTypes(this.defaults);
      return this.defaults;
    }
    this.saveActivityTypes(this.defaults);
    return this.defaults;
  }

  saveActivityTypes(types: ActivityType[]) {
    saveState(this.keys.types, types);
  }

  updatePlanMode(typeId: ActivityTypeId, planMode: ActivityPlanMode) {
    const now = nowIso();
    const types = this.loadActivityTypes().map((item) => (item.id === typeId ? { ...item, planMode, updatedAt: now } : item));
    this.saveActivityTypes(types);
    return types;
  }

  updateTarget(typeId: ActivityTypeId, planMode: ActivityPlanMode, targetCount: number) {
    const now = nowIso();
    const types = this.loadActivityTypes().map((item) => {
      if (item.id !== typeId) return item;
      if (planMode === "weekly") return { ...item, weeklyTargetCount: targetCount, updatedAt: now };
      if (planMode === "monthly") return { ...item, monthlyTargetCount: targetCount, updatedAt: now };
      return item;
    });
    this.saveActivityTypes(types);
    return types;
  }

  loadActivityLogs() {
    const loadedRaw = loadState<any>(this.keys.logs, []);
    const loaded = Array.isArray(loadedRaw) ? (loadedRaw as ActivityLog[]) : [];
    if (this.mode !== "test") return loaded;
    let changed = false;
    const migrated = loaded.map((item) => {
      if (item.typeId === "test_distance") {
        changed = true;
        return { ...item, typeId: "running" as ActivityTypeId };
      }
      if (item.typeId === "test_count") {
        changed = true;
        return { ...item, typeId: "home" as ActivityTypeId };
      }
      return item;
    });
    if (changed) this.saveActivityLogs(migrated);
    return migrated;
  }

  saveActivityLogs(logs: ActivityLog[]) {
    saveState(this.keys.logs, logs);
  }

  createActivityLog(draft: ActivityLogDraft) {
    const created: ActivityLog = {
      id: crypto.randomUUID(),
      typeId: draft.typeId,
      loggedForDate: draft.loggedForDate,
      durationMin: draft.durationMin,
      memo: draft.memo,
      createdAt: nowIso(),
      distanceKm: isDistanceTypeId(draft.typeId) ? draft.distanceKm : undefined,
      paceText: draft.typeId === "running" ? draft.paceText : undefined,
      cadence: draft.typeId === "running" ? draft.cadence : undefined,
      maxSpeedKmh: draft.typeId === "running" ? draft.maxSpeedKmh : undefined,
      calorieOverride: draft.calorieOverride
    };
    const next = [...this.loadActivityLogs(), created];
    this.saveActivityLogs(next);
    return created;
  }

  updateActivityLog(id: string, draft: ActivityLogDraft) {
    const current = this.loadActivityLogs();
    const found = current.find((item) => item.id === id);
    if (!found) return null;
    const updated: ActivityLog = {
      ...found,
      typeId: draft.typeId,
      loggedForDate: draft.loggedForDate,
      durationMin: draft.durationMin,
      memo: draft.memo,
      distanceKm: isDistanceTypeId(draft.typeId) ? draft.distanceKm : undefined,
      paceText: draft.typeId === "running" ? draft.paceText : undefined,
      cadence: draft.typeId === "running" ? draft.cadence : undefined,
      maxSpeedKmh: draft.typeId === "running" ? draft.maxSpeedKmh : undefined,
      calorieOverride: draft.calorieOverride
    };
    this.saveActivityLogs(current.map((item) => (item.id === id ? updated : item)));
    return updated;
  }

  deleteActivityLog(id: string) {
    this.saveActivityLogs(this.loadActivityLogs().filter((item) => item.id !== id));
  }

  loadWeeklyTargets() {
    const loadedRaw = loadState<any>(this.keys.weeklyTargets, []);
    const loaded = Array.isArray(loadedRaw) ? (loadedRaw as ActivityWeeklyTarget[]) : [];
    if (this.mode !== "test") return loaded;
    const allowedIds = new Set<ActivityTypeId>(this.defaults.map((item) => item.id));
    const filtered = loaded.filter((item) => allowedIds.has(item.typeId));
    if (filtered.length !== loaded.length) this.saveWeeklyTargets(filtered);
    return filtered;
  }

  saveWeeklyTargets(targets: ActivityWeeklyTarget[]) {
    saveState(this.keys.weeklyTargets, targets);
  }

  upsertWeeklyTarget(typeId: ActivityTypeId, weekKey: string, targetCount: number) {
    const current = this.loadWeeklyTargets();
    const now = nowIso();
    const existing = current.find((item) => item.typeId === typeId && item.weekKey === weekKey);
    if (existing) {
      const next = current.map((item) => (item.id === existing.id ? { ...item, targetCount, updatedAt: now } : item));
      this.saveWeeklyTargets(next);
      return next;
    }
    const next = [...current, { id: crypto.randomUUID(), typeId, weekKey, targetCount, createdAt: now, updatedAt: now }];
    this.saveWeeklyTargets(next);
    return next;
  }
}

export function createHealthStore(mode: HealthStoreMode = "main"): HealthStore {
  return new LocalStorageHealthStore(mode);
}

export const healthStore: HealthStore = createHealthStore("main");



