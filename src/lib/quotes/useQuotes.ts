"use client";

import { useEffect, useMemo, useState } from "react";
import type { Quote } from "./types";

type QuotesState = {
  quotes: Quote[];
  isLoading: boolean;
  error: string | null;
};

export function useQuotes(symbols: string[]) {
  const [state, setState] = useState<QuotesState>({ quotes: [], isLoading: false, error: null });
  const key = useMemo(
    () =>
      symbols
        .map((symbol) => symbol.trim())
        .filter(Boolean)
        .map((symbol) => symbol.toUpperCase())
        .sort()
        .join(","),
    [symbols]
  );

  useEffect(() => {
    let mounted = true;
    let timer: number | undefined;
    const fetchQuotes = async () => {
      if (!key) {
        if (mounted) setState({ quotes: [], isLoading: false, error: null });
        return;
      }
      if (mounted) setState((prev) => ({ ...prev, isLoading: true }));
      try {
        const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(key)}`);
        if (!response.ok) throw new Error("Quotes request failed");
        const data = (await response.json()) as { quotes?: Quote[] };
        if (mounted) {
          setState({ quotes: data.quotes ?? [], isLoading: false, error: null });
        }
      } catch (error) {
        if (mounted) {
          setState({ quotes: [], isLoading: false, error: error instanceof Error ? error.message : "Unknown error" });
        }
      }
    };

    fetchQuotes();
    timer = window.setInterval(fetchQuotes, 30000);

    return () => {
      mounted = false;
      if (timer) window.clearInterval(timer);
    };
  }, [key]);

  const bySymbol = useMemo(() => {
    const map = new Map<string, Quote>();
    state.quotes.forEach((quote) => {
      map.set(quote.symbol.toUpperCase(), quote);
    });
    return map;
  }, [state.quotes]);

  return { ...state, bySymbol };
}
