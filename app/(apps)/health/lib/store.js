import { loadState, saveState } from "../../../(shared)/lib/storage";
const STORE_KEYS = {
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
function isDistanceTypeId(typeId) {
    return typeId === "running" || typeId === "walking" || typeId === "bicycle";
}
function defaultMainActivityTypes() {
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
function defaultTestActivityTypes() {
    return defaultMainActivityTypes().map((item) => ({ ...item }));
}
export class LocalStorageHealthStore {
    mode;
    keys;
    defaults;
    constructor(mode = "main") {
        this.mode = mode;
        this.keys = STORE_KEYS[mode];
        this.defaults = mode === "test" ? defaultTestActivityTypes() : defaultMainActivityTypes();
    }
    loadActivityTypes() {
        const loadedRaw = loadState(this.keys.types, []);
        const loaded = Array.isArray(loadedRaw) ? loadedRaw : [];
        if (loaded.length) {
            const migratedMap = new Map();
            const allowedIds = new Set(this.defaults.map((item) => item.id));
            for (const item of loaded) {
                if (!item || typeof item !== "object")
                    continue;
                if (typeof item.id !== "string")
                    continue;
                const id = item.id;
                if (!allowedIds.has(id)) continue;
                const legacyMode = item.planMode ?? (item.isPlanned ? "weekly" : "unplanned");
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
                if (!migratedMap.has(seeded.id))
                    migratedMap.set(seeded.id, seeded);
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
    saveActivityTypes(types) {
        saveState(this.keys.types, types);
    }
    updatePlanMode(typeId, planMode) {
        const now = nowIso();
        const types = this.loadActivityTypes().map((item) => (item.id === typeId ? { ...item, planMode, updatedAt: now } : item));
        this.saveActivityTypes(types);
        return types;
    }
    updateTarget(typeId, planMode, targetCount) {
        const now = nowIso();
        const types = this.loadActivityTypes().map((item) => {
            if (item.id !== typeId)
                return item;
            if (planMode === "weekly")
                return { ...item, weeklyTargetCount: targetCount, updatedAt: now };
            if (planMode === "monthly")
                return { ...item, monthlyTargetCount: targetCount, updatedAt: now };
            return item;
        });
        this.saveActivityTypes(types);
        return types;
    }
    loadActivityLogs() {
        const loadedRaw = loadState(this.keys.logs, []);
        const loaded = Array.isArray(loadedRaw) ? loadedRaw : [];
        if (this.mode !== "test") return loaded;
        let changed = false;
        const migrated = loaded.map((item) => {
            if (item.typeId === "test_distance") {
                changed = true;
                return { ...item, typeId: "running" };
            }
            if (item.typeId === "test_count") {
                changed = true;
                return { ...item, typeId: "home" };
            }
            return item;
        });
        if (changed) this.saveActivityLogs(migrated);
        return migrated;
    }
    saveActivityLogs(logs) {
        saveState(this.keys.logs, logs);
    }
    createActivityLog(draft) {
        const created = {
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
    updateActivityLog(id, draft) {
        const current = this.loadActivityLogs();
        const found = current.find((item) => item.id === id);
        if (!found)
            return null;
        const updated = {
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
    deleteActivityLog(id) {
        this.saveActivityLogs(this.loadActivityLogs().filter((item) => item.id !== id));
    }
    loadWeeklyTargets() {
        const loadedRaw = loadState(this.keys.weeklyTargets, []);
        const loaded = Array.isArray(loadedRaw) ? loadedRaw : [];
        if (this.mode !== "test") return loaded;
        const allowedIds = new Set(this.defaults.map((item) => item.id));
        const filtered = loaded.filter((item) => allowedIds.has(item.typeId));
        if (filtered.length !== loaded.length) this.saveWeeklyTargets(filtered);
        return filtered;
    }
    saveWeeklyTargets(targets) {
        saveState(this.keys.weeklyTargets, targets);
    }
    upsertWeeklyTarget(typeId, weekKey, targetCount) {
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
export function createHealthStore(mode = "main") {
    return new LocalStorageHealthStore(mode);
}
export const healthStore = createHealthStore("main");


