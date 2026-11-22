import type { ActiveFocusSession, FocusPreset } from './state.ts';

export function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function createFocusSession(preset: FocusPreset, nowMs = Date.now()): ActiveFocusSession {
  return {
    presetId: preset.id,
    minutes: preset.minutes,
    stars: preset.stars,
    startedAt: nowMs,
    endAt: nowMs + preset.minutes * 60_000,
  };
}

export class FocusTimerController {
  private session: ActiveFocusSession | null = null;
  private intervalId: number | null = null;
  private onTick: (remainingMs: number) => void;
  private onComplete: (session: ActiveFocusSession) => void;

  constructor(
    onTick: (remainingMs: number) => void,
    onComplete: (session: ActiveFocusSession) => void,
  ) {
    this.onTick = onTick;
    this.onComplete = onComplete;
  }

  get active(): ActiveFocusSession | null {
    return this.session;
  }

  restore(session: ActiveFocusSession | null, nowMs = Date.now()): void {
    this.stopInterval();
    this.session = session;
    if (!session) return;
    this.check(nowMs);
    if (this.session) {
      this.intervalId = window.setInterval(() => this.check(Date.now()), 500);
    }
  }

  start(preset: FocusPreset, nowMs = Date.now()): ActiveFocusSession {
    const session = createFocusSession(preset, nowMs);
    this.restore(session, nowMs);
    return session;
  }

  cancel(): void {
    this.stopInterval();
    this.session = null;
  }

  check(nowMs = Date.now()): void {
    if (!this.session) return;
    const rem = this.session.endAt - nowMs;
    if (rem <= 0) {
      const finished = this.session;
      this.stopInterval();
      this.session = null;
      this.onTick(0);
      this.onComplete(finished);
    } else {
      this.onTick(rem);
    }
  }

  private stopInterval(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
