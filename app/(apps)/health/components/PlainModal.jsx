"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

let bodyScrollLockCount = 0;
let bodyOriginalOverflow = "";

export function PlainModal({ open, title, onClose, children, actions, panelClassName }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (bodyScrollLockCount === 0) {
      bodyOriginalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    bodyScrollLockCount += 1;

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
      if (bodyScrollLockCount === 0) {
        document.body.style.overflow = bodyOriginalOverflow;
      }
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4" onMouseDown={onClose}>
      <div
        className={`w-full max-w-2xl rounded-2xl border border-white/15 bg-[#0b1220] p-5 ${panelClassName ?? ""}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl">{title}</h2>
          <button className="rounded-full border border-white/15 px-3 py-1 text-xs text-[var(--ink-1)]" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
        {actions ? <div className="mt-6 flex justify-end gap-2">{actions}</div> : null}
      </div>
    </div>,
    document.body
  );
}
