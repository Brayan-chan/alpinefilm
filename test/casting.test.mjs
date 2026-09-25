import test from "node:test";
import assert from "node:assert/strict";
import { canControlTV, tvErrorMessage } from "../src/casting/transport.ts";

test("sin video, estado desconocido y transición sólo permiten consultar", () => {
  for (const state of ["", "NO_MEDIA_PRESENT", "TRANSITIONING", "UNKNOWN"]) {
    assert.equal(canControlTV(state, "GetTransportInfo"), true);
    for (const action of ["Play", "Pause", "Stop"])
      assert.equal(canControlTV(state, action), false);
  }
});
test("los controles siguen el estado de reproducción y los errores 701 son comprensibles", () => {
  assert.equal(canControlTV("PLAYING", "Pause"), true);
  assert.equal(canControlTV("PLAYING", "Play"), false);
  assert.equal(canControlTV("PAUSED_PLAYBACK", "Play"), true);
  assert.equal(canControlTV("STOPPED", "Pause"), false);
  assert.match(
    tvErrorMessage(new Error("Native rejected: HTTP 500, UPnP 701")),
    /estado actual/,
  );
  assert.equal(tvErrorMessage(new Error("Sin Wi-Fi")), "Sin Wi-Fi");
});
