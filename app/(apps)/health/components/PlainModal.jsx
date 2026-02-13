"use client";
import { useEffect } from "react";
export function PlainModal({ open, title, onClose, children, actions, panelClassName }) {
    useEffect(() => {
        if (!open)
            return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKeyDown = (event) => {
            if (event.key === "Escape")
                onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.body.style.overflow = previous;
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [open, onClose]);
    if (!open)
        return null;
    return (<div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4" onMouseDown={onClose}>
      <div className={`w-full max-w-2xl rounded-2xl border border-white/10 bg-[#111823] p-5 ${panelClassName ?? ""}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl">{title}</h2>
          <button className="rounded-full border border-white/15 px-3 py-1 text-xs text-[var(--ink-1)]" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
        {actions ? <div className="mt-6 flex justify-end gap-2">{actions}</div> : null}
      </div>
    </div>);
}
