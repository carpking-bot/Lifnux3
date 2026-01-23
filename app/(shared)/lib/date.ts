export function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function parseDateKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function getMonthGrid(year: number, monthIndex: number) {
  const first = new Date(year, monthIndex, 1);
  const startDay = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -startDay);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return days;
}

export function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

export function getDday(target: Date, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "D-day";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

export function timeSlots() {
  const slots: string[] = [];
  const start = 7 * 60;
  const end = 30 * 60;
  for (let minutes = start; minutes <= end; minutes += 30) {
    const hour = Math.floor(minutes / 60) % 24;
    const min = minutes % 60;
    slots.push(`${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return slots;
}
