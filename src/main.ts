import './styles.css';
import { mountShibaScene } from './animals/shibaScene.js';
import { FocusTimerController, formatRemaining } from './focusTimer';
import { getTranslations, type Lang } from './i18n';
import {
  cancelFocusNotification,
  loadSavedJson,
  onAppVisibilityChange,
  saveJson,
  scheduleFocusNotification,
  setHapticsEnabled,
  startMotionSensors,
  stopMotionSensors,
  triggerHaptic,
  type HapticKind,
} from './native';
import {
  ACCESSORY_CATALOG,
  COAT_CATALOG,
  completeFocusSession,
  FOCUS_PRESETS,
  markDailyTask,
  normalizeState,
  unlockOrSelectAccessory,
  unlockOrSelectCoat,
  type AccessoryId,
  type AppState,
  type CoatId,
  type DailyTaskKey,
} from './state';

const STORAGE_KEY = 'mochamocha_state_v1';
const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

// Probe discrete display transition support for top-layer exit animation fallback
let supportsDisplayTransition: boolean | undefined;
function canTransitionDisplay(): boolean {
  if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
  if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
    return false;
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = 'none';
  supportsDisplayTransition = getComputedStyle(probe).display === 'block';
  probe.remove();
  return supportsDisplayTransition;
}

function supportsTopLayerExit(): boolean {
  return Boolean(window.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay());
}

async function closeTopLayer(dialog: HTMLDialogElement): Promise<void> {
  if (!dialog.open) return;
  if (!supportsTopLayerExit()) {
    dialog.setAttribute('data-closing', '');
    const animations = dialog.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((r) => window.setTimeout(r, 450)),
      ]);
    }
    if (!dialog.hasAttribute('data-closing')) return;
    dialog.removeAttribute('data-closing');
  }
  dialog.close();
}

function wireDialogEnhancements(dialogs: HTMLDialogElement[]): void {
  const needsClosedByFallback = !('closedBy' in HTMLDialogElement.prototype);
  const outside = (e: PointerEvent, dialog: HTMLDialogElement) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };

  for (const dialog of dialogs) {
    dialog.addEventListener('close', () => {
      dialog.removeAttribute('data-closing');
      dialog.returnValue = '';
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      void closeTopLayer(dialog);
    });
    if (needsClosedByFallback) {
      let pressedOutside = false;
      dialog.addEventListener('pointerdown', (e) => {
        pressedOutside = outside(e, dialog);
      });
      dialog.addEventListener('pointerup', (e) => {
        if (pressedOutside && outside(e, dialog)) void closeTopLayer(dialog);
      });
    }
  }
}

async function bootstrap(): Promise<void> {
  const saved = await loadSavedJson<Partial<AppState>>(STORAGE_KEY);
  const state = normalizeState(saved);
  setHapticsEnabled(state.settings.haptics);

  let selectedPresetId = FOCUS_PRESETS[2].id; // 25 min default
  let activeStyleTab: 'accessories' | 'coats' | 'daily' = 'accessories';
  let lastMoodSnapshot = { current: 'Zufrieden', happiness: 0.68, fullness: 0.22 };
  let prevStars = state.stars;
  let toastTimer: number | null = null;

  const persist = () => {
    void saveJson(STORAGE_KEY, state);
  };

  const showToast = (msg: string) => {
    const toast = el<HTMLDivElement>('toast');
    toast.hidden = true;
    void toast.offsetWidth; // restart spring animation cleanly
    toast.textContent = msg;
    toast.hidden = false;
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2800);
  };

  const dlgFocus = el<HTMLDialogElement>('dlgFocus');
  const dlgCoats = el<HTMLDialogElement>('dlgCoats');
  const dlgSettings = el<HTMLDialogElement>('dlgSettings');
  wireDialogEnhancements([dlgFocus, dlgCoats, dlgSettings]);

  const starBadge = el<HTMLElement>('starBadge');
  const starCount = el<HTMLElement>('starCount');
  const moodDot = el<HTMLElement>('moodDot');
  const moodBar = el<HTMLElement>('moodBar');
  const moodLabel = el<HTMLElement>('moodLabel');
  const fullBar = el<HTMLElement>('fullBar');
  const fullLabel = el<HTMLElement>('fullLabel');
  const btnFocus = el<HTMLButtonElement>('btnFocus');
  const btnFocusText = el<HTMLElement>('btnFocusText');
  const focusZenBar = el<HTMLElement>('focusZenBar');
  const zenCountdown = el<HTMLElement>('zenCountdown');
  const btnZenRain = el<HTMLButtonElement>('btnZenRain');

  const hasAffordableUnlock = (): boolean =>
    COAT_CATALOG.some((c) => !state.unlockedCoats.includes(c.id) && state.stars >= c.cost) ||
    ACCESSORY_CATALOG.some((a) => !state.unlockedAccessories.includes(a.id) && state.stars >= a.cost);

  const updateMoodHud = (snap: { current: string; happiness: number; fullness: number }) => {
    lastMoodSnapshot = snap;
    const t = getTranslations(state.settings.lang);
    const moodColor =
      snap.current === 'Proud' || snap.current === 'Zoomies'
        ? '#DDA836'
        : snap.happiness > 0.72
          ? '#DF4E4A'
          : snap.happiness < 0.34
            ? '#B84B3C'
            : '#C5742E';

    moodDot.style.backgroundColor = moodColor;
    moodBar.style.inlineSize = `${Math.round(snap.happiness * 100)}%`;
    moodBar.style.backgroundColor = moodColor;
    moodLabel.textContent = t.moods[snap.current] ?? t.moods.Zufrieden;

    fullBar.style.inlineSize = `${Math.round(snap.fullness * 100)}%`;
    fullBar.style.backgroundColor =
      snap.fullness >= 0.85 ? '#6E9A5A' : snap.fullness < 0.25 ? '#C8664B' : '#C5742E';
    fullLabel.textContent =
      snap.fullness >= 0.85
        ? t.fullnessFull
        : snap.fullness < 0.25
          ? t.fullnessHungry
          : t.fullnessOk;
  };

  const renderFocusDialog = () => {
    const t = getTranslations(state.settings.lang);
    el('dlgFocusTitle').textContent = t.focusDialogTitle;
    el('dlgFocusDesc').textContent = t.focusDialogDesc;
    el('statStreak').textContent = `${state.streakDays}`;
    el('lblStreak').textContent = `${t.focusStatsStreak} (${t.focusStatsDays})`;
    el('statMinutes').textContent = `${state.totalFocusMinutes}`;
    el('lblTotalMin').textContent = `${t.focusStatsTotal} (${t.focusStatsMin})`;
    el('btnStartFocus').textContent = t.focusStart;
    el('btnCancelFocus').textContent = t.focusStop;
    el('focusActiveNote').textContent = t.focusActiveNote;

    const presetsWrap = el('focusPresets');
    presetsWrap.innerHTML = '';
    for (const p of FOCUS_PRESETS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset-btn';
      btn.setAttribute('aria-pressed', String(p.id === selectedPresetId));
      const label = p.isTest ? t.focusPresetTest : `${p.minutes} ${t.focusStatsMin}`;
      btn.innerHTML = `<span class="preset-time">${label}</span><span class="preset-reward">+${p.stars} ★</span>`;
      btn.addEventListener('click', () => {
        selectedPresetId = p.id;
        scene.playUiTap();
        void triggerHaptic('uiTick');
        renderFocusDialog();
      });
      presetsWrap.appendChild(btn);
    }

    const active = timer.active;
    el('focusIdlePanel').hidden = Boolean(active);
    el('focusActivePanel').hidden = !active;
  };

  const renderStyleDialog = () => {
    const t = getTranslations(state.settings.lang);
    el('dlgCoatsTitle').textContent = t.coatsDialogTitle;
    el('tabBtnAccessories').textContent = t.tabAccessories;
    el('tabBtnCoats').textContent = t.tabCoats;
    el('tabBtnDaily').textContent = t.tabDaily;
    el('lblAccessoriesSection').textContent = t.accessoriesSection;
    el('lblCoatsSection').textContent = t.coatsSection;
    el('lblDailySection').textContent = t.dailySection;
    el('lblComingSoonTitle').textContent = t.comingSoonTitle;
    el('lblComingSoonDesc').textContent = t.comingSoonDesc;

    el('tabBtnAccessories').setAttribute('aria-selected', String(activeStyleTab === 'accessories'));
    el('tabBtnCoats').setAttribute('aria-selected', String(activeStyleTab === 'coats'));
    el('tabBtnDaily').setAttribute('aria-selected', String(activeStyleTab === 'daily'));
    el('panelAccessories').hidden = activeStyleTab !== 'accessories';
    el('panelCoats').hidden = activeStyleTab !== 'coats';
    el('panelDaily').hidden = activeStyleTab !== 'daily';

    // 3D Accessories grid
    const accGrid = el('accessoryGrid');
    accGrid.innerHTML = '';
    for (const acc of ACCESSORY_CATALOG) {
      const unlocked = state.unlockedAccessories.includes(acc.id);
      const selected = state.selectedAccessory === acc.id;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `style-card${selected ? ' is-selected' : ''}`;
      const statusText = selected
        ? `✓ ${t.coatActive}`
        : unlocked
          ? t.coatSelect
          : `${t.coatUnlock} · ${acc.cost} ★`;
      btn.innerHTML = `
        <span class="style-card-top">
          <span class="acc-icon" aria-hidden="true">${acc.icon}</span>
          <span>${t.accNames[acc.id] ?? acc.id}</span>
        </span>
        <span class="style-status">${statusText}</span>
      `;
      btn.addEventListener('click', () => {
        const res = unlockOrSelectAccessory(state, acc.id as AccessoryId);
        if (res.ok) {
          scene.setAccessory(acc.id);
          persist();
          renderHeader();
          renderStyleDialog();
          if (res.unlockedNow) {
            scene.playUnlock();
            void triggerHaptic('unlock');
            showToast(t.toastUnlocked(t.accNames[acc.id] ?? acc.id));
          } else {
            void triggerHaptic('uiTick');
          }
        } else {
          void triggerHaptic('huff');
          showToast(t.toastNotEnoughStars(res.missingStars));
        }
      });
      accGrid.appendChild(btn);
    }

    // Coats grid
    const coatGrid = el('coatGrid');
    coatGrid.innerHTML = '';
    for (const coat of COAT_CATALOG) {
      const unlocked = state.unlockedCoats.includes(coat.id);
      const selected = state.selectedCoat === coat.id;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `style-card${selected ? ' is-selected' : ''}`;
      const statusText = selected
        ? `✓ ${t.coatActive}`
        : unlocked
          ? t.coatSelect
          : `${t.coatUnlock} · ${coat.cost} ★`;
      btn.innerHTML = `
        <span class="style-card-top">
          <span class="coat-dot" style="background:${coat.swatch}" aria-hidden="true"></span>
          <span>${t.coatNames[coat.id] ?? coat.id}</span>
        </span>
        <span class="style-sub">${t.coatSubtitles[coat.id] ?? ''}</span>
        <span class="style-status">${statusText}</span>
      `;
      btn.addEventListener('click', () => {
        const res = unlockOrSelectCoat(state, coat.id as CoatId);
        if (res.ok) {
          scene.setCoat(coat.id);
          persist();
          renderHeader();
          renderStyleDialog();
          if (res.unlockedNow) {
            scene.playUnlock();
            void triggerHaptic('unlock');
            showToast(t.toastUnlocked(t.coatNames[coat.id] ?? coat.id));
          } else {
            void triggerHaptic('uiTick');
          }
        } else {
          void triggerHaptic('huff');
          showToast(t.toastNotEnoughStars(res.missingStars));
        }
      });
      coatGrid.appendChild(btn);
    }

    // Daily tasks
    const dailyTasks: Array<{ key: DailyTaskKey; label: string }> = [
      { key: 'pet', label: t.dailyPet },
      { key: 'feed', label: t.dailyFeed },
      { key: 'fetch', label: t.dailyFetch },
      { key: 'focus', label: t.dailyFocus },
    ];
    const list = el('dailyList');
    list.innerHTML = '';
    for (const item of dailyTasks) {
      const done = state.daily[item.key];
      const li = document.createElement('li');
      li.className = `daily-item${done ? ' done' : ''}`;
      li.innerHTML = `<span>${item.label}</span><span>${done ? '✓' : '+5 ★'}</span>`;
      list.appendChild(li);
    }
  };

  const renderSettingsDialog = () => {
    const t = getTranslations(state.settings.lang);
    el('dlgSettingsTitle').textContent = t.settingsDialogTitle;
    el('lblSettingLang').textContent = t.settingLang;
    el('lblSettingSound').textContent = t.settingSound;
    el('lblSettingRain').textContent = t.settingRain;
    el('lblSettingHaptics').textContent = t.settingHaptics;
    el('lblSettingMotion').textContent = t.settingMotion;
    el('lblSettingBall').textContent = t.settingBall;
    el('lblSettingReset').textContent = t.settingReset;

    el('btnLangDe').setAttribute('aria-pressed', String(state.settings.lang === 'de'));
    el('btnLangEn').setAttribute('aria-pressed', String(state.settings.lang === 'en'));

    const btnSound = el<HTMLButtonElement>('btnToggleSound');
    btnSound.setAttribute('aria-pressed', String(state.settings.sound));
    btnSound.textContent = state.settings.sound ? t.on : t.off;

    const btnRain = el<HTMLButtonElement>('btnToggleRain');
    btnRain.setAttribute('aria-pressed', String(state.settings.ambientRain));
    btnRain.textContent = state.settings.ambientRain ? t.on : t.off;

    const btnHaptics = el<HTMLButtonElement>('btnToggleHaptics');
    btnHaptics.setAttribute('aria-pressed', String(state.settings.haptics));
    btnHaptics.textContent = state.settings.haptics ? t.on : t.off;

    const btnMotion = el<HTMLButtonElement>('btnToggleMotion');
    btnMotion.setAttribute('aria-pressed', String(state.settings.motion));
    btnMotion.textContent = state.settings.motion ? t.on : t.off;

    const btnBall = el<HTMLButtonElement>('btnToggleBall');
    btnBall.setAttribute('aria-pressed', String(state.settings.ball));
    btnBall.textContent = state.settings.ball ? t.on : t.off;

    el('btnResetScene').textContent = t.settingReset;
  };

  const renderHeader = () => {
    const t = getTranslations(state.settings.lang);
    document.documentElement.lang = state.settings.lang;
    starCount.textContent = String(state.stars);
    if (state.stars > prevStars) {
      starBadge.classList.add('pop');
      window.setTimeout(() => starBadge.classList.remove('pop'), 280);
    }
    prevStars = state.stars;

    el('starBadge').setAttribute('title', t.starsTitle);
    el('btnCoatsText').textContent = t.coatsBtn;
    el('unlockDot').hidden = !hasAffordableUnlock();
    el('btnSettings').setAttribute('aria-label', t.settingsBtn);
    el('closeFocusBtn').setAttribute('aria-label', t.close);
    el('closeCoatsBtn').setAttribute('aria-label', t.close);
    el('closeSettingsBtn').setAttribute('aria-label', t.close);
    el('lblBowl').textContent = t.bowlBtn;
    el('lblBone').textContent = t.boneBtn;
    el('lblBiscuit').textContent = t.biscuitBtn;
    el('lblCall').textContent = t.callBtn;
    el('lblZenBadge').textContent = t.focusZenBadge;
    el('lblZenRain').textContent = state.settings.ambientRain ? t.focusRainOn : t.focusRainOff;
    btnZenRain.setAttribute('aria-pressed', String(state.settings.ambientRain));

    const focusing = Boolean(timer.active);
    document.body.classList.toggle('is-focusing', focusing);
    focusZenBar.hidden = !focusing;
    btnFocus.classList.toggle('is-running', focusing);

    if (!focusing) {
      btnFocusText.textContent = t.focusBtn;
    }
    updateMoodHud(lastMoodSnapshot);
  };

  const handleCareEvent = (kind: 'pet' | 'feed' | 'fetch') => {
    const reward = markDailyTask(state, kind);
    if (reward > 0) {
      persist();
      renderHeader();
      if (dlgCoats.open) renderStyleDialog();
      scene.playUnlock();
      void triggerHaptic('unlock');
      const t = getTranslations(state.settings.lang);
      const label = kind === 'pet' ? t.dailyPet : kind === 'feed' ? t.dailyFeed : t.dailyFetch;
      showToast(t.toastDailyDone(label, reward));
    }
  };

  const scene = mountShibaScene(el('stage'), {
    onHaptic: (kind: HapticKind) => {
      void triggerHaptic(kind);
    },
    onMoodChange: updateMoodHud,
    onCareEvent: handleCareEvent,
  });

  // Restore saved visual appearance & settings silently (no startup squish/sparkles)
  scene.setCoat(state.selectedCoat, true);
  scene.setAccessory(state.selectedAccessory, true);
  scene.setSoundEnabled(state.settings.sound);
  scene.setBallEnabled(state.settings.ball, true);

  // Mobile tilt & shake motion controls (auto-starts on Android; unlocks on first user gesture on iOS)
  const motionCallbacks = {
    onTilt: (gx: number, gz: number) => scene.setTiltGravity(gx, gz),
    onShake: (intensity: number) => scene.triggerShake(intensity),
  };

  let motionPermissionListener: (() => void) | null = null;
  const clearMotionGestureHook = () => {
    if (motionPermissionListener) {
      window.removeEventListener('pointerdown', motionPermissionListener);
      motionPermissionListener = null;
    }
  };

  const syncMotionSensor = async (fromUserGesture = false, notify = false) => {
    clearMotionGestureHook();
    if (!state.settings.motion) {
      stopMotionSensors();
      scene.setTiltGravity(0, 0);
      return;
    }
    const res = await startMotionSensors(motionCallbacks, fromUserGesture);
    const t = getTranslations(state.settings.lang);
    if (res === 'started') {
      if (notify) showToast(t.toastMotionOn);
    } else if (res === 'needs-permission') {
      // Arm a one-shot gesture unlock so the user's first tap activates iOS motion seamlessly
      motionPermissionListener = () => {
        clearMotionGestureHook();
        if (state.settings.motion) {
          void syncMotionSensor(true, false);
        }
      };
      window.addEventListener('pointerdown', motionPermissionListener, { passive: true });
    } else if (res === 'denied') {
      state.settings.motion = false;
      persist();
      if (dlgSettings.open) renderSettingsDialog();
      if (notify) showToast(t.toastMotionDenied);
    }
  };

  void syncMotionSensor(false, false);

  const timer = new FocusTimerController(
    (remainingMs) => {
      const formatted = formatRemaining(remainingMs);
      if (timer.active) {
        btnFocusText.textContent = formatted;
        el('focusCountdown').textContent = formatted;
        zenCountdown.textContent = formatted;
      }
    },
    (completedSession) => {
      const { focusStars, dailyBonus } = completeFocusSession(state, completedSession);
      persist();
      void cancelFocusNotification();
      scene.celebrateFocus();
      renderHeader();
      if (dlgFocus.open) renderFocusDialog();
      if (dlgCoats.open) renderStyleDialog();
      const t = getTranslations(state.settings.lang);
      showToast(t.toastFocusDone(focusStars + dailyBonus));
    },
  );

  // Restore active focus session cleanly
  if (state.activeFocus) {
    if (state.activeFocus.endAt > Date.now()) {
      scene.setFocusMode(true);
      scene.setAmbientRain(state.settings.ambientRain);
    }
    timer.restore(state.activeFocus);
  }

  // Close buttons routed through smooth top-layer exit helper
  el('closeFocusBtn').addEventListener('click', () => {
    scene.playUiTap();
    void closeTopLayer(dlgFocus);
  });
  el('closeCoatsBtn').addEventListener('click', () => {
    scene.playUiTap();
    void closeTopLayer(dlgCoats);
  });
  el('closeSettingsBtn').addEventListener('click', () => {
    scene.playUiTap();
    void closeTopLayer(dlgSettings);
  });

  // Style sheet tabs
  for (const btn of document.querySelectorAll<HTMLButtonElement>('.tab-btn')) {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab as 'accessories' | 'coats' | 'daily';
      if (!tab || tab === activeStyleTab) return;
      activeStyleTab = tab;
      scene.playUiTap();
      void triggerHaptic('uiTick');
      renderStyleDialog();
    });
  }

  // Dock wiring
  el('btnBowl').addEventListener('click', () => scene.fillBowl());
  el('btnCall').addEventListener('click', () => scene.callShiba());
  document.querySelectorAll<HTMLButtonElement>('.dock-btn[data-treat]').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const treatType = btn.dataset.treat;
      if (treatType) scene.startTreatDrag(treatType, e.clientX, e.clientY, e.pointerId);
    });
  });

  // Dialog openers
  const openFocusSheet = () => {
    scene.playUiTap();
    void triggerHaptic('tap');
    renderFocusDialog();
    dlgFocus.showModal();
  };
  btnFocus.addEventListener('click', openFocusSheet);
  el('btnZenOpen').addEventListener('click', openFocusSheet);

  btnZenRain.addEventListener('click', () => {
    state.settings.ambientRain = !state.settings.ambientRain;
    scene.setAmbientRain(state.settings.ambientRain && Boolean(timer.active));
    persist();
    scene.playUiTap();
    void triggerHaptic('uiTick');
    renderHeader();
    if (dlgSettings.open) renderSettingsDialog();
  });

  el('btnCoats').addEventListener('click', () => {
    scene.playUiTap();
    void triggerHaptic('tap');
    renderStyleDialog();
    dlgCoats.showModal();
  });
  el('btnSettings').addEventListener('click', () => {
    scene.playUiTap();
    void triggerHaptic('tap');
    renderSettingsDialog();
    dlgSettings.showModal();
  });

  // Focus actions
  el('btnStartFocus').addEventListener('click', () => {
    const preset = FOCUS_PRESETS.find((p) => p.id === selectedPresetId) ?? FOCUS_PRESETS[2];
    const session = timer.start(preset);
    state.activeFocus = session;
    persist();
    scene.setFocusMode(true);
    scene.setAmbientRain(state.settings.ambientRain);
    scene.playUiTap();
    void triggerHaptic('tap');
    const t = getTranslations(state.settings.lang);
    void scheduleFocusNotification(session.endAt, t.focusNotifTitle, t.focusNotifBody);
    renderHeader();
    renderFocusDialog();
    void closeTopLayer(dlgFocus);
  });

  el('btnCancelFocus').addEventListener('click', () => {
    timer.cancel();
    state.activeFocus = null;
    persist();
    void cancelFocusNotification();
    scene.setFocusMode(false);
    scene.setAmbientRain(false);
    scene.playUiTap();
    void triggerHaptic('tap');
    renderHeader();
    renderFocusDialog();
  });

  // Settings actions
  const setLang = (lang: Lang) => {
    state.settings.lang = lang;
    persist();
    scene.playUiTap();
    void triggerHaptic('uiTick');
    renderHeader();
    renderSettingsDialog();
    if (dlgFocus.open) renderFocusDialog();
    if (dlgCoats.open) renderStyleDialog();
  };
  el('btnLangDe').addEventListener('click', () => setLang('de'));
  el('btnLangEn').addEventListener('click', () => setLang('en'));

  el('btnToggleSound').addEventListener('click', () => {
    state.settings.sound = !state.settings.sound;
    scene.setSoundEnabled(state.settings.sound);
    persist();
    void triggerHaptic('uiTick');
    renderSettingsDialog();
  });

  el('btnToggleRain').addEventListener('click', () => {
    state.settings.ambientRain = !state.settings.ambientRain;
    scene.setAmbientRain(state.settings.ambientRain && Boolean(timer.active));
    persist();
    scene.playUiTap();
    void triggerHaptic('uiTick');
    renderHeader();
    renderSettingsDialog();
  });

  el('btnToggleHaptics').addEventListener('click', () => {
    state.settings.haptics = !state.settings.haptics;
    setHapticsEnabled(state.settings.haptics);
    persist();
    if (state.settings.haptics) void triggerHaptic('tap');
    renderSettingsDialog();
  });

  el('btnToggleMotion').addEventListener('click', () => {
    state.settings.motion = !state.settings.motion;
    persist();
    scene.playUiTap();
    void triggerHaptic('uiTick');
    renderSettingsDialog();
    void syncMotionSensor(true, state.settings.motion);
  });

  el('btnToggleBall').addEventListener('click', () => {
    state.settings.ball = !state.settings.ball;
    scene.setBallEnabled(state.settings.ball);
    persist();
    scene.playUiTap();
    void triggerHaptic('uiTick');
    renderSettingsDialog();
  });

  el('btnResetScene').addEventListener('click', () => {
    scene.reset();
    scene.playUiTap();
    void triggerHaptic('tap');
    void closeTopLayer(dlgSettings);
  });

  // Pause 3D loop & motion sensors in background, re-sync on return
  onAppVisibilityChange((isActive) => {
    scene.setPaused(!isActive);
    if (!isActive) {
      stopMotionSensors();
      scene.setTiltGravity(0, 0);
    } else {
      timer.check(Date.now());
      if (state.settings.motion) void syncMotionSensor(false, false);
      renderHeader();
    }
  });

  renderHeader();
}

void bootstrap();
