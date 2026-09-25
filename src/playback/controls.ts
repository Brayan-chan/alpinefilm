export function clampSeek(value: number, duration: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(duration) || duration <= 0)
    return 0;
  return Math.max(0, Math.min(value, duration));
}
export function formatPlaybackTime(value: number): string {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const hours = Math.floor(seconds / 3600),
    minutes = Math.floor(seconds / 60) % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
    : `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
