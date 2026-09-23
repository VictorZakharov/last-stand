// Game-time scheduler (respects pause, unlike setTimeout).
interface Timer { t: number; fn: () => void }
const timers: Timer[] = [];

export function schedule(delay: number, fn: () => void): void { timers.push({ t: delay, fn }); }

export function updateTimers(dt: number): void {
  for (let i = timers.length - 1; i >= 0; i--) {
    const timer = timers[i]!;
    timer.t -= dt;
    if (timer.t <= 0) { timers.splice(i, 1); timer.fn(); }
  }
}

export function clearTimers(): void { timers.length = 0; }
