export type Quote = {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  currency?: string | null;
  marketTime?: string | null;
  source: "finnhub";
};
