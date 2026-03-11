"use client";

import { useEffect } from "react";
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

export function LifnuxStartupDataSync() {
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
      if (!Number.isFinite(remoteTs) || remoteTs <= localTs) return;

      const confirmed = window.confirm("최신 local data가 있습니다. 업데이트하시겠습니까?");
      if (!confirmed) return;

      const payloadRes = await fetch("/api/local-sync/latest-export?includePayload=true", { cache: "no-store" });
      if (!payloadRes.ok) return;
      const payloadEnvelope = (await payloadRes.json()) as LatestExportPayloadResponse;
      const payload = payloadEnvelope?.payload;
      if (!payload || !validateLifnuxExport(payload)) return;
      importLifnuxExport(payload);
      window.location.reload();
    };

    void run();
  }, []);

  return null;
}

