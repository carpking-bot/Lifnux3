"use client";

import { useMemo, useState } from "react";
import { motion, useAnimation, useMotionValue, useTransform } from "framer-motion";
import type { LucideIcon } from "lucide-react";

export type OrbitApp = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

type LifnuxOrbitProps = {
  orbitApps: OrbitApp[];
  coreApp?: OrbitApp;
  centerButton?: React.ReactNode;
  outerRingRadius?: number;
  outerRingThickness?: number;
  coreRadius?: number;
  iconSize?: number;
  rotateDuration?: number;
  disableAnimation?: boolean;
  onSelectStart?: (href: string) => void;
  onNavigate: (href: string) => void;
};

export function LifnuxOrbit({
  orbitApps,
  coreApp,
  centerButton,
  outerRingRadius = 230,
  outerRingThickness = 56,
  coreRadius = 120,
  iconSize = 62,
  rotateDuration = 50,
  disableAnimation = false,
  onSelectStart,
  onNavigate
}: LifnuxOrbitProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [isRotating, setIsRotating] = useState(true);
  const absorbControls = useAnimation();
  const orbitRotation = useMotionValue(0);
  const counterRotation = useTransform(orbitRotation, (v) => -v);

  const orbitRadius = outerRingRadius + outerRingThickness / 2;
  const orbitDiameter = orbitRadius * 2 + iconSize;

  const positions = useMemo(() => {
    return orbitApps.map((_, index) => {
      const angle = (index / orbitApps.length) * Math.PI * 2 - Math.PI / 2;
      return {
        x: Math.cos(angle) * orbitRadius,
        y: Math.sin(angle) * orbitRadius
      };
    });
  }, [orbitApps.length, orbitRadius]);

  const handleSelect = async (app: OrbitApp) => {
    if (selected) return;
    onSelectStart?.(app.href);
    setIsRotating(false);
    setSelected(app.key);
    try {
      absorbControls.set({ scale: 1, opacity: 0 });
      if (!disableAnimation) {
        await absorbControls.start({
          scale: 6,
          opacity: 1,
          transition: { duration: 0.7, ease: "easeIn" }
        });
      }
    } finally {
      onNavigate(app.href);
    }
  };

  return (
    <div className="relative" style={{ width: orbitDiameter, height: orbitDiameter }}>
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full lifnux-ring"
        style={{ width: outerRingRadius * 2, height: outerRingRadius * 2 }}
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: outerRingRadius * 2,
          height: outerRingRadius * 2,
          background: `radial-gradient(circle, transparent calc(50% - ${outerRingThickness / 2}px), rgba(140, 190, 240, 0.35) calc(50% - ${outerRingThickness / 2}px), rgba(140, 190, 240, 0.18) calc(50% + ${outerRingThickness / 2}px), transparent calc(50% + ${outerRingThickness / 2}px))`
        }}
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: outerRingRadius * 2,
          height: outerRingRadius * 2,
          background:
            "conic-gradient(from 120deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,0.45) 40deg, rgba(255,255,255,0.05) 120deg, rgba(255,255,255,0) 360deg)",
          maskImage: `radial-gradient(circle, transparent calc(50% - ${outerRingThickness / 2}px), black calc(50% - ${outerRingThickness / 2}px), black calc(50% + ${outerRingThickness / 2}px), transparent calc(50% + ${outerRingThickness / 2}px))`
        }}
      />

      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full lifnux-glass-strong"
        style={{ width: coreRadius * 2, height: coreRadius * 2 }}
      >
        <div className="absolute inset-6 rounded-full border border-white/10 bg-[radial-gradient(circle,_rgba(255,255,255,0.08)_0%,_rgba(12,18,28,0.6)_70%)]" />
      </div>

      {coreApp ? (
        <motion.button
          className="group absolute left-1/2 top-1/2 z-30 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-white/10 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
          whileHover={{ scale: 1.08, zIndex: 60 }}
          animate={{
            scale: selected === coreApp.key ? 1.35 : 1,
            zIndex: selected === coreApp.key ? 60 : 30
          }}
          onClick={() => handleSelect(coreApp)}
        >
          <coreApp.icon className="h-6 w-6 text-white opacity-100" />
          <span className="pointer-events-none absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/40 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
            {coreApp.label}
          </span>
        </motion.button>
      ) : null}

      {centerButton ? (
        <div className="absolute left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2">{centerButton}</div>
      ) : null}

      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: orbitDiameter, height: orbitDiameter }}
        animate={isRotating ? { rotate: 360 } : { rotate: 0 }}
        transition={isRotating ? { repeat: Infinity, duration: rotateDuration, ease: "linear" } : { duration: 0.6 }}
        onUpdate={(latest) => {
          if (typeof latest.rotate === "number") {
            orbitRotation.set(latest.rotate);
          }
        }}
      >
        {orbitApps.map((app, index) => {
          const Icon = app.icon;
          const pos = positions[index];
          const isSelected = selected === app.key;
          return (
            <motion.button
              key={app.key}
              className="group pointer-events-auto absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full lifnux-glass text-white"
              style={{ width: iconSize, height: iconSize, rotate: counterRotation }}
              initial={false}
              animate={{
                x: isSelected ? 0 : pos.x,
                y: isSelected ? 0 : pos.y,
                scale: isSelected ? 1.5 : 1,
                zIndex: isSelected ? 40 : 20
              }}
              whileHover={{ scale: isSelected ? 1.5 : 1.08, zIndex: 50 }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
              onClick={() => handleSelect(app)}
            >
              <motion.span
                className="pointer-events-none absolute inset-0 rounded-full"
                initial={false}
                animate={{
                  opacity: isSelected ? 1 : 0,
                  boxShadow: isSelected ? "0 0 26px rgba(90,214,208,0.7)" : "0 0 0 rgba(0,0,0,0)"
                }}
                transition={{ duration: 0.2 }}
              />
              <Icon className="relative z-10 h-6 w-6 opacity-100" />
              <span className="pointer-events-none absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/40 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
                {app.label}
              </span>
            </motion.button>
          );
        })}
      </motion.div>

      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 z-30 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(90,214,208,0.45)_0%,_rgba(90,214,208,0)_70%)]"
        initial={{ scale: 1, opacity: 0 }}
        animate={absorbControls}
      />
    </div>
  );
}
