"use client";

import Link from "next/link";

export function TopNav({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between px-8 py-5 text-sm text-[var(--ink-1)]">
      <Link href="/" className="uppercase tracking-[0.3em]">
        Lifnux OS
      </Link>
      {title ? <div className="text-base text-[var(--ink-0)]">{title}</div> : null}
    </div>
  );
}
