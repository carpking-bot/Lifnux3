"use client";

import { useMemo, useState } from "react";
import { calculateLevel, calculateTotalXP, generateBadgesByRules } from "../lib/gamification";
import { getBadgeImageSrc } from "../lib/badgeAssets";
import { resolveLevelMetaByLevel, useGamificationConfig } from "../lib/gamificationConfig";
import { PlainModal } from "./PlainModal";

function flameVisualClass(level) {
  if (level >= 10) return "h-52 w-52 drop-shadow-[0_0_28px_rgba(251,191,36,0.55)]";
  if (level >= 7) return "h-44 w-44 drop-shadow-[0_0_24px_rgba(34,211,238,0.5)]";
  if (level >= 5) return "h-36 w-36 drop-shadow-[0_0_22px_rgba(253,186,116,0.45)]";
  if (level >= 3) return "h-[7.5rem] w-[7.5rem] drop-shadow-[0_0_18px_rgba(251,146,60,0.4)]";
  return "h-24 w-24";
}

export function BadgeShowcasePanel({ logs, selectedTypeId, baseDateKey }) {
  const config = useGamificationConfig();
  const [selectedBadge, setSelectedBadge] = useState(null);

  const badges = useMemo(() => generateBadgesByRules(logs, selectedTypeId, config.badgeRules, baseDateKey), [logs, selectedTypeId, config.badgeRules, baseDateKey]);

  const unlockedBadges = useMemo(() => {
    return [...badges.globalBadges, ...badges.activityBadges].filter((badge) => badge.unlocked === true);
  }, [badges]);

  return (
    <aside className="rounded-2xl border border-white/10 bg-[#111823] p-4 xl:sticky xl:top-24">
      <div className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Badges</div>
      {unlockedBadges.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-4 text-xs text-[var(--ink-1)]">
          <img src={getBadgeImageSrc("default")} alt="default medal" className="mb-2 h-8 w-8 opacity-60" />
          아직 획득한 배지가 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {unlockedBadges.map((badge) => {
            const displayName = badge.name;
            const displayDesc = badge.description;
            const displayImage = badge.image || getBadgeImageSrc(badge.id);
            return (
              <button
                key={badge.id}
                type="button"
                onClick={() => setSelectedBadge(badge)}
                title={`${displayName}\n${displayDesc}${badge.achievedDate ? `\n획득일: ${badge.achievedDate}` : ""}`}
                className={`group relative flex h-[88px] w-[88px] items-center justify-center rounded-xl border ${
                  badge.tier === "special"
                    ? "border-amber-300/60 bg-amber-200/10"
                    : "border-[var(--accent-1)]/60 bg-[rgba(90,214,208,0.14)]"
                }`}
              >
                <img src={displayImage} alt="badge medal" className="h-[7.5rem] w-[7.5rem] shrink-0 object-contain" />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-44 -translate-x-1/2 rounded-lg border border-white/15 bg-[#0b1220] p-2 text-xs text-[var(--ink-0)] group-hover:block">
                  <div className="font-semibold">{displayName}</div>
                  <div className="mt-1 text-[var(--ink-1)]">{displayDesc}</div>
                  {badge.achievedDate ? <div className="mt-1 text-[10px] text-[var(--ink-1)]">획득일: {badge.achievedDate}</div> : null}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <PlainModal
        open={Boolean(selectedBadge)}
        title={selectedBadge?.name ?? "Badge"}
        onClose={() => setSelectedBadge(null)}
        panelClassName="max-w-md"
      >
        {selectedBadge ? (
          <div className="space-y-4">
            <div className="flex justify-center">
              <img
                src={selectedBadge.image || getBadgeImageSrc(selectedBadge.id)}
                alt={`${selectedBadge.name} badge`}
                className="h-72 w-72 object-contain"
              />
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
              <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-1)]">Clear Condition</div>
              <div className="mt-1 text-[var(--ink-0)]">{selectedBadge.description || "-"}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
              <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-1)]">Achieved At</div>
              <div className="mt-1 text-[var(--ink-0)]">{selectedBadge.achievedDate || "-"}</div>
            </div>
          </div>
        ) : null}
      </PlainModal>
    </aside>
  );
}

export function LevelFlamePanel({ logs }) {
  const config = useGamificationConfig();
  const xpInfo = useMemo(() => calculateTotalXP(logs), [logs]);
  const levelInfo = useMemo(() => calculateLevel(xpInfo.finalXp, config.levels), [xpInfo.finalXp, config.levels]);
  const hoverMeta = resolveLevelMetaByLevel(config, levelInfo.level);

  return (
    <aside className="bg-transparent p-2 xl:sticky xl:top-24">
      <div className="mx-auto flex min-h-[820px] w-full flex-col items-end justify-center pr-4">
        <div className="translate-x-4">
          <div className="group relative flex w-[220px] justify-center">
            <img src="/health/level/flame-core.svg" alt="level icon" className={`${flameVisualClass(levelInfo.level)} rounded-full object-contain`} />
            {hoverMeta ? (
              <div className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 hidden w-48 rounded-lg border border-white/15 bg-[#0b1220] p-2 text-xs text-[var(--ink-0)] group-hover:block">
                <div className="font-semibold">{hoverMeta.name}</div>
                <div className="mt-1 text-[var(--ink-1)]">{hoverMeta.description}</div>
              </div>
            ) : null}
          </div>
          <div className="mt-8 h-2 w-[220px] overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[var(--accent-3)] transition-all" style={{ width: `${levelInfo.progressPct}%` }} />
          </div>
        </div>
      </div>
    </aside>
  );
}
