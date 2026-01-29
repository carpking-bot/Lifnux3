\"use client\";

import Link from "next/link";
import { useRef, useState } from "react";
import { ConfirmModal } from "../../(shared)/components/ConfirmModal";
import {
  downloadLifnuxExport,
  importLifnuxExport,
  isAutoBackupEnabled,
  setAutoBackupEnabled,
  validateLifnuxExport
} from "../../(shared)/lib/persistence";

type ToastState = { type: "success" | "error"; message: string } | null;

export default function LabPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<unknown | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [autoBackup, setAutoBackup] = useState<boolean>(() => (typeof window === "undefined" ? false : isAutoBackupEnabled()));

  const showToast = (next: ToastState) => {
    setToast(next);
    if (next) {
      window.setTimeout(() => setToast(null), 2400);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-[720px] space-y-6">
        {toast ? (
          <div className="lifnux-glass rounded-2xl px-4 py-3 text-sm text-[var(--ink-1)]">
            <span className={toast.type === "success" ? "text-[var(--accent-1)]" : "text-[var(--accent-2)]"}>
              {toast.message}
            </span>
          </div>
        ) : null}
        <div className="lifnux-glass rounded-2xl p-8">
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Lifnux Data Sync</div>
          <h1 className="mt-2 text-3xl">Export / Import</h1>
          <p className="mt-2 text-sm text-[var(--ink-1)]">
            Move your local Lifnux data between devices with a single JSON file.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black"
              onClick={() => {
                downloadLifnuxExport({ useBackup: true });
                showToast({ type: "success", message: "Export downloaded." });
              }}
            >
              Export Lifnux Data
            </button>
            <button
              className="rounded-full border border-white/10 px-4 py-2 text-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              Import Lifnux Data
            </button>
          </div>

          <div className="mt-6 flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Auto Backup</div>
              <div className="text-[var(--ink-1)]">Keep a latest snapshot for quick export.</div>
            </div>
            <button
              className={`rounded-full border px-4 py-1 text-xs ${
                autoBackup ? "border-[var(--accent-1)] text-[var(--accent-1)]" : "border-white/10 text-[var(--ink-1)]"
              }`}
              onClick={() => {
                const next = !autoBackup;
                setAutoBackup(next);
                setAutoBackupEnabled(next);
                showToast({
                  type: "success",
                  message: next ? "Auto backup enabled." : "Auto backup disabled."
                });
              }}
            >
              {autoBackup ? "Enabled" : "Disabled"}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const payload = JSON.parse(text);
                if (!validateLifnuxExport(payload)) {
                  showToast({ type: "error", message: "Invalid Lifnux export file." });
                  return;
                }
                setPendingImport(payload);
                setConfirmOpen(true);
              } catch {
                showToast({ type: "error", message: "Failed to read import file." });
              } finally {
                event.target.value = "";
              }
            }}
          />
        </div>

        <div className="text-center">
          <Link
            className="inline-flex items-center justify-center rounded-full border border-white/10 px-6 py-3 text-sm text-[var(--ink-1)]"
            href="/"
          >
            Back to Home
          </Link>
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Import Lifnux Data"
        description="기존 데이터가 모두 덮어써집니다. 계속하시겠습니까?"
        confirmLabel="Import"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          if (pendingImport && validateLifnuxExport(pendingImport)) {
            importLifnuxExport(pendingImport);
            showToast({ type: "success", message: "Import complete. Please refresh the page." });
          } else {
            showToast({ type: "error", message: "Invalid import payload." });
          }
          setPendingImport(null);
          setConfirmOpen(false);
        }}
        onCancel={() => {
          setPendingImport(null);
          setConfirmOpen(false);
        }}
      />
    </main>
  );
}
