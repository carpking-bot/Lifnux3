import dataset from "./asset_dataset.json";

export type AssetDatasetAccount = {
  id: string;
  name: string;
  group: "CASH" | "SAVING" | "INVESTING" | "PHYSICAL" | "DEBT";
  subGroup: string;
  memo?: string;
};

export type AssetDatasetSnapshot = {
  month: string;
  createdAt: string;
  lines: Array<{
    accountId: string;
    valueKRW: number;
  }>;
};

export type AssetDataset = {
  accounts: AssetDatasetAccount[];
  snapshots: AssetDatasetSnapshot[];
};

export function loadAssetDataset(): AssetDataset {
  const accounts = (dataset.accounts ?? []) as AssetDatasetAccount[];
  const snapshots = (dataset.snapshots ?? []) as AssetDatasetSnapshot[];
  return {
    accounts,
    snapshots
  };
}
