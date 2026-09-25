import { test } from "node:test";
import assert from "node:assert/strict";
import { resumePosition } from "../src/playback/progress.ts";
test("el último segundo y películas terminadas empiezan desde cero", () => {
  assert.equal(resumePosition(6597.4, 6598.4, false), 0);
  assert.equal(resumePosition(6598.4, 6598.4, false), 0);
  assert.equal(resumePosition(300, 6598.4, true), 0);
});
test("conserva reanudación útil sin reiniciar películas casi terminadas arbitrariamente", () => {
  assert.equal(resumePosition(1250, 6598.4), 1250);
  assert.equal(resumePosition(6500, 6598.4), 6500);
  assert.equal(resumePosition(8, 10), 8);
  assert.equal(resumePosition(9.9, 10), 0);
});
test("descarta progreso inválido o de una versión más larga", () => {
  for (const position of [NaN, Infinity, -1, 7200])
    assert.equal(resumePosition(position, 3600), 0);
  assert.equal(resumePosition(300, 0), 0);
  assert.equal(resumePosition(300, NaN), 0);
});
