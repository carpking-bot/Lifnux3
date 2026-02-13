function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function dateKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function todayDateKey() {
  return dateKeyFromDate(new Date());
}

export function startOfIsoWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(12, 0, 0, 0);
  return copy;
}

export function weekKeyFromDateKey(dateKey: string) {
  return dateKeyFromDate(startOfIsoWeek(parseDateKey(dateKey)));
}

export function monthKeyFromDateKey(dateKey: string) {
  return dateKey.slice(0, 7);
}

export function isInWeek(dateKey: string, weekKey: string) {
  return weekKeyFromDateKey(dateKey) === weekKey;
}

export function isInMonth(dateKey: string, monthKey: string) {
  return monthKeyFromDateKey(dateKey) === monthKey;
}

export function parseMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1, 12, 0, 0, 0);
}

export function shiftMonthKey(monthKey: string, offset: number) {
  const date = parseMonthKey(monthKey);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function monthLabel(monthKey: string) {
  const date = parseMonthKey(monthKey);
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long" }).format(date);
}

export function weekRangeLabel(weekKey: string) {
  const start = parseDateKey(weekKey);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${dateKeyFromDate(start)} ~ ${dateKeyFromDate(end)}`;
}

export type CalendarDayCell = {
  dateKey: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
};

export function monthGridFromMonthKey(monthKey: string) {
  const monthStart = parseMonthKey(monthKey);
  const day = monthStart.getDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - mondayOffset);
  const cells: CalendarDayCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + i);
    cells.push({
      dateKey: dateKeyFromDate(cellDate),
      dayOfMonth: cellDate.getDate(),
      inCurrentMonth: cellDate.getMonth() === monthStart.getMonth()
    });
  }
  return cells;
}
