import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
};

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function parseYmd(value: string) {
  const [yRaw = "", mRaw = "", dRaw = ""] = value.split("-");
  return {
    y: digitsOnly(yRaw).slice(0, 4),
    m: digitsOnly(mRaw).slice(0, 2),
    d: digitsOnly(dRaw).slice(0, 2)
  };
}

function pad2(value: string) {
  if (!value) return "";
  return value.padStart(2, "0").slice(0, 2);
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function buildValue(y: string, m: string, d: string) {
  if (!y && !m && !d) return "";
  if (d) return `${y}-${m}-${d}`;
  if (m) return `${y}-${m}`;
  return y;
}

export function DateInput({ value, onChange, className, inputClassName, disabled }: Props) {
  const parsed = useMemo(() => parseYmd(value), [value]);
  const [year, setYear] = useState(parsed.y);
  const [month, setMonth] = useState(parsed.m);
  const [day, setDay] = useState(parsed.d);

  const yearRef = useRef<HTMLInputElement | null>(null);
  const monthRef = useRef<HTMLInputElement | null>(null);
  const dayRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setYear(parsed.y);
    setMonth(parsed.m);
    setDay(parsed.d);
  }, [parsed.y, parsed.m, parsed.d]);

  const emit = (nextY: string, nextM: string, nextD: string) => {
    onChange(buildValue(nextY, nextM, nextD));
  };

  const inputCls =
    inputClassName ??
    "w-full min-w-0 rounded-lg border border-white/15 bg-black/25 px-3 py-2.5 text-lg font-medium text-white text-center tabular-nums";

  return (
    <div className={`grid grid-cols-[1.8fr_auto_1.1fr_auto_1.1fr] items-center gap-2.5 ${className ?? ""}`}>
      <input
        ref={yearRef}
        type="text"
        inputMode="numeric"
        maxLength={4}
        disabled={disabled}
        value={year}
        placeholder="YYYY"
        className={inputCls}
        onChange={(event) => {
          const next = digitsOnly(event.target.value).slice(0, 4);
          setYear(next);
          emit(next, month, day);
          if (next.length === 4) monthRef.current?.focus();
        }}
      />
      <span className="text-sm text-[var(--ink-1)]">/</span>
      <input
        ref={monthRef}
        type="text"
        inputMode="numeric"
        maxLength={2}
        disabled={disabled}
        value={month}
        placeholder="MM"
        className={inputCls}
        onChange={(event) => {
          const next = digitsOnly(event.target.value).slice(0, 2);
          setMonth(next);
          emit(year, next, day);
          if (next.length === 2) dayRef.current?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === "Backspace" && month.length === 0) yearRef.current?.focus();
        }}
      />
      <span className="text-sm text-[var(--ink-1)]">/</span>
      <input
        ref={dayRef}
        type="text"
        inputMode="numeric"
        maxLength={2}
        disabled={disabled}
        value={day}
        placeholder="DD"
        className={inputCls}
        onChange={(event) => {
          const next = digitsOnly(event.target.value).slice(0, 2);
          setDay(next);
          emit(year, month, next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Backspace" && day.length === 0) monthRef.current?.focus();
        }}
        onBlur={() => {
          const fixedMonth = month ? pad2(month) : "";
          let fixedDay = day ? pad2(day) : "";
          if (year.length === 4 && fixedMonth.length === 2 && fixedDay.length === 2) {
            const monthNum = Math.min(12, Math.max(1, Number(fixedMonth)));
            const maxDay = daysInMonth(Number(year), monthNum);
            const dayNum = Math.min(maxDay, Math.max(1, Number(fixedDay)));
            fixedDay = String(dayNum).padStart(2, "0");
            const normalizedMonth = String(monthNum).padStart(2, "0");
            setMonth(normalizedMonth);
            setDay(fixedDay);
            emit(year, normalizedMonth, fixedDay);
            return;
          }
          setMonth(fixedMonth);
          setDay(fixedDay);
          emit(year, fixedMonth, fixedDay);
        }}
      />
    </div>
  );
}
