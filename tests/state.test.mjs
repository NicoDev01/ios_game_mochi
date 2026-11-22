import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const {
  createDefaultState,
  completeFocusSession,
  markDailyTask,
  normalizeState,
  unlockOrSelectAccessory,
  unlockOrSelectCoat,
  FOCUS_PRESETS,
} = await import('../src/state.ts');
const { formatRemaining, createFocusSession } = await import('../src/focusTimer.ts');

// 1. Default state & daily tasks award once per day
const day1 = new Date('2026-11-22T10:00:00');
const s = createDefaultState(day1);
assert.equal(s.stars, 0);
assert.deepEqual(s.unlockedCoats, ['Aka']);
assert.deepEqual(s.unlockedAccessories, ['none']);

assert.equal(markDailyTask(s, 'pet', day1), 5);
assert.equal(markDailyTask(s, 'pet', day1), 0, 'Duplicate daily task must not double-award');
assert.equal(s.stars, 5);

// 2. Unlock coat fails when insufficient stars
const fail = unlockOrSelectCoat(s, 'Kuro');
assert.equal(fail.ok, false);
assert.equal(fail.missingStars, 15);

// 3. Completing a 10m focus session awards focus stars + daily focus bonus + sets streak
const session1 = createFocusSession(FOCUS_PRESETS[1], day1.getTime()); // 10 min -> 15 stars
const res1 = completeFocusSession(s, session1, new Date(session1.endAt));
assert.equal(res1.focusStars, 15);
assert.equal(res1.dailyBonus, 5);
assert.equal(s.stars, 25);
assert.equal(s.streakDays, 1);
assert.equal(s.totalFocusMinutes, 10);

// 4. Unlock 3D accessory (Matcha Leaf = 10 stars) & Coat (Kuro = 20 stars)
const leafOk = unlockOrSelectAccessory(s, 'leaf');
assert.equal(leafOk.ok, true);
assert.equal(leafOk.unlockedNow, true);
assert.equal(s.selectedAccessory, 'leaf');
assert.equal(s.stars, 15);

// Earn 5 more stars via feed task -> unlock Kuro
markDailyTask(s, 'feed', day1);
const kuroOk = unlockOrSelectCoat(s, 'Kuro');
assert.equal(kuroOk.ok, true);
assert.equal(kuroOk.unlockedNow, true);
assert.equal(s.stars, 0);
assert.equal(s.selectedCoat, 'Kuro');

// 5. Delayed reopen (2 days after session ended) books completion on endAt day, NOT today
const day2 = new Date('2026-11-23T12:00:00');
const session2 = createFocusSession(FOCUS_PRESETS[0], day2.getTime());
const reopenedDay4 = new Date('2026-11-25T09:00:00');
const delayed = completeFocusSession(s, session2, reopenedDay4);
assert.equal(s.lastFocusDate, '2026-11-23');
assert.equal(s.streakDays, 2);
assert.equal(delayed.dailyBonus, 0, 'Session completed 2 days ago must not award today daily bonus');

// Gap resets streak
const day7 = new Date('2026-11-27T12:00:00');
const session3 = createFocusSession(FOCUS_PRESETS[0], day7.getTime());
completeFocusSession(s, session3, new Date(session3.endAt));
assert.equal(s.streakDays, 1);

// 6. Normalize state guards corrupted data & migrates v1 state cleanly
const normalized = normalizeState(
  { stars: -99, selectedCoat: 'Goma', unlockedCoats: ['Aka'], selectedAccessory: 'crown' },
  day7,
);
assert.equal(normalized.stars, 0);
assert.equal(normalized.selectedCoat, 'Aka');
assert.equal(normalized.selectedAccessory, 'none');
assert.equal(normalized.settings.motion, true);

// 7. Timer formatting
assert.equal(formatRemaining(0), '00:00');
assert.equal(formatRemaining(61_000), '01:01');
assert.equal(formatRemaining(25 * 60_000), '25:00');

// 8. Offline App Store & iOS Compliance checks
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.equal(/https?:\/\/cdn\./i.test(html), false, 'index.html must not depend on external CDNs');

const plist = readFileSync(new URL('../ios/App/App/Info.plist', import.meta.url), 'utf8');
assert.equal(plist.includes('ITSAppUsesNonExemptEncryption'), true, 'Info.plist must declare ITSAppUsesNonExemptEncryption');
assert.equal(plist.includes('CFBundleLocalizations'), true, 'Info.plist must declare DE/EN localizations');
assert.equal(plist.includes('NSMotionUsageDescription'), true, 'Info.plist must declare NSMotionUsageDescription');

assert.equal(
  existsSync(new URL('../ios/App/App/PrivacyInfo.xcprivacy', import.meta.url)),
  true,
  'PrivacyInfo.xcprivacy must exist for App Store compliance',
);
const pbxproj = readFileSync(new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url), 'utf8');
assert.equal(pbxproj.includes('PrivacyInfo.xcprivacy in Resources'), true, 'PrivacyInfo.xcprivacy must be in Xcode Resources build phase');

console.log('All MochaMocha state, timer, and iOS compliance checks passed.');
