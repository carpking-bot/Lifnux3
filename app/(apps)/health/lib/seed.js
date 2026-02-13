import { dateKeyFromDate } from "./date";
const MEMOS = [
    "Felt strong today",
    "Easy pace session",
    "Focused on form",
    "Kept it light",
    "Solid consistency",
    "Short and intense"
];
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomFloat(min, max, decimals = 1) {
    const value = Math.random() * (max - min) + min;
    return Number(value.toFixed(decimals));
}
function pickMemo(chance = 0.35) {
    if (Math.random() > chance)
        return undefined;
    return MEMOS[randomInt(0, MEMOS.length - 1)];
}
function dateFromWeekAndDay(weekStart, dayOffset) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + dayOffset);
    return date;
}
function pushLog(logs, typeId, date, options) {
    const createdAt = new Date(date);
    createdAt.setHours(randomInt(6, 22), randomInt(0, 59), randomInt(0, 59), 0);
    logs.push({
        id: crypto.randomUUID(),
        typeId,
        loggedForDate: dateKeyFromDate(date),
        durationMin: options?.durationMin,
        memo: pickMemo(),
        createdAt: createdAt.toISOString(),
        distanceKm: options?.running?.distanceKm,
        paceText: options?.running?.paceText,
        cadence: options?.running?.cadence,
        maxSpeedKmh: options?.running?.maxSpeedKmh
    });
}
export function generateHealthTestLogs() {
    const logs = [];
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const day = today.getDay();
    const mondayDiff = day === 0 ? -6 : 1 - day;
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(currentWeekStart.getDate() + mondayDiff);
    for (let weekOffset = 0; weekOffset < 8; weekOffset += 1) {
        const weekStart = new Date(currentWeekStart);
        weekStart.setDate(weekStart.getDate() - weekOffset * 7);
        const swimCount = randomInt(2, 3);
        for (let i = 0; i < swimCount; i += 1) {
            pushLog(logs, "swimming", dateFromWeekAndDay(weekStart, randomInt(0, 6)), { durationMin: randomInt(35, 70) });
        }
        const homeCount = randomInt(2, 3);
        for (let i = 0; i < homeCount; i += 1) {
            pushLog(logs, "home", dateFromWeekAndDay(weekStart, randomInt(0, 6)), { durationMin: randomInt(20, 60) });
        }
        if (Math.random() > 0.25) {
            const runCount = randomInt(1, 2);
            for (let i = 0; i < runCount; i += 1) {
                const distanceKm = randomFloat(3, 10, 1);
                pushLog(logs, "running", dateFromWeekAndDay(weekStart, randomInt(0, 6)), {
                    durationMin: randomInt(24, 75),
                    running: {
                        distanceKm,
                        paceText: `${randomInt(4, 6)}'${String(randomInt(0, 59)).padStart(2, "0")}"`,
                        cadence: randomInt(155, 182),
                        maxSpeedKmh: randomFloat(10, 18, 1)
                    }
                });
            }
        }
        if (Math.random() > 0.65) {
            pushLog(logs, "gym", dateFromWeekAndDay(weekStart, randomInt(0, 6)), { durationMin: randomInt(40, 85) });
        }
        if (Math.random() > 0.55) {
            pushLog(logs, "walking", dateFromWeekAndDay(weekStart, randomInt(0, 6)), {
                durationMin: randomInt(25, 80),
                running: { distanceKm: randomFloat(2, 8, 1) }
            });
        }
        if (Math.random() > 0.65) {
            pushLog(logs, "bicycle", dateFromWeekAndDay(weekStart, randomInt(0, 6)), {
                durationMin: randomInt(30, 90),
                running: { distanceKm: randomFloat(5, 25, 1) }
            });
        }
    }
    const monthSoccerCount = randomInt(0, 2) + randomInt(0, 2);
    for (let i = 0; i < monthSoccerCount; i += 1) {
        const date = new Date(today);
        date.setDate(date.getDate() - randomInt(0, 59));
        pushLog(logs, "soccer", date, { durationMin: randomInt(60, 110) });
    }
    const monthTennisCount = randomInt(0, 1) + randomInt(0, 1);
    for (let i = 0; i < monthTennisCount; i += 1) {
        const date = new Date(today);
        date.setDate(date.getDate() - randomInt(0, 59));
        pushLog(logs, "tennis", date, { durationMin: randomInt(45, 95) });
    }
    return logs.sort((a, b) => {
        if (a.loggedForDate !== b.loggedForDate)
            return a.loggedForDate.localeCompare(b.loggedForDate);
        return a.createdAt.localeCompare(b.createdAt);
    });
}
