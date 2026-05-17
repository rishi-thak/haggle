import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWatchUrl, withLivePreviewParams } from "./watch";

test("buildWatchUrl creates a stable absolute dashboard URL", () => {
  assert.equal(
    buildWatchUrl("abc123", "https://haggle.example/"),
    "https://haggle.example/watch/abc123",
  );
});

test("withLivePreviewParams preserves Browser Use websocket params and applies UI prefs", () => {
  assert.equal(
    withLivePreviewParams("https://live.browser-use.com?wss=session&theme=light", {
      theme: "dark",
      showChrome: false,
    }),
    "https://live.browser-use.com/?wss=session&theme=dark&ui=false",
  );
});
