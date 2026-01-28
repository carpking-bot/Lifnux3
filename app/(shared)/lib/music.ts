export function parseVideoId(input: string) {
  try {
    const url = new URL(input);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace("/", "");
    }
    if (url.searchParams.get("v")) {
      return url.searchParams.get("v");
    }
    if (url.pathname.includes("/embed/")) {
      return url.pathname.split("/embed/")[1];
    }
  } catch {
    return input.trim();
  }
  return input.trim();
}

export const RATING_PRESET_NAMES = ["★", "★★", "★★★", "★★★★", "★★★★★"] as const;

export function isRatingPresetName(name: string) {
  return RATING_PRESET_NAMES.includes(name as (typeof RATING_PRESET_NAMES)[number]);
}

export function ratingToPresetName(rating: number) {
  if (rating < 1 || rating > 5) return null;
  return RATING_PRESET_NAMES[rating - 1];
}
