export function createWatchToken(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid.replace(/-/g, "");

  const entropy = Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}${entropy}`;
}

export function buildWatchUrl(token: string, baseUrl: string): string {
  return new URL(`/watch/${encodeURIComponent(token)}`, baseUrl).toString();
}

export function withLivePreviewParams(
  liveUrl: string,
  options: { theme?: "light" | "dark"; showChrome?: boolean } = {},
): string {
  const url = new URL(liveUrl);
  if (options.theme) url.searchParams.set("theme", options.theme);
  if (options.showChrome === false) {
    url.searchParams.set("ui", "false");
  } else if (options.showChrome === true) {
    url.searchParams.delete("ui");
  }
  return url.toString();
}
