import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const rawPath = path.join(root, "app", "(apps)", "finance", "asset", "asset_dataset.raw.txt");
const outPath = path.join(root, "app", "(apps)", "finance", "asset", "asset_dataset.json");

const raw = fs.readFileSync(rawPath, "utf8");
const source = raw.replace(/\r?\n/g, "\n");
const lines = source.split("\n").map((line) => line.trim()).filter(Boolean);
const expectedMonths = [
  "2024-03",
  "2024-04",
  "2024-06",
  "2024-07",
  "2024-08",
  "2024-09",
  "2024-10",
  "2024-11",
  "2024-12",
  "2025-01",
  "2025-02",
  "2025-03",
  "2025-04",
  "2025-05",
  "2025-06",
  "2025-07",
  "2025-08",
  "2025-09",
  "2025-10",
  "2025-11",
  "2025-12",
  "2026-01"
];

const timestampMatches = [...source.matchAll(/(\d{4}[.-]\d{2}[.-]\d{2})\s+(\d{1,2}:\d{2})/g)].map((m) => `${m[1]} ${m[2]}`);
if (!timestampMatches.length) {
  throw new Error("No update timestamps found.");
}

const timestampToIso = (value) => {
  const m = value.match(/(\d{4})[.-](\d{2})[.-](\d{2})\s+(\d{1,2}):(\d{2})/);
  if (!m) return new Date().toISOString();
  const [, y, mo, d, h, mi] = m;
  return `${y}-${mo}-${d}T${String(Number(h)).padStart(2, "0")}:${mi}:00.000Z`;
};

const tailAfterTimestamps = source.slice((source.match(/(\d{4}[.-]\d{2}[.-]\d{2})\s+\d{1,2}:\d{2}(?![\s\S]*(\d{4}[.-]\d{2}[.-]\d{2})\s+\d{1,2}:\d{2})/) || { index: 0 }).index || 0);
const monthsFound = [...tailAfterTimestamps.matchAll(/\b(20\d{2})\.\s*(\d{1,2})\.?\b/g)].map((m) => `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`);
const parsedMonths = Array.from(new Set(monthsFound));
const months = expectedMonths.length <= timestampMatches.length ? expectedMonths : parsedMonths.slice(0, timestampMatches.length);

if (!months.length) {
  throw new Error("No month labels found.");
}

const accounts = [
  { id: "woori_super", name: "우리SUPER주거래통장", group: "CASH", subGroup: "예금/입출금 계좌" },
  { id: "kb_nara_sarang", name: "KB나라사랑우대통장", group: "CASH", subGroup: "예금/입출금 계좌" },
  { id: "cash_wallet", name: "현금", group: "CASH", subGroup: "현금" },
  { id: "kiwoom_kr_active", name: "키움증권(국내)", group: "INVESTING", subGroup: "액티브" },
  { id: "kiwoom_us_active", name: "키움증권(해외)", group: "INVESTING", subGroup: "액티브" },
  { id: "namu_isa", name: "나무증권(ISA)", group: "INVESTING", subGroup: "ISA" },
  { id: "meritz_super365", name: "메리츠증권(Super365)", group: "INVESTING", subGroup: "액티브" },
  { id: "meritz_pension", name: "메리츠증권(연금저축펀드)", group: "INVESTING", subGroup: "연금저축펀드" },
  { id: "toss_overseas_active", name: "토스증권(해외)", group: "INVESTING", subGroup: "액티브" },
  { id: "upbit_crypto", name: "업비트(코인)", group: "CASH", subGroup: "코인" },
  { id: "naverpay_money", name: "네이버페이 머니", group: "CASH", subGroup: "플랫폼/페이머니" },
  { id: "kakaopay_money", name: "카카오페이 머니", group: "CASH", subGroup: "플랫폼/페이머니" },
  { id: "tosspay_money", name: "토스페이 머니", group: "CASH", subGroup: "플랫폼/페이머니" },
  { id: "nh_housing", name: "주택청약종합저축(농협)", group: "SAVING", subGroup: "주택 청약" },
  { id: "kb_youth_jump", name: "KB청년도약계좌", group: "SAVING", subGroup: "청약", memo: "만기 2030.11.03" },
  { id: "card_woori", name: "카드값 (우리)", group: "DEBT", subGroup: "카드값" },
  { id: "card_kb", name: "카드값 (KB)", group: "DEBT", subGroup: "카드값" }
];

const rowDefs = {
  woori_super: ["우리은행(현금 계좌)"],
  kb_nara_sarang: ["국민은행(카드값 및 비상금)"],
  cash_wallet: ["현금"],
  kiwoom_kr_active: ["키움증권 (국내 액티브 / 예수금)", "키움증권 (국내 액티브 / 잔고)"],
  kiwoom_us_active: ["키움증권 (해외 액티브 / 예수금)", "키움증권 (해외 액티브 / 잔고)"],
  namu_isa: ["나무증권 (ISA / 예수금)", "나무증권 (ISA / 잔고)"],
  meritz_super365: ["메리츠증권 (해외 장기투자 / 예수금)", "메리츠증권 (해외 장기투자 / 잔고)"],
  meritz_pension: ["메리츠증권 (연금저축펀드 / 예수금)", "메리츠증권 (연금저축펀드 / 잔고)"],
  toss_overseas_active: ["토스증권 (텐배거 / 예수금)", "토스증권 (텐배거 / 잔고)"],
  upbit_crypto: ["업비트 (잔고)"],
  naverpay_money: ["네이버페이 머니"],
  kakaopay_money: ["카카오페이 머니"],
  tosspay_money: ["토스페이 머니"],
  nh_housing: ["주택청약 (농협)"],
  kb_youth_jump: ["청년도약계좌 (KB)"],
  card_woori: ["이번달 카드 값(우리)"],
  card_kb: ["이번달 카드 값(KB)"]
};

const orderedLabels = [
  "총 자산",
  "현금성 자산",
  "우리은행(현금 계좌)",
  "국민은행(카드값 및 비상금)",
  "현금",
  "투자 자산",
  "키움증권 (국내 액티브 / 예수금)",
  "키움증권 (국내 액티브 / 잔고)",
  "키움증권 (해외 액티브 / 예수금)",
  "키움증권 (해외 액티브 / 잔고)",
  "나무증권 (ISA / 예수금)",
  "나무증권 (ISA / 잔고)",
  "메리츠증권 (해외 장기투자 / 예수금)",
  "메리츠증권 (해외 장기투자 / 잔고)",
  "메리츠증권 (연금저축펀드 / 예수금)",
  "메리츠증권 (연금저축펀드 / 잔고)",
  "토스증권 (텐배거 / 예수금)",
  "토스증권 (텐배거 / 잔고)",
  "업비트 (예수금)",
  "업비트 (잔고)",
  "기타 자산",
  "네이버페이 머니",
  "카카오페이 머니",
  "토스페이 머니",
  "주택청약 (농협)",
  "청년도약계좌 (KB)",
  "부채",
  "이번달 카드 값(우리)",
  "이번달 카드 값(KB)",
  "증감폭"
];

const valueTokenRegex = /-?\s*₩\s*[0-9,]+|₩\s*-\s*|\b-\b/g;

const parseToken = (token) => {
  const compact = token.replace(/\s+/g, "");
  if (!/\d/.test(compact)) return 0;
  const magnitude = Number(compact.replace(/[^0-9]/g, ""));
  if (!Number.isFinite(magnitude)) return 0;
  const isNegative = compact.startsWith("-");
  return isNegative ? -magnitude : magnitude;
};

const normalizeValuesLength = (values, target) => {
  if (values.length === target) return values;
  if (values.length > target) return values.slice(0, target);
  return new Array(target - values.length).fill(0).concat(values);
};

const findLineByLabel = (label) =>
  lines.find((line) => line === label || line.startsWith(`${label} `) || line.startsWith(`${label}\t`)) ?? null;

const extractRowValues = (label) => {
  const line = findLineByLabel(label);
  if (!line) return new Array(months.length).fill(0);
  const payload = line.startsWith(label) ? line.slice(label.length).trim() : "";
  const tokens = [...payload.matchAll(valueTokenRegex)].map((m) => parseToken(m[0]));
  return normalizeValuesLength(tokens, months.length);
};

const rowCache = new Map();
orderedLabels.forEach((label) => rowCache.set(label, extractRowValues(label)));

const accountValuesById = {};
for (const account of accounts) {
  const labels = rowDefs[account.id] ?? [];
  const sum = new Array(months.length).fill(0);
  labels.forEach((label) => {
    const values = rowCache.get(label) ?? new Array(months.length).fill(0);
    values.forEach((value, idx) => {
      sum[idx] += value;
    });
  });
  accountValuesById[account.id] = sum;
}

const snapshots = months.map((month, idx) => {
  const createdAt = timestampToIso(timestampMatches[Math.min(idx, timestampMatches.length - 1)]);
  const lines = accounts.map((account) => ({
    accountId: account.id,
    valueKRW: accountValuesById[account.id]?.[idx] ?? 0
  }));
  return { month, createdAt, lines };
});

const expectedTotals = rowCache.get("총 자산") ?? new Array(months.length).fill(0);
const totalMismatches = snapshots
  .map((snapshot, idx) => {
    const actual = snapshot.lines.reduce((sum, line) => sum + line.valueKRW, 0);
    const expected = expectedTotals[idx] ?? 0;
    return { month: snapshot.month, expected, actual, diff: actual - expected };
  })
  .filter((entry) => entry.diff !== 0);

const dataset = {
  accounts,
  snapshots,
  validation: {
    totalAgainstSheet: totalMismatches.length === 0 ? "OK" : "틀렸습니다",
    mismatchCount: totalMismatches.length,
    mismatches: totalMismatches
  }
};
fs.writeFileSync(outPath, JSON.stringify(dataset, null, 2), "utf8");

const totalOf = (snapshot) => snapshot.lines.reduce((sum, line) => sum + line.valueKRW, 0);
const first = snapshots[0];
const last = snapshots[snapshots.length - 1];

console.log(`[asset-dataset] accounts=${accounts.length}, snapshots=${snapshots.length}`);
if (first) console.log(`[asset-dataset] first ${first.month} total=${totalOf(first).toLocaleString("ko-KR")}`);
if (last) console.log(`[asset-dataset] last ${last.month} total=${totalOf(last).toLocaleString("ko-KR")}`);
if (totalMismatches.length === 0) {
  console.log("[asset-dataset] total check: OK");
} else {
  console.log(`[asset-dataset] total check: 틀렸습니다 (${totalMismatches.length})`);
  totalMismatches.forEach((item) => {
    console.log(` - ${item.month}: expected=${item.expected.toLocaleString("ko-KR")}, actual=${item.actual.toLocaleString("ko-KR")}, diff=${item.diff.toLocaleString("ko-KR")}`);
  });
}
