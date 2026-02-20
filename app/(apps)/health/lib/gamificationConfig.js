"use client";
import { useEffect, useState } from "react";
const DEFAULT_LEVELS = [
    { level: 1, minXp: 0, name: "작은 불꽃", description: "시작 단계입니다." },
    { level: 2, minXp: 200, name: "새싹 불꽃", description: "루틴이 만들어지는 단계입니다." },
    { level: 3, minXp: 500, name: "중형 불꽃", description: "루틴이 안정화된 단계입니다." },
    { level: 4, minXp: 900, name: "강화 불꽃", description: "운동 볼륨이 늘어나는 단계입니다." },
    { level: 5, minXp: 1500, name: "대형 불꽃", description: "성장 가속 구간입니다." },
    { level: 6, minXp: 2300, name: "심화 불꽃", description: "지속성과 강도를 함께 챙기는 단계입니다." },
    { level: 7, minXp: 3300, name: "푸른 불꽃", description: "강한 집중의 단계입니다." },
    { level: 8, minXp: 4500, name: "맹렬한 불꽃", description: "꾸준함이 실력으로 드러나는 단계입니다." },
    { level: 9, minXp: 6000, name: "폭풍 불꽃", description: "상위권 페이스를 유지하는 단계입니다." },
    { level: 10, minXp: 8000, name: "황금 불꽃", description: "최상위 불꽃 단계입니다." }
];
const DEFAULT_CONFIG = {
    levels: DEFAULT_LEVELS,
    badgeRules: []
};
function splitCsvLine(line) {
    return line.split(",").map((item) => item.trim());
}
const KNOWN_BADGE_RULES = [
    "streak_best_at_least",
    "perfect_month_any",
    "first_log",
    "count_at_least",
    "distance_at_least",
    "count_step",
    "distance_step"
];
const KNOWN_BADGE_SCOPES = ["global", "activity"];
function isKnownRule(value) {
    return Boolean(value && KNOWN_BADGE_RULES.includes(value));
}
function isKnownScope(value) {
    return Boolean(value && KNOWN_BADGE_SCOPES.includes(value));
}
function toOptionalNumber(value) {
    if (!value)
        return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}
export function parseGamificationCsv(text) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length <= 1)
        return DEFAULT_CONFIG;
    const levels = [];
    const badgeRules = [];
    for (let i = 1; i < lines.length; i += 1) {
        const [sheet, id, levelRaw, minXpRaw, name, description, image, ruleRaw, scopeRaw, activity, thresholdRaw, stepRaw, limitRaw] = splitCsvLine(lines[i]);
        const sheetKey = (sheet || "").toLowerCase();
        if (sheetKey === "level") {
            const level = Number(levelRaw);
            const minXp = Number(minXpRaw);
            if (Number.isFinite(level) && Number.isFinite(minXp)) {
                levels.push({
                    level,
                    minXp,
                    name: name || `Lv${level}`,
                    description: description || ""
                });
            }
            continue;
        }
        if (sheetKey === "badge") {
            // Backward-compat for malformed rows where one extra comma shifted badge columns.
            // Expected: ...,name,description,image,rule,scope,activity,threshold,step,limit
            // Broken:   ..., ,name,description,image,rule,scope,activity,threshold,step,limit
            const misaligned = ruleRaw?.startsWith("/health/") && isKnownRule(scopeRaw?.toLowerCase());
            const normalizedName = misaligned ? description : name;
            const normalizedDescription = misaligned ? image : description;
            const normalizedImage = misaligned ? ruleRaw : image;
            const normalizedRuleRaw = (misaligned ? scopeRaw : ruleRaw)?.toLowerCase();
            const normalizedScopeRaw = (misaligned ? activity : scopeRaw)?.toLowerCase();
            const normalizedActivity = misaligned ? thresholdRaw : activity;
            const normalizedThresholdRaw = misaligned ? stepRaw : thresholdRaw;
            const normalizedStepRaw = misaligned ? limitRaw : stepRaw;
            const normalizedLimitRaw = misaligned ? undefined : limitRaw;
            const rule = isKnownRule(normalizedRuleRaw) ? normalizedRuleRaw : "count_at_least";
            const scope = isKnownScope(normalizedScopeRaw) ? normalizedScopeRaw : "activity";
            badgeRules.push({
                id,
                name: normalizedName || id,
                description: normalizedDescription || "",
                image: normalizedImage || undefined,
                rule,
                scope,
                activity: normalizedActivity || undefined,
                threshold: toOptionalNumber(normalizedThresholdRaw),
                step: toOptionalNumber(normalizedStepRaw),
                limit: toOptionalNumber(normalizedLimitRaw)
            });
        }
    }
    return {
        levels: levels.length ? levels.sort((a, b) => a.level - b.level) : DEFAULT_LEVELS,
        badgeRules
    };
}
export function useGamificationConfig() {
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    useEffect(() => {
        let alive = true;
        fetch(`/health/gamification.csv?v=${Date.now()}`, { cache: "no-store" })
            .then((res) => res.text())
            .then((text) => {
            if (!alive)
                return;
            setConfig(parseGamificationCsv(text));
        })
            .catch(() => {
            if (!alive)
                return;
            setConfig(DEFAULT_CONFIG);
        });
        return () => {
            alive = false;
        };
    }, []);
    return config;
}
export function resolveLevelMetaByLevel(config, level) {
    const sorted = [...config.levels].sort((a, b) => a.level - b.level);
    let current = sorted[0];
    for (const row of sorted) {
        if (level >= row.level)
            current = row;
    }
    return current;
}
