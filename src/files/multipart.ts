// Only for bounded attachments, never for movie files.
export function attachmentBody(
  field: string,
  name: string,
  type: string,
  bytes: Uint8Array,
  fields: Record<string, string> = {},
) {
  const boundary = `AlpineFilm${Date.now()}${Math.random().toString(16).slice(2)}`;
  const encoder = new TextEncoder();
  const safeName = name.replace(/[\r\n"\\]/g, "_");
  const parts = [
    encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${safeName}"\r\nContent-Type: ${type}\r\n\r\n`,
    ),
    bytes,
  ];
  for (const [key, value] of Object.entries(fields))
    parts.push(
      encoder.encode(
        `\r\n--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}`,
      ),
    );
  parts.push(encoder.encode(`\r\n--${boundary}--\r\n`));
  const body = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.length;
  }
  return {
    body: body.buffer,
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
  };
}

export function posterType(b: Uint8Array) {
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v))
    return "image/png";
  if (
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  throw new Error(
    "La portada debe ser JPEG, PNG o WebP. Convierte la imagen antes de subirla.",
  );
}
