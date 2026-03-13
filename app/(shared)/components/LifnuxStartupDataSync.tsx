"use client";

import { useEffect, useState } from "react";
import { ConfirmModal } from "./ConfirmModal";
import { getLocalDataLastUpdatedAt, importLifnuxExport, validateLifnuxExport } from "../lib/persistence";

type LatestExportResponse = {
  hasExport: boolean;
  filename?: string;
  modifiedAt?: string;
};

type LatestExportPayloadResponse = {
  hasExport: boolean;
  filename?: string;
  modifiedAt?: string;
  payload?: unknown;
};

const AUTO_SYNC_CHECK_KEY = "lifnux:auto-sync.checked";

function toTimestamp(value?: string) {
  const ts = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ts) ? ts : NaN;
}

function formatDate(value?: string) {
  const ts = toTimestamp(value);
  if (!Number.isFinite(ts)) return "-";
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

function isRemoteDataNewer(remoteTs: number, localTs: number) {
  return Number.isFinite(remoteTs) && Number.isFinite(localTs) && remoteTs > localTs;
}

type StartupSyncPrompt = {
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  filename: string;
};

export function LifnuxStartupDataSync() {
  const [prompt, setPrompt] = useState<StartupSyncPrompt | null>(null);

  const applyLatestExport = async () => {
    if (!prompt) return;
    try {
      const payloadRes = await fetch("/api/local-sync/latest-export?includePayload=true", { cache: "no-store" });
      if (!payloadRes.ok) return;
      const payloadEnvelope = (await payloadRes.json()) as LatestExportPayloadResponse;
      const payload = payloadEnvelope?.payload;
      if (!payload || !validateLifnuxExport(payload)) return;
      importLifnuxExport(payload);
      window.location.reload();
    } finally {
      setPrompt(null);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(AUTO_SYNC_CHECK_KEY) === "done") return;

    const run = async () => {
      sessionStorage.setItem(AUTO_SYNC_CHECK_KEY, "done");

      const localUpdatedAt = getLocalDataLastUpdatedAt();
      if (!localUpdatedAt) return;

      const localTs = toTimestamp(localUpdatedAt);
      if (!Number.isFinite(localTs)) return;

      const latestRes = await fetch("/api/local-sync/latest-export", { cache: "no-store" });
      if (!latestRes.ok) return;
      const latest = (await latestRes.json()) as LatestExportResponse;
      if (!latest?.hasExport || !latest.modifiedAt || !latest.filename) return;

      const remoteTs = toTimestamp(latest.modifiedAt);
      if (!isRemoteDataNewer(remoteTs, localTs)) return;
      setPrompt({
        localUpdatedAt: localUpdatedAt,
        remoteUpdatedAt: latest.modifiedAt,
        filename: latest.filename
      });
    };

    void run();
  }, []);

  return (
    <ConfirmModal
      open={Boolean(prompt)}
      title="최신 local data 업데이트"
      description="프로젝트 내 exports 폴더에 더 최신 local file가 있습니다. 지금 업데이트하시겠습니까?"
      detail={
        prompt
          ? `${prompt.filename} | 기기 데이터: ${formatDate(prompt.localUpdatedAt)} | 파일 수정일: ${formatDate(prompt.remoteUpdatedAt)}`
          : ""
      }
      confirmLabel="업데이트"
      cancelLabel="나중에"
      onConfirm={() => {
        void applyLatestExport();
      }}
      onCancel={() => {
        setPrompt(null);
      }}
    />
  );
}
