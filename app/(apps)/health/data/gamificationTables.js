export const LEVEL_TABLE = [
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
export const LEVEL_AFTER_10_STEP_MULTIPLIER = 300;
export function minXpForLevel(level) {
    if (level <= 1)
        return 0;
    const maxDefined = LEVEL_TABLE[LEVEL_TABLE.length - 1];
    if (level <= maxDefined.level) {
        return LEVEL_TABLE[level - 1]?.minXp ?? 0;
    }
    let xp = maxDefined.minXp;
    for (let lv = maxDefined.level + 1; lv <= level; lv += 1) {
        xp += lv * LEVEL_AFTER_10_STEP_MULTIPLIER;
    }
    return xp;
}
export function levelMetaFor(level) {
    if (level <= 1)
        return LEVEL_TABLE[0];
    const capped = Math.min(level, LEVEL_TABLE[LEVEL_TABLE.length - 1].level);
    return LEVEL_TABLE[capped - 1];
}

