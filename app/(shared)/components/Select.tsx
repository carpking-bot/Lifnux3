"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type SelectOption = {
  value: string;
  label: string;
  group?: string;
  disabled?: boolean;
};

type SelectProps = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
};

export function Select({
  value,
  options,
  onChange,
  placeholder = "Select",
  className,
  buttonClassName,
  disabled
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedLabel = useMemo(() => {
    const match = options.find((option) => option.value === value);
    return match?.label ?? "";
  }, [options, value]);

  const grouped = useMemo(() => {
    const groups = new Map<string, SelectOption[]>();
    options.forEach((option) => {
      const key = option.group ?? "";
      const bucket = groups.get(key) ?? [];
      bucket.push(option);
      groups.set(key, bucket);
    });
    return Array.from(groups.entries());
  }, [options]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        disabled={disabled}
        className={`flex w-full items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 shadow-sm transition hover:border-white/30 ${buttonClassName ?? ""} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={selectedLabel ? "truncate" : "text-white/50"}>{selectedLabel || placeholder}</span>
        <ChevronDown className={`h-4 w-4 text-white/70 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-[#0b0f1a] shadow-lg">
          <div className="max-h-60 overflow-y-auto py-1 text-sm">
            {grouped.map(([group, items]) => (
              <div key={group || "default"}>
                {group ? (
                  <div className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.2em] text-white/40">
                    {group}
                  </div>
                ) : null}
                {items.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    disabled={option.disabled}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                      option.value === value ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/5"
                    } ${option.disabled ? "cursor-not-allowed opacity-40" : ""}`}
                    onClick={() => {
                      if (option.disabled) return;
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <span className="truncate">{option.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
