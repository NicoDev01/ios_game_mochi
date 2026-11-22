import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';

export type HapticKind =
  | 'uiTick'
  | 'tap'
  | 'grab'
  | 'pet'
  | 'squish'
  | 'impact'
  | 'impactHeavy'
  | 'ballHit'
  | 'eat'
  | 'celebrate'
  | 'huff'
  | 'unlock';

const FOCUS_NOTIF_ID = 4201;

export const isNative = (): boolean => Capacitor.isNativePlatform();

let hapticsEnabled = true;
let lastSquishHaptic = 0;
let lastPetHaptic = 0;

export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = enabled;
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export async function triggerHaptic(kind: HapticKind): Promise<void> {
  if (!hapticsEnabled || !isNative()) return;
  const now = performance.now();
  if (kind === 'squish') {
    if (now - lastSquishHaptic < 140) return;
    lastSquishHaptic = now;
  }
  if (kind === 'pet') {
    if (now - lastPetHaptic < 160) return;
    lastPetHaptic = now;
  }
  try {
    switch (kind) {
      case 'uiTick':
      case 'pet':
      case 'squish':
        await Haptics.selectionChanged();
        break;
      case 'tap':
      case 'ballHit':
      case 'eat':
        await Haptics.impact({ style: ImpactStyle.Light });
        break;
      case 'grab':
      case 'impact':
        await Haptics.impact({ style: ImpactStyle.Medium });
        break;
      case 'impactHeavy':
        await Haptics.impact({ style: ImpactStyle.Heavy });
        break;
      case 'huff':
        await Haptics.notification({ type: NotificationType.Warning });
        break;
      case 'unlock':
        await Haptics.impact({ style: ImpactStyle.Light });
        await wait(70);
        await Haptics.notification({ type: NotificationType.Success });
        break;
      case 'celebrate':
        await Haptics.impact({ style: ImpactStyle.Light });
        await wait(75);
        await Haptics.impact({ style: ImpactStyle.Medium });
        await wait(85);
        await Haptics.notification({ type: NotificationType.Success });
        break;
    }
  } catch {
    // Graceful no-op on unsupported devices
  }
}

export async function loadSavedJson<T>(key: string): Promise<T | null> {
  try {
    if (isNative()) {
      const { value } = await Preferences.get({ key });
      return value ? (JSON.parse(value) as T) : null;
    }
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function saveJson(key: string, data: unknown): Promise<void> {
  const serialized = JSON.stringify(data);
  try {
    if (isNative()) {
      await Preferences.set({ key, value: serialized });
    } else {
      localStorage.setItem(key, serialized);
    }
  } catch {
    // Storage unavailable
  }
}

export async function scheduleFocusNotification(
  endAtMs: number,
  title: string,
  body: string,
): Promise<void> {
  if (!isNative()) return;
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return;
    }
    await LocalNotifications.cancel({ notifications: [{ id: FOCUS_NOTIF_ID }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: FOCUS_NOTIF_ID,
          title,
          body,
          schedule: { at: new Date(endAtMs) },
        },
      ],
    });
  } catch {
    // Ignore notification permission / scheduling failures
  }
}

export async function cancelFocusNotification(): Promise<void> {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: FOCUS_NOTIF_ID }] });
  } catch {
    // Ignore
  }
}

export function onAppVisibilityChange(cb: (isActive: boolean) => void): () => void {
  const onDocVis = () => cb(document.visibilityState === 'visible');
  document.addEventListener('visibilitychange', onDocVis);

  let removeCap: (() => void) | null = null;
  if (isNative()) {
    App.addListener('appStateChange', ({ isActive }) => cb(isActive))
      .then((handle) => {
        removeCap = () => {
          handle.remove().catch(() => {});
        };
      })
      .catch(() => {});
  }

  return () => {
    document.removeEventListener('visibilitychange', onDocVis);
    removeCap?.();
  };
}

export interface MotionCallbacks {
  onTilt: (gx: number, gz: number) => void;
  onShake: (intensity: number) => void;
}

export type MotionStartResult = 'started' | 'needs-permission' | 'denied' | 'unsupported';

interface PermissionableEvent {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

export function needsMotionPermission(): boolean {
  if (typeof window === 'undefined') return false;
  const dme = window.DeviceMotionEvent as unknown as PermissionableEvent | undefined;
  const doe = window.DeviceOrientationEvent as unknown as PermissionableEvent | undefined;
  return typeof dme?.requestPermission === 'function' || typeof doe?.requestPermission === 'function';
}

let activeMotionCleanup: (() => void) | null = null;
let motionPermissionGranted = false;

export function stopMotionSensors(): void {
  activeMotionCleanup?.();
  activeMotionCleanup = null;
}

export async function startMotionSensors(
  callbacks: MotionCallbacks,
  fromUserGesture = false,
): Promise<MotionStartResult> {
  if (typeof window === 'undefined' || (!('DeviceOrientationEvent' in window) && !('DeviceMotionEvent' in window))) {
    return 'unsupported';
  }

  const dme = window.DeviceMotionEvent as unknown as PermissionableEvent | undefined;
  const doe = window.DeviceOrientationEvent as unknown as PermissionableEvent | undefined;
  const requiresPerm = typeof dme?.requestPermission === 'function' || typeof doe?.requestPermission === 'function';

  if (requiresPerm && !motionPermissionGranted) {
    if (!fromUserGesture) return 'needs-permission';
    try {
      let granted = false;
      if (typeof doe?.requestPermission === 'function') {
        granted = (await doe.requestPermission()) === 'granted' || granted;
      }
      if (typeof dme?.requestPermission === 'function') {
        granted = (await dme.requestPermission()) === 'granted' || granted;
      }
      if (!granted) return 'denied';
      motionPermissionGranted = true;
    } catch {
      return 'denied';
    }
  }

  stopMotionSensors();

  const applyDeadzone = (v: number, dz: number): number => {
    if (Math.abs(v) <= dz) return 0;
    return Math.sign(v) * Math.min(1, (Math.abs(v) - dz) / (1 - dz));
  };

  let filtGx = 0;
  let filtGz = 0;
  let lastShakeMs = 0;
  let prevAccMag = 9.81;

  const onOrientation = (e: DeviceOrientationEvent) => {
    if (typeof e.gamma !== 'number' || typeof e.beta !== 'number') return;
    // Screen-orientation mapping so tilt feels natural in portrait & landscape
    const angle = window.screen?.orientation?.angle ?? 0;
    let rawRight = e.gamma;
    let rawForward = e.beta - 45; // ~45° comfortable handheld neutral posture

    if (angle === 90) {
      rawRight = e.beta;
      rawForward = -e.gamma - 45;
    } else if (angle === 270 || angle === -90) {
      rawRight = -e.beta;
      rawForward = e.gamma - 45;
    }

    const nx = Math.max(-1, Math.min(1, rawRight / 34));
    const nz = Math.max(-1, Math.min(1, rawForward / 34));
    const gx = applyDeadzone(nx, 0.14);
    const gz = applyDeadzone(nz, 0.16);

    filtGx += (gx - filtGx) * 0.28;
    filtGz += (gz - filtGz) * 0.28;
    callbacks.onTilt(filtGx, filtGz);
  };

  const onMotion = (e: DeviceMotionEvent) => {
    const now = performance.now();
    if (now - lastShakeMs < 900) return;

    const lin = e.acceleration;
    let linearMag = 0;
    if (lin && typeof lin.x === 'number' && typeof lin.y === 'number' && typeof lin.z === 'number') {
      linearMag = Math.hypot(lin.x, lin.y, lin.z);
    } else if (e.accelerationIncludingGravity) {
      const ag = e.accelerationIncludingGravity;
      if (typeof ag.x === 'number' && typeof ag.y === 'number' && typeof ag.z === 'number') {
        const mag = Math.hypot(ag.x, ag.y, ag.z);
        linearMag = Math.abs(mag - prevAccMag);
        prevAccMag = prevAccMag * 0.8 + mag * 0.2;
      }
    }

    if (linearMag > 13.5) {
      lastShakeMs = now;
      callbacks.onShake(Math.min(1.5, linearMag / 16));
    }
  };

  window.addEventListener('deviceorientation', onOrientation, { passive: true });
  window.addEventListener('devicemotion', onMotion, { passive: true });

  activeMotionCleanup = () => {
    window.removeEventListener('deviceorientation', onOrientation);
    window.removeEventListener('devicemotion', onMotion);
    callbacks.onTilt(0, 0);
  };

  return 'started';
}
