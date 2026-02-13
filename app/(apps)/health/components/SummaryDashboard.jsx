export function SummaryDashboard({ weeklyTotal, monthlyTotal, currentStreak, bestStreak }) {
    return (<section className="rounded-2xl border border-white/10 bg-[#111823] p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">This Week</div>
          <div className="mt-2 text-3xl">{weeklyTotal}</div>
          <div className="text-xs text-[var(--ink-1)]">total workout sessions</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">This Month</div>
          <div className="mt-2 text-3xl">{monthlyTotal}</div>
          <div className="text-xs text-[var(--ink-1)]">total workout sessions</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <div className="rounded-full border border-[var(--accent-2)]/45 bg-[rgba(240,98,146,0.12)] px-3 py-1 text-xs text-[var(--ink-0)]">
          🔥 Streak {currentStreak} days
        </div>
        <div className="rounded-full border border-[var(--accent-1)]/45 bg-[rgba(90,214,208,0.14)] px-3 py-1 text-xs text-[var(--ink-0)]">
          🔥 Best {bestStreak} days
        </div>
      </div>
    </section>);
}

