export function canControlTV(state: string, action: string): boolean {
  if (action === "GetTransportInfo") return true;
  if (action === "Play") return ["STOPPED", "PAUSED_PLAYBACK"].includes(state);
  if (action === "Pause") return state === "PLAYING";
  if (action === "Stop") return ["PLAYING", "PAUSED_PLAYBACK"].includes(state);
  return false;
}

export function tvErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/UPnP\s+701\b/.test(message))
    return "La TV no puede ejecutar ese control en su estado actual. Pulsa Consultar para actualizarlo; si indica Sin video, primero necesita recibir una película.";
  return message || "No se pudo contactar con la TV.";
}
