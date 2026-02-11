export type Quote = {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  currency?: string | null;
  marketTime?: string | null;
  source: "kis" | "daum" | "naver" | "manual";
  name?: string | null;
  warning?: string | null;
};
