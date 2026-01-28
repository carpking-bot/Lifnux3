"use client";

import { useMemo } from "react";
import { formatDateKey, getMonthGrid, isSameDay } from "../../../(shared)/lib/date";
import type { Attendance } from "../types";

export function AttendancePanel({
  attendance,
  onCheckIn,
  onUndo,
  cursor,
  onPrevMonth,
  onNextMonth
}: {
  attendance: Attendance[];
  onCheckIn: () => void;
  onUndo: () => void;
  cursor: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const now = new Date();
  const monthIndex = cursor.getMonth();
  const year = cursor.getFullYear();
  const days = useMemo(() => getMonthGrid(year, monthIndex), [year, monthIndex]);
  const attendanceSet = useMemo(() => new Set(attendance.map((entry) => entry.dateKey)), [attendance]);
  const monthCount = attendance.filter((entry) => entry.dateKey.startsWith(`${year}-${String(monthIndex + 1).padStart(2, "0")}`)).length;
  const todayKey = formatDateKey(now);
  const hasToday = attendanceSet.has(todayKey);

  return (
    <div className="lifnux-glass rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Attendance</div>
        <div className="flex items-center gap-2 text-xs">
          <button onClick={onPrevMonth} aria-label="Previous month">
            ◀
          </button>
          <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)]">
            {cursor.toLocaleString("en-US", { month: "short" }).toUpperCase()} {year}
          </div>
          <button onClick={onNextMonth} aria-label="Next month">
            ▶
          </button>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span>이번 달 출석: {monthCount}회</span>
        {hasToday ? (
          <button className="text-xs text-[var(--ink-1)]" onClick={onUndo}>
            Cancel today
          </button>
        ) : (
          <button className="text-xs" onClick={onCheckIn}>
            오늘 출석하기
          </button>
        )}
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1 text-xs">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
          <div key={label} className="text-center text-[10px] text-[var(--ink-1)]">
            {label}
          </div>
        ))}
        {days.map((day) => {
          const key = formatDateKey(day);
          const isCurrentMonth = day.getMonth() === monthIndex;
          const isMarked = attendanceSet.has(key);
          const isToday = isSameDay(day, now);
          return (
            <div
              key={key}
              className={`flex h-7 items-center justify-center rounded-md ${
                isMarked ? "bg-[var(--accent-1)] text-black" : isCurrentMonth ? "text-[var(--ink-0)]" : "text-[var(--ink-1)]/50"
              } ${isToday ? "border border-white/20" : ""}`}
            >
              {day.getDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
