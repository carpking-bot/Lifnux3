import type { ShoppingItem } from "../types/calendar";

const importanceOrder: Record<ShoppingItem["importance"], number> = {
  HIGH: 3,
  MIDDLE: 2,
  LOW: 1
};

const normalizeName = (value: string) => value.trim().toLowerCase();

export const formatPrice = (price?: number) => {
  if (typeof price !== "number" || Number.isNaN(price)) return "";
  return `₩${price.toLocaleString("ko-KR")}`;
};

export const sortShoppingItems = (items: ShoppingItem[]) => {
  return [...items].sort((a, b) => {
    const importanceDiff = importanceOrder[b.importance] - importanceOrder[a.importance];
    if (importanceDiff !== 0) return importanceDiff;
    const aHasPrice = typeof a.price === "number" && !Number.isNaN(a.price);
    const bHasPrice = typeof b.price === "number" && !Number.isNaN(b.price);
    if (aHasPrice && bHasPrice) {
      if (a.price !== b.price) return (a.price ?? 0) - (b.price ?? 0);
    } else if (aHasPrice !== bHasPrice) {
      return aHasPrice ? -1 : 1;
    }
    return normalizeName(a.name).localeCompare(normalizeName(b.name));
  });
};
