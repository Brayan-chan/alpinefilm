import { test } from "node:test";
import assert from "node:assert/strict";
import { attachmentBody, posterType } from "../src/files/multipart.ts";

test("multipart conserva bytes binarios, nombre y campos de subtítulos", async () => {
  const bytes = new Uint8Array([0, 255, 13, 10, 128, 34]);
  const encoded = attachmentBody(
    "subtitle",
    "película.vtt",
    "text/vtt",
    bytes,
    { language: "es", label: "Español" },
  );
  const parsed = await new Response(encoded.body, {
    headers: encoded.headers,
  }).formData();
  const file = parsed.get("subtitle");
  assert.equal(file.name, "película.vtt");
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
  assert.equal(parsed.get("language"), "es");
  assert.equal(parsed.get("label"), "Español");
});
test("portada usa tipo real y rechaza formatos no admitidos", async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(posterType(bytes), "image/png");
  assert.equal(posterType(new Uint8Array([255, 216, 255])), "image/jpeg");
  assert.throws(
    () => posterType(new TextEncoder().encode("not an image")),
    /JPEG/,
  );
  const encoded = attachmentBody(
    "poster",
    "cover.png",
    posterType(bytes),
    bytes,
  );
  const parsed = await new Response(encoded.body, {
    headers: encoded.headers,
  }).formData();
  assert.equal(parsed.get("poster").type, "image/png");
});
