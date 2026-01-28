"use client";

import { useEffect, useRef } from "react";
import { Modal } from "./Modal";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  showCancel?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  detail,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  showCancel = true,
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const target = showCancel ? cancelRef.current : confirmRef.current;
    target?.focus();
  }, [open, showCancel]);

  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      closeOnBackdrop
      closeOnEsc
      actions={
        <>
          {showCancel ? (
            <button
              ref={cancelRef}
              className="rounded-full border border-white/10 px-4 py-2 text-xs"
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
          ) : null}
          <button
            ref={confirmRef}
            className={`rounded-full px-4 py-2 text-xs text-black ${
              variant === "danger" ? "bg-[var(--accent-2)]" : "bg-[var(--accent-1)]"
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-2 text-sm text-[var(--ink-1)]">
        <div className="text-[var(--ink-0)]">{description}</div>
        {detail ? <div className="text-[var(--ink-1)]">{detail}</div> : null}
      </div>
    </Modal>
  );
}
