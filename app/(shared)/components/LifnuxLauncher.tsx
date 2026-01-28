"use client";

import { ReactNode } from "react";
import { LifnuxOrbit, OrbitApp } from "./LifnuxOrbit";

type LifnuxLauncherProps = {
  mode: "home" | "overlay";
  orbitApps: OrbitApp[];
  coreApp?: OrbitApp;
  centerButton?: ReactNode;
  outerRingRadius?: number;
  outerRingThickness?: number;
  coreRadius?: number;
  iconSize?: number;
  rotateDuration?: number;
  disableAnimation?: boolean;
  textOffset?: number;
  showCloseButton?: boolean;
  closeButton?: ReactNode;
  homeDate?: string;
  homeTime?: string;
  onSelectStart?: (href: string) => void;
  onNavigate: (href: string) => void;
};

export function LifnuxLauncher({
  mode,
  orbitApps,
  coreApp,
  centerButton,
  outerRingRadius = 230,
  outerRingThickness = 56,
  coreRadius = 120,
  iconSize = 62,
  rotateDuration = 50,
  disableAnimation = false,
  textOffset = 104,
  showCloseButton = false,
  closeButton,
  homeDate,
  homeTime,
  onSelectStart,
  onNavigate
}: LifnuxLauncherProps) {
  const orbitRadius = outerRingRadius + outerRingThickness / 2;
  const orbitDiameter = orbitRadius * 2 + iconSize;

  return (
    <div className="relative" style={{ width: orbitDiameter, height: orbitDiameter }}>
      {mode === "home" ? (
        <div
          className="absolute left-1/2 top-1/2 z-20 text-center text-[var(--ink-0)]"
          style={{ transform: `translate(-50%, calc(-50% - ${orbitRadius + textOffset}px))` }}
          suppressHydrationWarning
        >
          {homeDate && homeTime ? (
            <>
              <div className="text-2xl opacity-80 leading-tight">{homeDate}</div>
              <div className="text-4xl leading-tight">{homeTime}</div>
            </>
          ) : (
            <div className="text-2xl opacity-0 leading-tight">--</div>
          )}
        </div>
      ) : null}

      {showCloseButton && closeButton ? (
        <div className="absolute -top-4 -right-4 z-20">{closeButton}</div>
      ) : null}

      <LifnuxOrbit
        orbitApps={orbitApps}
        coreApp={coreApp}
        centerButton={centerButton}
        outerRingRadius={outerRingRadius}
        outerRingThickness={outerRingThickness}
        coreRadius={coreRadius}
        iconSize={iconSize}
        rotateDuration={rotateDuration}
        disableAnimation={disableAnimation}
        onSelectStart={onSelectStart}
        onNavigate={onNavigate}
      />

      {mode === "home" ? (
        <div
          className="absolute left-1/2 top-1/2 z-20 text-center text-[var(--ink-0)]"
          style={{ transform: `translate(-50%, calc(-50% + ${orbitRadius + textOffset}px))` }}
        >
          <div className="text-2xl uppercase tracking-[0.45em] text-[var(--ink-1)] leading-tight">LIFNUX</div>
          <div className="text-lg text-[var(--ink-1)] leading-tight">Personal OS</div>
        </div>
      ) : null}
    </div>
  );
}
