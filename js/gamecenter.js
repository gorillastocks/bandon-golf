/* Apple Game Center bridge — iOS (Capacitor) build ONLY.
   In a normal browser (the GitHub Pages web version) window.Capacitor is absent, BG.GC.available is false, every call is a
   silent no-op and no Game Center UI is ever shown.
   Leaderboard per course per difficulty: score = total strokes for the complete course (lower is better; sort order must be
   "Low to High" in App Store Connect).  IDs:  abandoneddunes.lb.<courseSlug>.<simple|normal|realistic>
   Achievements: abandoneddunes.ach.firstbirdie / eagle / holeinone / breakpar  (see docs/APP_STORE.md). */
(function (root) {
  const BG = (root.BG = root.BG || {});
  const cap = root.Capacitor;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform() && cap.getPlatform && cap.getPlatform() === 'ios');
  const P = native && cap.Plugins ? cap.Plugins.GameCenter : null;
  const SLUG = { bandon: 'bandit', pacific: 'terrific', trails: 'abandon', oldmac: 'oldmac', sheep: 'sheepwreck', preserve: 'preserveus', shortys: 'shortcircuit' };
  const DIFFS = ['simple', 'normal', 'realistic'];
  const ACH = { firstBirdie: 'abandoneddunes.ach.firstbirdie', eagle: 'abandoneddunes.ach.eagle', holeInOne: 'abandoneddunes.ach.holeinone', breakPar: 'abandoneddunes.ach.breakpar' };
  const lbId = (courseId, diff) => 'abandoneddunes.lb.' + (SLUG[courseId] || courseId) + '.' + diff;
  let signedIn = false;
  const safe = (fn, dflt) => { if (!P) return Promise.resolve(dflt); try { return Promise.resolve(fn()).catch(() => dflt); } catch (e) { return Promise.resolve(dflt); } };

  const GC = BG.GC = {
    available: !!P,
    lbId, ACH, SLUG,
    allLeaderboardIds: () => Object.keys(SLUG).reduce((a, c) => a.concat(DIFFS.map((d) => lbId(c, d))), []),
    isSignedIn: () => signedIn,
    // authenticate on launch; resolves false (never rejects) if declined / unavailable
    signIn: () => safe(() => P.signIn().then((r) => (signedIn = !!(r && r.signedIn))), false),
    submitScore: (courseId, diff, strokes) => safe(() => P.submitScore({ leaderboardId: lbId(courseId, diff), score: Math.round(strokes) }).then((r) => !!(r && r.ok)), false),
    showLeaderboard: (courseId, diff) => safe(() => P.showLeaderboard({ leaderboardId: lbId(courseId, diff) }).then((r) => !!(r && r.ok)), false),
    showLeaderboards: () => safe(() => P.showLeaderboards().then((r) => !!(r && r.ok)), false),
    showAchievements: () => safe(() => P.showAchievements().then((r) => !!(r && r.ok)), false),
    unlock: (key) => safe(() => P.unlockAchievement({ achievementId: ACH[key] || key }).then((r) => !!(r && r.ok)), false),

    // game hooks ------------------------------------------------------------------
    // after each hole: strokes vs par -> achievements
    onHole(strokes, par) {
      if (!P || !signedIn || !(strokes > 0)) return;
      if (strokes === 1) GC.unlock('holeInOne');
      if (strokes - par <= -2) GC.unlock('eagle');
      if (strokes - par <= -1) GC.unlock('firstBirdie');
    },
    // after a finished round: only a complete course (all holes) goes on the leaderboards
    onRoundEnd(course, diff, list, strokes) {
      if (!P || !signedIn) return;
      const tot = strokes.reduce((a, b) => a + (b || 0), 0), par = list.reduce((a, h) => a + course.pars[h], 0);
      if (list.length === course.holes && strokes.every((s) => s > 0)) GC.submitScore(course.id, diff, tot);
      if (list.length === course.holes && tot < par) GC.unlock('breakPar');
    },
  };
  if (P) GC.signIn();   // silent: if the player declines, the game just runs without Game Center
})(window);
