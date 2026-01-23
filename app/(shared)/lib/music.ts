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
