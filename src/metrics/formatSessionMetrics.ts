/** Human-readable in-app foreground duration (not OS screen time). */
export function formatForegroundInApp(ms: number): string {
  if (ms < 1500) {
    return '<2s in app';
  }
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m in app`;
  }
  if (m === 0) {
    return `${s}s in app`;
  }
  return `${m}m ${s}s in app`;
}

export function formatSteps(n: number): string {
  if (n <= 0) return '0 steps';
  if (n === 1) return '1 step';
  return `${n} steps`;
}

export function formatDistanceApprox(meters: number): string {
  if (meters < 1) return '<1 m est.';
  if (meters < 1000) {
    return `~${Math.round(meters)} m walked (est.)`;
  }
  return `~${(meters / 1000).toFixed(2)} km walked (est.)`;
}

export function formatBackgroundBreaks(n: number): string {
  if (n <= 0) return 'No app switches';
  if (n === 1) return '1 time left app';
  return `${n} times left app`;
}
