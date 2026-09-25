export function resumePosition(
  position: number,
  duration: number,
  completed = false,
): number {
  if (
    completed ||
    !Number.isFinite(position) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    position < 0
  )
    return 0;
  // Finished or nearly finished movies start again, including legacy progress
  // saved just before playToEnd could mark the movie as completed.
  const endMargin = Math.min(30, duration * 0.02);
  return position >= duration - endMargin ? 0 : position;
}
