import './styles.css';
import { mountShibaScene } from './animals/shibaScene.js';
import {
  loadSavedJson,
  onAppVisibilityChange,
  saveJson,
  setHapticsEnabled,
  startMotionSensors,
  stopMotionSensors,
  triggerHaptic,
  type HapticKind,
} from './native';

const SOUND_KEY = 'mochamocha_sound_v1';

async function bootstrap(): Promise<void> {
  const savedSound = await loadSavedJson<boolean>(SOUND_KEY);
  let soundOn = savedSound ?? true;
  setHapticsEnabled(true);

  const stage = document.getElementById('stage') as HTMLElement;
  const btnSound = document.getElementById('btnSound') as HTMLButtonElement;
  const icoOn = btnSound.querySelector('.ico-on') as SVGElement;
  const icoOff = btnSound.querySelector('.ico-off') as SVGElement;

  const scene = mountShibaScene(stage, {
    onHaptic: (kind: HapticKind) => {
      void triggerHaptic(kind);
    },
  });

  const syncSoundUi = () => {
    scene.setSoundEnabled(soundOn);
    btnSound.setAttribute('aria-pressed', String(soundOn));
    icoOn.toggleAttribute('hidden', !soundOn);
    icoOff.toggleAttribute('hidden', soundOn);
  };
  syncSoundUi();

  btnSound.addEventListener('click', () => {
    soundOn = !soundOn;
    syncSoundUi();
    void saveJson(SOUND_KEY, soundOn);
    void triggerHaptic('uiTick');
  });

  // iPhone-Gyroskop & Schütteln (startet automatisch bzw. beim ersten Tippen auf iOS)
  const motionCallbacks = {
    onTilt: (gx: number, gz: number) => scene.setTiltGravity(gx, gz),
    onShake: (intensity: number) => scene.triggerShake(intensity),
  };

  let motionListener: (() => void) | null = null;
  const clearMotionHook = () => {
    if (motionListener) {
      window.removeEventListener('pointerdown', motionListener);
      motionListener = null;
    }
  };

  const syncMotion = async (fromGesture = false) => {
    clearMotionHook();
    const res = await startMotionSensors(motionCallbacks, fromGesture);
    if (res === 'needs-permission') {
      motionListener = () => {
        clearMotionHook();
        void syncMotion(true);
      };
      window.addEventListener('pointerdown', motionListener, { passive: true });
    }
  };
  void syncMotion(false);

  onAppVisibilityChange((isActive) => {
    scene.setPaused(!isActive);
    if (!isActive) {
      stopMotionSensors();
      scene.setTiltGravity(0, 0);
    } else {
      void syncMotion(false);
    }
  });
}

void bootstrap();
