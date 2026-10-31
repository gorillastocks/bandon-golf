/* "Your Own Time" — asynchronous 2-4 player multiplayer over Apple Game Center turn-based matches (GKTurnBasedMatch).
   iOS (Capacitor) build ONLY: in a browser window.Capacitor is absent, BG.MP.available is false, nothing is shown, nothing runs.
   One player's turn = their whole round, played whenever they like; the finished scorecard goes into the match's small JSON
   matchData and the turn passes to the next player (Game Center sends the push notification; 7-day turn timeout).
   When everyone has played (or quit / timed out) the match ends: lowest total strokes wins, ties allowed.
   The match stores course, difficulty, hole set and a seed, so every player gets the same wind & weather.
   No chat, no user-generated content: only Game Center display names and stroke counts are exchanged.
   matchData = { v:1, course, diff, holes:'all'|'front'|'back'|'free', seed, by, results:{ <gamePlayerID>:{ strokes:[..], putts, ts } } } */
(function (root) {
  const BG = (root.BG = root.BG || {});
  const cap = root.Capacitor;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform() && cap.getPlatform && cap.getPlatform() === 'ios');
  const P = native && cap.Plugins ? cap.Plugins.GameCenter : null;
  const PEND = 'bg.mp.pending';
  const HOLES_LABEL = { all: 'Full course', front: 'Front 9', back: 'Back 9', free: 'Holes 1–5 (free teaser)' };
  const APP_LINK = 'https://apps.apple.com/app/id6829301159';
  const $ = (id) => root.document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const call = (name, args, dflt) => { if (!P) return Promise.resolve(dflt); try { return Promise.resolve(P[name](args || {})).catch((e) => ({ ok: false, error: String((e && e.message) || e) })); } catch (e) { return Promise.resolve(dflt); } };
  let api = null, matches = [], pendingNew = false, busy = false;

  // ---------------------------------------------------------------- pure helpers (unit-tested with mocks)
  function parse(str) {
    if (!str || typeof str !== 'string') return null;
    let d; try { d = JSON.parse(str); } catch (e) { return null; }
    if (!d || d.v !== 1 || typeof d.course !== 'string' || typeof d.diff !== 'string' || !HOLES_LABEL[d.holes] || !Number.isFinite(d.seed)) return null;
    if (!d.results || typeof d.results !== 'object') d.results = {};
    return d;
  }
  const total = (strokes) => (strokes || []).reduce((a, b) => a + (b || 0), 0);
  // -> { id: 'won'|'lost'|'tied' } among players that have a finished round (lowest total wins, equal lowest = tied)
  function computeOutcomes(cfg) {
    const ids = Object.keys(cfg.results || {}), out = {};
    if (!ids.length) return out;
    const tot = ids.map((id) => total(cfg.results[id].strokes)), best = Math.min.apply(null, tot), nBest = tot.filter((t) => t === best).length;
    ids.forEach((id, i) => { out[id] = tot[i] !== best ? 'lost' : nBest > 1 ? 'tied' : 'won'; });
    return out;
  }
  // rows for the side-by-side scorecard / results: finished players first (lowest first), then the ones still to play
  function standings(m, cfg) {
    const rows = (m.participants || []).map((p) => {
      const r = cfg && cfg.results && p.id ? cfg.results[p.id] : null;
      return { id: p.id, name: p.name, me: !!p.me, strokes: r ? r.strokes : null, total: r ? total(r.strokes) : null, status: p.status, outcome: p.outcome };
    });
    rows.sort((a, b) => (a.total == null) - (b.total == null) || (a.total || 0) - (b.total || 0));
    return rows;
  }
  function winnerText(rows) {
    const fin = rows.filter((r) => r.total != null); if (!fin.length) return 'No rounds were played.';
    const best = fin[0].total, w = fin.filter((r) => r.total === best);
    return w.length > 1 ? 'Tie at ' + best + ': ' + w.map((r) => r.name).join(' & ') : '🏆 ' + w[0].name + ' wins with ' + best;
  }
  function stateOf(m) {   // 'setup' | 'play' | 'wait' | 'waitsetup' | 'done'
    const cfg = parse(m.data);
    if (m.status === 'ended') return 'done';
    const me = (m.participants || []).find((p) => p.me), played = !!(cfg && me && cfg.results[me.id]);
    if (m.myTurn) return !cfg ? 'setup' : played ? 'wait' : 'play';
    return !cfg ? 'waitsetup' : 'wait';
  }
  const rel = (ms) => { const d = ms - Date.now(); if (d <= 0) return 'now'; const h = Math.round(d / 3600000); return h >= 36 ? Math.round(h / 24) + ' days' : h + ' h'; };

  // ---------------------------------------------------------------- pending (failed) submissions are retried
  const readPend = () => { try { return JSON.parse(root.localStorage.getItem(PEND) || '[]') || []; } catch (e) { return []; } };
  const writePend = (a) => { try { a.length ? root.localStorage.setItem(PEND, JSON.stringify(a)) : root.localStorage.removeItem(PEND); } catch (e) {} };

  function doSubmit(matchID, result) {
    return call('mpLoadMatch', { matchID }, { ok: false }).then((r) => {
      if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'offline' };
      const m = r.match, me = (m.participants || []).find((p) => p.me); if (!me) return { ok: false, error: 'not in match' };
      const cfg = parse(m.data); if (!cfg) return { ok: false, error: 'match not set up' };
      if (m.status === 'ended') return { ok: true, match: m };
      if (!m.myTurn) return { ok: false, error: 'not your turn' };
      if (!cfg.results[me.id]) cfg.results[me.id] = result;
      return call('mpSubmitTurn', { matchID, data: JSON.stringify(cfg), doneIDs: Object.keys(cfg.results), outcomes: computeOutcomes(cfg) }, { ok: false }).then((s) => {
        if (!s || !s.ok) return { ok: false, error: (s && s.error) || 'failed' };
        return call('mpLoadMatch', { matchID }, { ok: false }).then((r2) => ({ ok: true, match: r2 && r2.ok ? r2.match : m }));
      });
    });
  }
  // called by the game when a match round is complete (mp = { matchID, seed })
  function submitRound(round, mp) {
    const result = { strokes: round.strokes.map((s) => s || 0), putts: total(round.putts), ts: Date.now() };
    return doSubmit(mp.matchID, result).then((r) => {
      if (!r.ok) { const a = readPend().filter((p) => p.matchID !== mp.matchID); a.push({ matchID: mp.matchID, result }); writePend(a); }
      return r;
    });
  }
  function retryPending() {
    const a = readPend(); if (!a.length) return Promise.resolve();
    return a.reduce((pr, p) => pr.then(() => doSubmit(p.matchID, p.result).then((r) => { if (r.ok || /not in match|match not set up|not your turn/.test(r.error || '')) writePend(readPend().filter((x) => x.matchID !== p.matchID)); })), Promise.resolve());
  }

  // ---------------------------------------------------------------- UI
  const cname = (id) => { const c = (BG.COURSES || []).find((x) => x.id === id); return c ? c.name : id; };
  const dname = (k) => (BG.DIFFICULTY && BG.DIFFICULTY[k] ? BG.DIFFICULTY[k].name : k);
  function badge() {
    const n = matches.filter((m) => stateOf(m) === 'play' || stateOf(m) === 'setup').length, b = $('mmFriends');
    if (b) b.textContent = '👥 Play Friends' + (n ? ' · ' + n + ' waiting for you' : '');
  }
  function refresh() {
    return call('mpLoadMatches', {}, { ok: false, matches: [] }).then((r) => {
      if (r && r.ok) matches = r.matches || [];
      badge(); if (isOpen()) renderList(r && r.ok ? '' : (r && r.error) || 'Couldn’t reach Game Center.');
      return retryPending();
    });
  }
  const isOpen = () => { const e = $('scrMP'); return !!e && !e.classList.contains('hidden'); };
  function open() {
    api.showScr('scrMP'); renderList('Loading matches…');
    BG.GC.signIn().then((ok) => {
      if (!ok) { renderList('Sign in to Game Center (Settings › Game Center) to play with friends.'); return; }
      refresh();
    });
  }
  function renderList(note) {
    const L = $('mpList'); if (!L) return;
    const order = { setup: 0, play: 0, wait: 1, waitsetup: 1, done: 2 };
    const ms = matches.slice().sort((a, b) => order[stateOf(a)] - order[stateOf(b)] || b.created - a.created);
    L.innerHTML = (note ? `<div class="pw-status">${esc(note)}</div>` : '') + (!ms.length && !note ? '<div class="pw-status">No matches yet. Start one with a friend!</div>' : '') +
      ms.map((m, i) => {
        const cfg = parse(m.data), st = stateOf(m), names = (m.participants || []).map((p) => (p.me ? 'You' : p.name)).join(', ');
        const title = cfg ? `${esc(cname(cfg.course))} · ${esc(dname(cfg.diff))} · ${esc(HOLES_LABEL[cfg.holes])}` : 'New match';
        let status = '';
        if (st === 'setup') status = '<b class="mp-you">Your turn — set up the match</b>';
        else if (st === 'play') status = '<b class="mp-you">Your turn — play your round</b>' + (m.timeoutAt ? ` <small>(expires in ${rel(m.timeoutAt)})</small>` : '');
        else if (st === 'wait') status = 'Waiting on ' + esc(m.currentName || 'a friend');
        else if (st === 'waitsetup') status = 'Waiting for ' + esc(m.currentName || 'the host') + ' to set up';
        else status = esc(winnerText(standings(m, cfg)));
        return `<div class="mp-row ${st === 'play' || st === 'setup' ? 'mine' : ''}"><div class="mp-info"><div class="mp-t">${title}</div><div class="mp-s">${status}</div><div class="mp-p">${esc(names)}</div></div>
          <div class="mp-btns">${st === 'play' ? `<button class="btn primary" data-mp="play" data-i="${i}">Play</button>` : st === 'setup' ? `<button class="btn primary" data-mp="setup" data-i="${i}">Set up</button>` : ''}
          <button class="btn" data-mp="view" data-i="${i}">Scorecard</button></div></div>`;
      }).join('');
    L.querySelectorAll('[data-mp]').forEach((b) => (b.onclick = () => {
      const m = ms[+b.dataset.i], k = b.dataset.mp;
      if (k === 'play') play(m); else if (k === 'setup') openSetup(m); else view(m);
    }));
  }
  function sideBySide(m, cfg) {
    const c = (BG.COURSES || []).find((x) => x.id === cfg.course); if (!c) return '';
    const list = api.holeList(c, cfg.holes), rows = standings(m, cfg); let html = '';
    for (let a = 0; a < list.length; a += 9) {
      const seg = list.slice(a, a + 9), last = a + 9 >= list.length;
      html += `<table class="cardtbl"><tr><th></th>${seg.map((h) => `<th>${h + 1}</th>`).join('')}<th>${list.length > 9 ? (a === 0 ? 'OUT' : 'IN') : 'TOT'}</th>${last && list.length > 9 ? '<th>TOT</th>' : ''}</tr>`;
      html += `<tr><td class="lbl">Par</td>${seg.map((h) => `<td>${c.pars[h]}</td>`).join('')}<td class="tot">${seg.reduce((s, h) => s + c.pars[h], 0)}</td>${last && list.length > 9 ? `<td class="tot">${list.reduce((s, h) => s + c.pars[h], 0)}</td>` : ''}</tr>`;
      rows.forEach((r) => {
        const cell = (h, i) => { const s = r.strokes ? r.strokes[a + i] : null; if (!s) return '<td>–</td>'; return `<td><span class="sc ${BG.UI.scCls(s, c.pars[h])}">${s}</span></td>`; };
        const seg9 = r.strokes ? seg.reduce((s, h, i) => s + (r.strokes[a + i] || 0), 0) : '–';
        html += `<tr><td class="lbl">${esc(r.me ? 'You' : r.name)}</td>${seg.map(cell).join('')}<td class="tot">${seg9}</td>${last && list.length > 9 ? `<td class="tot">${r.total == null ? '–' : r.total}</td>` : ''}</tr>`;
      });
      html += '</table>';
    }
    return html;
  }
  function resultHTML(m) {
    const cfg = parse(m.data); if (!cfg) return '';
    const rows = standings(m, cfg), pending = rows.filter((r) => r.total == null && r.status !== 'declined' && r.outcome !== 'quit' && r.outcome !== 'timeout');
    const head = m.status === 'ended' ? winnerText(rows) : (rows.filter((r) => r.total != null).length ? 'So far: ' + winnerText(rows).replace('🏆 ', '').replace(' wins with', ' leads with') : '') + (pending.length ? ` · still to play: ${esc(pending.map((r) => (r.me ? 'You' : r.name)).join(', '))}` : '');
    return `<div style="font-weight:800;color:var(--gold);margin:6px 0">${head}</div>${sideBySide(m, cfg)}`;
  }
  function view(m) {
    const cfg = parse(m.data), st = stateOf(m);
    $('mpCardBody').innerHTML = `<h2>${cfg ? esc(cname(cfg.course)) : 'New match'}</h2>
      ${cfg ? `<div style="color:var(--mut);font-size:13px;letter-spacing:.08em;text-transform:uppercase">${esc(dname(cfg.diff))} · ${esc(HOLES_LABEL[cfg.holes])} · same wind for everyone</div>` : '<p style="color:var(--mut)">The host hasn’t chosen the course yet.</p>'}
      ${cfg ? resultHTML(m) : ''}
      <div class="pw-status" id="mpCardStatus"></div>
      ${st === 'play' ? '<button class="btn primary" id="mcPlay">Play my round</button>' : st === 'setup' ? '<button class="btn primary" id="mcSetup">Set up match</button>' : ''}
      ${m.status === 'ended' ? '<button class="btn" id="mcRemove">Remove from list</button>' : '<button class="btn danger" id="mcQuit">Quit match</button>'}
      <button class="btn ghost" id="mcClose">Close</button>`;
    api.showScr('scrMPCard');
    $('mcClose').onclick = () => api.showScr('scrMP');
    if ($('mcPlay')) $('mcPlay').onclick = () => play(m);
    if ($('mcSetup')) $('mcSetup').onclick = () => openSetup(m);
    if ($('mcRemove')) $('mcRemove').onclick = () => call('mpRemove', { matchID: m.matchID }, { ok: false }).then(() => { matches = matches.filter((x) => x.matchID !== m.matchID); api.showScr('scrMP'); renderList(); badge(); });
    if ($('mcQuit')) $('mcQuit').onclick = () => quit(m, () => view(m));
  }
  function quit(m, back) {
    api.confirmBox({ title: 'Quit this match?', text: 'You forfeit your place and the other players carry on without you. This can’t be undone.', ok: 'Quit match', danger: true, cancel: 'Keep playing' }, () => {
      const cfg = parse(m.data);
      call('mpQuit', { matchID: m.matchID, data: m.data || '', doneIDs: cfg ? Object.keys(cfg.results) : [] }, { ok: false }).then((r) => {
        api.showScr('scrMP'); refresh().then(() => { if (!r || !r.ok) renderList('Couldn’t quit: ' + ((r && r.error) || 'try again')); });
      });
    }, back);
  }

  // match setup (the host picks course / difficulty / holes once the match exists)
  function openSetup(m) {
    const IAP = BG.IAP, locked = !!(IAP && IAP.freemium && !IAP.unlocked());
    const st = { course: locked ? IAP.FREE_COURSE : (BG.COURSES[0] || {}).id, diff: 'normal', holes: locked ? 'free' : 'all' };
    const draw = () => {
      const c = BG.COURSES.find((x) => x.id === st.course);
      const chips = (arr, sel, key, lockFn) => arr.map(([k, label]) => `<div class="chip ${k === sel ? 'sel' : ''} ${lockFn && lockFn(k) ? 'locked' : ''}" data-k="${key}" data-v="${esc(k)}">${esc(label)}${lockFn && lockFn(k) ? ' 🔒' : ''}</div>`).join('');
      const holes = locked ? [['free', 'Holes 1–5 (free)']] : c.holes === 18 ? [['all', 'All 18'], ['front', 'Front 9'], ['back', 'Back 9']] : [['all', 'All ' + c.holes + ' holes']];
      $('mpSetupBody').innerHTML = `<h2>Set up your match</h2>
        <p style="color:var(--mut);margin:0 0 8px;font-size:14px">Everyone plays the same course in the same wind, whenever they like. Lowest strokes wins.</p>
        <div class="mp-sec">Course</div><div class="chips">${chips(BG.COURSES.map((x) => [x.id, x.name]), st.course, 'course', (k) => locked && k !== IAP.FREE_COURSE)}</div>
        <div class="mp-sec">Difficulty</div><div class="chips">${chips([['simple', 'Simple'], ['normal', 'Normal'], ['realistic', 'Realistic']], st.diff, 'diff')}</div>
        <div class="mp-sec">Holes</div><div class="chips">${chips(holes, st.holes, 'holes')}</div>
        ${locked ? '<p class="pw-fine" style="margin:8px 0">Free match: Terrific Dunes holes 1–5. Unlock all 7 courses to host any course, 9 or 18 holes — and to join friends’ full-course matches.</p>' : ''}
        <div class="pw-status" id="mpSetupStatus"></div>
        <button class="btn primary big" id="mpGo">Start my round</button><button class="btn ghost" id="mpSetupBack">Back</button>`;
      $('mpSetupBody').querySelectorAll('.chip').forEach((el) => (el.onclick = () => {
        const k = el.dataset.k, v = el.dataset.v;
        if (k === 'course') { if (locked && v !== IAP.FREE_COURSE) { api.showPaywall(); return; } st.course = v; const cc = BG.COURSES.find((x) => x.id === v); if (cc.holes !== 18 && st.holes !== 'free') st.holes = 'all'; }
        else st[k] = v;
        draw();
      }));
      $('mpSetupBack').onclick = () => { api.showScr('scrMP'); renderList(); };
      $('mpGo').onclick = () => {
        const me = (m.participants || []).find((p) => p.me);
        const cfg = { v: 1, course: st.course, diff: st.diff, holes: st.holes, seed: (Math.random() * 1e6) | 0, by: me ? me.name : '', results: {} };
        $('mpGo').disabled = true; $('mpSetupStatus').textContent = 'Creating the match…';
        call('mpSaveData', { matchID: m.matchID, data: JSON.stringify(cfg) }, { ok: false }).then((r) => {
          if (!r || !r.ok) { $('mpGo').disabled = false; $('mpSetupStatus').textContent = 'Couldn’t save the match: ' + ((r && r.error) || 'try again'); return; }
          m.data = JSON.stringify(cfg); play(m);
        });
      };
    };
    draw(); api.showScr('scrMPSetup');
  }

  function play(m) {
    const cfg = parse(m.data); if (!cfg) { openSetup(m); return; }
    const c = BG.COURSES.find((x) => x.id === cfg.course);
    if (!c) { api.confirmBox({ title: 'Update needed', text: 'This match uses a course your version of the game doesn’t have. Please update the app.', ok: 'OK', cancel: 'Close' }, () => {}); return; }
    const list = api.holeList(c, cfg.holes);
    if (BG.IAP && !BG.IAP.allowed(c.id, list)) { upsell(m, cfg, c); return; }
    const go = () => api.startRound(c, cfg.diff, cfg.holes, { matchID: m.matchID, seed: cfg.seed });
    const sv = api.readSave();
    if (sv.status === 'ok' && sv.data.mp && sv.data.mp.matchID === m.matchID) { api.resumeRound(); return; }
    if (sv.status === 'ok') api.confirmBox({ title: 'Replace saved round?', text: `You have a saved round (${esc(sv.summary.line)}). Starting this match round will overwrite it.`, ok: 'Start match round', danger: true, cancel: 'Keep saved round' }, go);
    else go();
  }
  // an invitee without the unlock can't play a full-course match: friendly upsell
  function upsell(m, cfg, c) {
    $('mpCardBody').innerHTML = `<div style="font-size:40px">⛳</div><h2>${esc(m.currentName && !m.myTurn ? m.currentName : (cfg.by || 'A friend'))} picked ${esc(c.name)}</h2>
      <p style="color:#c5dad7;margin:6px 0 10px">${esc(HOLES_LABEL[cfg.holes])} is part of the full game. Unlock all 7 courses to take your turn — one purchase, yours forever. Or skip this match; the others can carry on without you.</p>
      <button class="btn primary big" id="upUnlock">Unlock all 7 courses${BG.IAP && BG.IAP.price() ? ' — ' + esc(BG.IAP.price()) : ''}</button><br>
      <button class="btn" id="upSkip">Skip my turn (leave match)</button><button class="btn ghost" id="upClose">Not now</button>`;
    api.showScr('scrMPCard');
    $('upUnlock').onclick = () => { api.showScr('scrMP'); api.showPaywall(); };
    $('upSkip').onclick = () => quit(m, () => upsell(m, cfg, c));
    $('upClose').onclick = () => { api.showScr('scrMP'); renderList(); };
  }

  function newMatch() {
    BG.GC.signIn().then((ok) => {
      if (!ok) { renderList('Sign in to Game Center (Settings › Game Center) to play with friends.'); return; }
      pendingNew = true;
      call('mpCreateMatch', { maxPlayers: 4, message: 'Join me for a round of Abandoned Dunes — play on your own time!' }, { ok: false }).then((r) => { if (!r || !r.ok) { pendingNew = false; renderList('Couldn’t open Game Center: ' + ((r && r.error) || '')); } });
    });
  }
  function autoMatch() {
    if (busy) return; busy = true; renderList('Finding players…');
    call('mpAutoMatch', { players: 2 }, { ok: false }).then((r) => {
      busy = false;
      if (!r || !r.ok) { renderList('Couldn’t find a match: ' + ((r && r.error) || 'try again')); return; }
      refresh().then(() => { if (r.match && r.match.myTurn && !parse(r.match.data)) openSetup(r.match); });
    });
  }
  function invite() {
    const text = 'Come play Abandoned Dunes with me — a wind-whipped links golf game. Start a match with me in Play Friends!';
    const nav = root.navigator;
    const copy = () => { try { nav.clipboard.writeText(text + ' ' + APP_LINK); api.toast('<div class="t1">Invite copied</div><div class="t2">Paste it into Messages</div>', 2500); } catch (e) { api.toast('<div class="t1">Share unavailable</div>', 2000); } };
    if (nav && nav.share) nav.share({ title: 'Abandoned Dunes', text, url: APP_LINK }).catch(() => {}); else copy();
  }

  function onEvent(e) {
    if (!e) return;
    if (e.type === 'error') { pendingNew = false; if (isOpen()) renderList('Game Center error: ' + (e.error || '')); return; }
    if (e.type === 'cancelled') { pendingNew = false; return; }
    const m = e.match; if (!m) return;
    matches = matches.filter((x) => x.matchID !== m.matchID); matches.push(m); badge();
    if (pendingNew && m.myTurn && !parse(m.data)) { pendingNew = false; openSetup(m); return; }
    if (e.type === 'ended') { if (api.idle()) api.toast(`<div class="t1">Match finished</div><div class="t2">${esc(winnerText(standings(m, parse(m.data))))}</div>`, 4500); }
    else if (m.myTurn && parse(m.data) && api.idle()) api.toast(`<div class="t1">Your turn!</div><div class="t2">${esc(cname(parse(m.data).course))} match — play your round</div>`, 4500);
    if (isOpen()) renderList();
  }

  const MP = BG.MP = {
    available: !!P, parse, computeOutcomes, standings, winnerText, stateOf, resultHTML, submitRound, open, refresh,
    init(a) {
      api = a; if (!P) return;
      $('mmFriends').classList.remove('hidden');
      $('mmFriends').onclick = open;
      $('mpBack').onclick = () => api.showScr('scrMenu');
      $('mpRefresh').onclick = () => { renderList('Refreshing…'); refresh(); };
      $('mpNew').onclick = newMatch; $('mpAuto').onclick = autoMatch; $('mpInvite').onclick = invite;
      try { P.addListener('matchEvent', onEvent); } catch (e) {}
      root.document.addEventListener('visibilitychange', () => { if (!root.document.hidden && BG.GC.isSignedIn()) refresh(); });
      BG.GC.signIn().then((ok) => { if (ok) refresh(); });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
