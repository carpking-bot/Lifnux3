import { dateKeyFromDate, parseDateKey, todayDateKey } from "./date";
import type { ActivityLog, ActivityTypeId } from "../types";
import type { BadgeRuleRow } from "./gamificationConfig";

type ExtendedTypeId = ActivityTypeId;

export type BadgeItem = {
  id: string;
  name: string;
  description: string;
  image?: string;
  unlocked: boolean;
  achievedDate?: string;
  tier?: "normal" | "special";
};

export type StreakStats = {
  current: number;
  best: number;
  bestReachedDateByThreshold: Record<number, string | undefined>;
};

function nextDateKey(dateKey: string) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + 1);
  return dateKeyFromDate(date);
}

function allDateKeysBetween(startKey: string, endKey: string) {
  const keys: string[] = [];
  let cursor = startKey;
  while (cursor <= endKey) {
    keys.push(cursor);
    cursor = nextDateKey(cursor);
  }
  return keys;
}

function estimateCalories(log: ActivityLog) {
  if (typeof log.calorieOverride === "number" && log.calorieOverride > 0) return log.calorieOverride;
  const typeId = log.typeId as ExtendedTypeId;
  if (typeId === "running") return Math.max(0, (log.distanceKm ?? 0) * 80);
  if (typeId === "walking") return Math.max(0, (log.distanceKm ?? 0) * 40);
  if (typeId === "bicycle") return Math.max(0, (log.distanceKm ?? 0) * 30);
  if (typeId === "test_distance") return Math.max(0, (log.distanceKm ?? 0) * 60);
  if (typeId === "swimming") return 320;
  if (typeId === "test_count") return 300;
  if (typeId === "home") return Math.max(0, ((log.durationMin ?? 30) / 30) * 280);
  if (typeId === "soccer") return 600;
  if (typeId === "tennis") return Math.max(0, ((log.durationMin ?? 60) / 60) * 580);
  return 0;
}

export function calculateLogXP(log: Pick<ActivityLog, "typeId" | "distanceKm" | "durationMin" | "calorieOverride">) {
  return Math.floor(estimateCalories(log as ActivityLog) / 10);
}

function sortedLogs(logs: ActivityLog[]) {
  return [...logs].sort((a, b) => {
    if (a.loggedForDate !== b.loggedForDate) return a.loggedForDate.localeCompare(b.loggedForDate);
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function thresholdReachedDateForCount(logs: ActivityLog[], threshold: number) {
  if (threshold <= 0) return undefined;
  const ordered = sortedLogs(logs);
  if (ordered.length < threshold) return undefined;
  return ordered[threshold - 1].loggedForDate;
}

function thresholdReachedDateForDistance(logs: ActivityLog[], thresholdKm: number) {
  if (thresholdKm <= 0) return undefined;
  let sum = 0;
  for (const log of sortedLogs(logs)) {
    sum += log.distanceKm ?? 0;
    if (sum >= thresholdKm) return log.loggedForDate;
  }
  return undefined;
}

function monthDays(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const last = new Date(year, month, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, "0")}`);
}

function perfectMonths(logs: ActivityLog[]) {
  const days = new Set(logs.map((log) => log.loggedForDate));
  const months = [...new Set(logs.map((log) => log.loggedForDate.slice(0, 7)))].sort();
  return months
    .filter((monthKey) => monthDays(monthKey).every((day) => days.has(day)))
    .map((monthKey) => ({
      monthKey,
      achievedDate: `${monthKey}-${String(monthDays(monthKey).length).padStart(2, "0")}`
    }));
}

function monthNumberFromRuleId(ruleId: string) {
  const lowered = ruleId.toLowerCase();
  const map: Array<[string, number]> = [
    ["jan", 1],
    ["feb", 2],
    ["mar", 3],
    ["apr", 4],
    ["may", 5],
    ["jun", 6],
    ["jul", 7],
    ["aug", 8],
    ["sep", 9],
    ["oct", 10],
    ["nov", 11],
    ["dec", 12]
  ];
  for (const [token, month] of map) {
    if (lowered.includes(token)) return month;
  }
  return undefined;
}

function reachedDateForStreak(logs: ActivityLog[], threshold: number, baseDateKey = todayDateKey()) {
  if (threshold <= 0 || !logs.length) return undefined;
  const limit = parseDateKey(baseDateKey).getTime();
  const days = [...new Set(logs.map((log) => log.loggedForDate))]
    .filter((dayKey) => parseDateKey(dayKey).getTime() <= limit)
    .sort();
  let run = 0;
  let prevTime: number | null = null;
  for (const dayKey of days) {
    const time = parseDateKey(dayKey).getTime();
    if (prevTime === null) {
      run = 1;
    } else {
      const dayDiff = Math.round((time - prevTime) / 86400000);
      run = dayDiff === 1 ? run + 1 : 1;
    }
    if (run >= threshold) return dayKey;
    prevTime = time;
  }
  return undefined;
}

export function calculateStreak(logs: ActivityLog[], baseDateKey = todayDateKey()): StreakStats {
  if (!logs.length) return { current: 0, best: 0, bestReachedDateByThreshold: {} };
  const daySet = new Set(logs.map((log) => log.loggedForDate));
  const limit = parseDateKey(baseDateKey).getTime();
  const days = [...daySet]
    .filter((dayKey) => parseDateKey(dayKey).getTime() <= limit)
    .sort();

  let running = 0;
  let best = 0;
  const reached: Record<number, string | undefined> = {};
  let prevTime: number | null = null;
  for (const dayKey of days) {
    const time = parseDateKey(dayKey).getTime();
    if (prevTime === null) {
      running = 1;
    } else {
      const dayDiff = Math.round((time - prevTime) / 86400000);
      running = dayDiff === 1 ? running + 1 : 1;
    }
    if (running > best) best = running;
    if (running >= 7 && !reached[7]) reached[7] = dayKey;
    if (running >= 90 && !reached[90]) reached[90] = dayKey;
    if (running >= 365 && !reached[365]) reached[365] = dayKey;
    prevTime = time;
  }

  // Grace rule: if there is no workout today, keep yesterday's streak until day rollover.
  // The streak is broken only when the missed day is in the past.
  let current = 0;
  const anchorDate = parseDateKey(baseDateKey);
  if (!daySet.has(baseDateKey)) {
    anchorDate.setDate(anchorDate.getDate() - 1);
  }
  let cursor = dateKeyFromDate(anchorDate);
  while (daySet.has(cursor)) {
    current += 1;
    const prev = parseDateKey(cursor);
    prev.setDate(prev.getDate() - 1);
    cursor = dateKeyFromDate(prev);
  }

  return { current, best, bestReachedDateByThreshold: reached };
}

export function calculateDecay(rawDailyXp: Array<{ dateKey: string; xp: number }>, baseDateKey = todayDateKey()) {
  if (!rawDailyXp.length) return { finalXp: 0, totalDecayApplied: 0, missedDays: 0 };
  const map = new Map<string, number>();
  for (const item of rawDailyXp) map.set(item.dateKey, (map.get(item.dateKey) ?? 0) + item.xp);
  const start = rawDailyXp.map((item) => item.dateKey).sort()[0];
  const days = allDateKeysBetween(start, baseDateKey);

  let xp = 0;
  let missedStreak = 0;
  let missedDays = 0;
  let totalDecayApplied = 0;

  for (const dayKey of days) {
    const dailyXp = map.get(dayKey) ?? 0;
    if (dailyXp > 0) {
      xp += dailyXp;
      missedStreak = 0;
      continue;
    }
    missedStreak += 1;
    missedDays += 1;
    const decayPct = missedStreak === 1 ? 0.02 : missedStreak === 2 ? 0.03 : missedStreak === 3 ? 0.04 : 0.05;
    const before = xp;
    xp = Math.max(0, xp * (1 - decayPct));
    totalDecayApplied += before - xp;
  }

  return { finalXp: Math.floor(xp), totalDecayApplied: Math.floor(totalDecayApplied), missedDays };
}

export function calculateTotalXP(logs: ActivityLog[], baseDateKey = todayDateKey()) {
  const dailyRawMap = new Map<string, number>();
  for (const log of logs) {
    const xp = Math.floor(estimateCalories(log) / 10);
    dailyRawMap.set(log.loggedForDate, (dailyRawMap.get(log.loggedForDate) ?? 0) + xp);
  }
  const rawDailyXp = [...dailyRawMap.entries()].map(([dateKey, xp]) => ({ dateKey, xp }));
  const rawXp = rawDailyXp.reduce((sum, item) => sum + item.xp, 0);
  const decay = calculateDecay(rawDailyXp, baseDateKey);
  return { rawXp, finalXp: decay.finalXp, totalDecayApplied: decay.totalDecayApplied, missedDays: decay.missedDays };
}

function minXpForLevel(level: number, levelTable?: Array<{ level: number; minXp: number }>) {
  if (levelTable?.length) {
    const sorted = [...levelTable].sort((a, b) => a.level - b.level);
    if (level <= sorted[0].level) return sorted[0].minXp;
    const maxDefined = sorted[sorted.length - 1];
    if (level <= maxDefined.level) {
      const found = sorted.find((row) => row.level === level);
      return found ? found.minXp : sorted[0].minXp;
    }
    let xp = maxDefined.minXp;
    for (let lv = maxDefined.level + 1; lv <= level; lv += 1) xp += lv * 300;
    return xp;
  }
  const table = [0, 200, 500, 900, 1500, 2300, 3300, 4500, 6000, 8000];
  if (level <= 10) return table[level - 1];
  let prev = table[9];
  for (let lv = 11; lv <= level; lv += 1) prev += lv * 300;
  return prev;
}

export function calculateLevel(xp: number, levelTable?: Array<{ level: number; minXp: number }>) {
  let level = 1;
  while (minXpForLevel(level + 1, levelTable) <= xp) level += 1;
  const currentThreshold = minXpForLevel(level, levelTable);
  const nextThreshold = minXpForLevel(level + 1, levelTable);
  const required = Math.max(1, nextThreshold - currentThreshold);
  const progress = Math.max(0, xp - currentThreshold);
  return {
    level,
    currentThreshold,
    nextThreshold,
    required,
    progress,
    progressPct: Math.max(0, Math.min(100, (progress / required) * 100))
  };
}

function specialBadgeForActivity(typeId: ExtendedTypeId, count: number, distance: number): BadgeItem[] {
  if (typeId === "soccer") return [{ id: "special-soccer", name: "\uBC1C\uB871\uB3C4\uB974", description: "\uCD95\uAD6C 100\uD68C \uB2EC\uC131", unlocked: count >= 100, tier: "special" }];
  if (typeId === "tennis") return [{ id: "special-tennis", name: "\uADF8\uB79C\uB4DC \uC2AC\uB7A8", description: "\uD14C\uB2C8\uC2A4 100\uD68C \uB2EC\uC131", unlocked: count >= 100, tier: "special" }];
  if (typeId === "swimming") return [{ id: "special-swim", name: "\uC778\uAC04 \uBB3C\uACE0\uAE30", description: "\uC218\uC601 100\uD68C \uB2EC\uC131", unlocked: count >= 100, tier: "special" }];
  if (typeId === "running") return [{ id: "special-running", name: "\uC11C\uC6B8 to \uBD80\uC0B0", description: "\uB7EC\uB2DD 400km \uB2EC\uC131", unlocked: distance >= 400, tier: "special" }];
  if (typeId === "walking") return [{ id: "special-walk", name: "\uD55C\uAC15 \uC885\uC8FC", description: "\uAC77\uAE30 300km \uB2EC\uC131", unlocked: distance >= 300, tier: "special" }];
  if (typeId === "home") return [{ id: "special-home", name: "\uC0AC\uC774\uD0C0\uB9C8", description: "\uD648 \uD2B8\uB808\uC774\uB2DD 100\uD68C \uB2EC\uC131", unlocked: count >= 100, tier: "special" }];
  return [];
}

function activityLabelKo(typeId: ExtendedTypeId) {
  if (typeId === "running") return "\uB7EC\uB2DD";
  if (typeId === "walking") return "\uAC77\uAE30";
  if (typeId === "bicycle") return "\uC790\uC804\uAC70";
  if (typeId === "test_distance") return "테스트 거리";
  if (typeId === "test_count") return "테스트 횟수";
  if (typeId === "swimming") return "\uC218\uC601";
  if (typeId === "home") return "\uD648 \uD2B8\uB808\uC774\uB2DD";
  if (typeId === "soccer") return "\uCD95\uAD6C";
  if (typeId === "gym") return "\uD5EC\uC2A4";
  return "\uD14C\uB2C8\uC2A4";
}

function applyBadgeTextTemplate(template: string | undefined, vars: Record<string, string | number>) {
  if (!template) return "";
  let text = template;
  Object.entries(vars).forEach(([key, value]) => {
    text = text.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  });
  return text;
}

export function generateBadges(logs: ActivityLog[], selectedTypeId: ActivityTypeId, baseDateKey = todayDateKey()) {
  return generateBadgesByRules(logs, selectedTypeId, undefined, baseDateKey);
}

export function generateBadgesByRules(
  logs: ActivityLog[],
  selectedTypeId: ActivityTypeId,
  badgeRules?: BadgeRuleRow[],
  baseDateKey = todayDateKey()
) {
  if (badgeRules && badgeRules.length) {
    const streak = calculateStreak(logs, baseDateKey);
    const months = perfectMonths(logs);
    const globalBadges: BadgeItem[] = [];
    const activityBadges: BadgeItem[] = [];

    const push = (scope: "global" | "activity", item: BadgeItem) => {
      if (scope === "global") globalBadges.push(item);
      else activityBadges.push(item);
    };

    for (const rule of badgeRules) {
      const targetActivity = rule.activity || selectedTypeId;
      if (rule.scope === "activity" && targetActivity !== selectedTypeId) continue;
      const targetLogs = rule.scope === "global" ? logs : logs.filter((log) => log.typeId === targetActivity);
      const count = targetLogs.length;
      const distance = targetLogs.reduce((sum, log) => sum + (log.distanceKm ?? 0), 0);

      if (rule.rule === "streak_best_at_least") {
        const t = Math.max(1, rule.threshold ?? 1);
        push(rule.scope, {
          id: rule.id,
          name: rule.name,
          description: rule.description,
          image: rule.image,
          unlocked: streak.best >= t,
          achievedDate: streak.best >= t ? reachedDateForStreak(logs, t, baseDateKey) : undefined
        });
        continue;
      }

      if (rule.rule === "perfect_month_any") {
        const fixedMonth = monthNumberFromRuleId(rule.id);
        if (fixedMonth) {
          const matched = months.filter((month) => Number(month.monthKey.slice(5, 7)) === fixedMonth);
          if (matched.length) {
            const latest = matched[matched.length - 1];
            push("global", {
              id: rule.id,
              name: rule.name || `${fixedMonth}월의 지배자`,
              description: rule.description || `${latest.monthKey} 한 달 개근`,
              image: rule.image,
              unlocked: true,
              achievedDate: latest.achievedDate
            });
          }
          continue;
        }

        for (const month of months) {
          push("global", {
            id: `${rule.id}-${month.monthKey}`,
            name: (rule.name || "{month}월의 지배자").replace("{month}", String(Number(month.monthKey.slice(5, 7)))),
            description: (rule.description || "{monthKey} 한 달 개근").replace("{monthKey}", month.monthKey),
            image: rule.image,
            unlocked: true,
            achievedDate: month.achievedDate
          });
        }
        continue;
      }

      if (rule.rule === "first_log") {
        const first = sortedLogs(targetLogs)[0];
        push(rule.scope, {
          id: rule.id,
          name: rule.name,
          description: rule.description,
          image: rule.image,
          unlocked: count > 0,
          achievedDate: first?.loggedForDate
        });
        continue;
      }

      if (rule.rule === "count_at_least") {
        const t = Math.max(1, rule.threshold ?? 1);
        push(rule.scope, {
          id: rule.id,
          name: rule.name,
          description: rule.description,
          image: rule.image,
          unlocked: count >= t,
          achievedDate: thresholdReachedDateForCount(targetLogs, t)
        });
        continue;
      }

      if (rule.rule === "count_in_year_at_least") {
        const t = Math.max(1, rule.threshold ?? 1);
        const targetYear = Number.isFinite(rule.limit) ? Number(rule.limit) : Number(baseDateKey.slice(0, 4));
        const targetLogsInYear = targetLogs.filter((log) => log.loggedForDate.startsWith(`${targetYear}-`));
        push(rule.scope, {
          id: rule.id,
          name: applyBadgeTextTemplate(rule.name, { year: targetYear, value: t, threshold: t }),
          description: applyBadgeTextTemplate(rule.description, { year: targetYear, value: t, threshold: t }),
          image: rule.image,
          unlocked: targetLogsInYear.length >= t,
          achievedDate: thresholdReachedDateForCount(targetLogsInYear, t)
        });
        continue;
      }

      if (rule.rule === "distance_at_least") {
        const t = Math.max(0.1, rule.threshold ?? 1);
        push(rule.scope, {
          id: rule.id,
          name: rule.name,
          description: rule.description,
          image: rule.image,
          unlocked: distance >= t,
          achievedDate: thresholdReachedDateForDistance(targetLogs, t)
        });
        continue;
      }

      if (rule.rule === "count_step") {
        const step = Math.max(1, rule.step ?? 1);
        const achieved = Math.floor(count / step);
        const limit = Math.max(1, rule.limit ?? achieved);
        for (let i = 1; i <= Math.min(limit, achieved); i += 1) {
          const target = i * step;
          push(rule.scope, {
            id: `${rule.id}-${target}`,
            name: (rule.name || "{value}회").replace("{value}", String(target)),
            description: rule.description || `${target}회 달성`,
            image: rule.image,
            unlocked: true,
            achievedDate: thresholdReachedDateForCount(targetLogs, target)
          });
        }
        continue;
      }

      if (rule.rule === "distance_step") {
        const step = Math.max(0.1, rule.step ?? 1);
        const achieved = Math.floor(distance / step);
        const limit = Math.max(1, rule.limit ?? achieved);
        for (let i = 1; i <= Math.min(limit, achieved); i += 1) {
          const target = Number((i * step).toFixed(1));
          push(rule.scope, {
            id: `${rule.id}-${target}`,
            name: (rule.name || "{value}km").replace("{value}", String(target)),
            description: rule.description || `${target}km 달성`,
            image: rule.image,
            unlocked: true,
            achievedDate: thresholdReachedDateForDistance(targetLogs, target),
            tier: target % 100 === 0 ? "special" : "normal"
          });
        }
      }
    }

    // Safety net: keep first-log reward visible for selected activity only,
    // even when CSV rows are missing/broken for first_log rules.
    const firstLogBadgeTypes = new Set(
      activityBadges
        .filter((badge) => badge.id.startsWith("first-") || badge.id.startsWith("activity-first-") || badge.id.startsWith("auto-first-"))
        .map((badge) => badge.id.replace(/^first-/, "").replace(/^activity-first-/, "").replace(/^auto-first-/, ""))
    );
    const selectedLogs = logs.filter((log) => log.typeId === selectedTypeId);
    if (selectedLogs.length && !firstLogBadgeTypes.has(selectedTypeId)) {
      const first = sortedLogs(selectedLogs)[0];
      activityBadges.push({
        id: `auto-first-${selectedTypeId}`,
        name: "시작이 반이다",
        description: "첫 운동 기록 완료",
        image: "/health/badges/start.png",
        unlocked: true,
        achievedDate: first?.loggedForDate
      });
    }

    return { globalBadges, activityBadges };
  }

  const streak = calculateStreak(logs, baseDateKey);
  const months = perfectMonths(logs);

  const globalBadges: BadgeItem[] = [
    { id: "global-365", name: "\uC62C\uD574\uC758 \uC6B4\uB3D9\uC655", description: "365\uC77C \uC5F0\uC18D \uC6B4\uB3D9", unlocked: streak.best >= 365, achievedDate: streak.bestReachedDateByThreshold[365] },
    { id: "global-90", name: "\uCCA0\uC758 \uC758\uC9C0", description: "90\uC77C \uC5F0\uC18D \uC6B4\uB3D9", unlocked: streak.best >= 90, achievedDate: streak.bestReachedDateByThreshold[90] },
    ...months.map((month) => ({
      id: `global-month-${month.monthKey}`,
      name: `${Number(month.monthKey.slice(5, 7))}\uC6D4\uC758 \uC9C0\uBC30\uC790`,
      description: `${month.monthKey} \uD55C \uB2EC \uAC1C\uADFC`,
      unlocked: true,
      achievedDate: month.achievedDate
    })),
    { id: "global-7", name: "\uAC74\uAC15\uD55C \uC77C\uC8FC\uC77C", description: "7\uC77C \uC5F0\uC18D \uC6B4\uB3D9", unlocked: streak.best >= 7, achievedDate: streak.bestReachedDateByThreshold[7] }
  ];

  const typeId = selectedTypeId as ExtendedTypeId;
  const typeLabelKo = activityLabelKo(typeId);
  const selectedLogs = logs.filter((log) => log.typeId === selectedTypeId);
  const count = selectedLogs.length;
  const distance = selectedLogs.reduce((sum, log) => sum + (log.distanceKm ?? 0), 0);
  const activityBadges: BadgeItem[] = [];

  activityBadges.push({
    id: `activity-first-${typeId}`,
    name: "\uC2DC\uC791\uC774 \uBC18\uC774\uB2E4",
    description: "\uCCAB \uC6B4\uB3D9 \uAE30\uB85D \uC644\uB8CC",
    unlocked: count > 0,
    achievedDate: count > 0 ? sortedLogs(selectedLogs)[0]?.loggedForDate : undefined
  });

  if (typeId === "running" || typeId === "walking" || typeId === "test_distance") {
    const achieved = Math.floor(distance / 10);
    const maxMilestone = Math.min(120, Math.max(1, achieved + 1));
    for (let i = 1; i <= maxMilestone; i += 1) {
      const km = i * 10;
      activityBadges.push({
        id: `distance-${typeId}-${km}`,
        name: `${km}km`,
        description: `${typeLabelKo} \uAC70\uB9AC \uB9C8\uC77C\uC2A4\uD1A4`,
        unlocked: distance >= km,
        achievedDate: thresholdReachedDateForDistance(selectedLogs, km),
        tier: km % 100 === 0 ? "special" : "normal"
      });
    }
  }

  if (typeId === "bicycle") {
    activityBadges.push({
      id: "distance-bicycle-600",
      name: "\uC804\uAD6D\uC77C\uC8FC \uC644\uB8CC!",
      description: "\uC790\uC804\uAC70 600km \uB2EC\uC131",
      unlocked: distance >= 600,
      achievedDate: thresholdReachedDateForDistance(selectedLogs, 600),
      tier: "special"
    });
  }

  const countStep =
    typeId === "swimming" || typeId === "home" || typeId === "gym" || typeId === "test_count"
      ? 10
      : typeId === "soccer" || typeId === "tennis"
        ? 5
        : 0;
  if (countStep > 0) {
    const achieved = Math.floor(count / countStep);
    const maxMilestone = Math.min(120, Math.max(1, achieved + 1));
    for (let i = 1; i <= maxMilestone; i += 1) {
      const target = i * countStep;
      activityBadges.push({
        id: `count-${typeId}-${target}`,
        name: `${target}\uD68C`,
        description: `${typeLabelKo} \uD69F\uC218 \uB9C8\uC77C\uC2A4\uD1A4`,
        unlocked: count >= target,
        achievedDate: thresholdReachedDateForCount(selectedLogs, target)
      });
    }
  }

  activityBadges.push(...specialBadgeForActivity(typeId, count, distance));

  return { globalBadges, activityBadges };
}
