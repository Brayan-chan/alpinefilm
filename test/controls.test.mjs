import { test } from "node:test";
import assert from "node:assert/strict";
import { clampSeek, formatPlaybackTime } from "../src/playback/controls.ts";
test("los saltos y la barra respetan los límites del archivo", () => {
  assert.equal(clampSeek(-10, 100), 0);
  assert.equal(clampSeek(110, 100), 100);
  assert.equal(clampSeek(45.5, 100), 45.5);
  assert.equal(clampSeek(NaN, 100), 0);
  assert.equal(clampSeek(30, 0), 0);
});
test("los tiempos de reproducción admiten películas de varias horas", () => {
  assert.equal(formatPlaybackTime(0), "0:00");
  assert.equal(formatPlaybackTime(65), "1:05");
  assert.equal(formatPlaybackTime(6598.4), "1:49:58");
  assert.equal(formatPlaybackTime(NaN), "0:00");
});
