/* HTML builders for menus, scorecards and summaries. */
(function (root) {
  const BG = (root.BG = root.BG || {});
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function scoreName(strokes, par) {
    if (strokes === 1 && par > 2) return 'Hole in one!';
    const d = strokes - par;
    return d <= -3 ? 'Albatross!' : d === -2 ? 'Eagle!' : d === -1 ? 'Birdie!' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double bogey' : d === 3 ? 'Triple bogey' : '+' + d;
  }
  const fmtDiff = (d) => (d === 0 ? 'E' : d > 0 ? '+' + d : String(d));
  function scCls(s, par) { if (s == null) return ''; const d = s - par; return s === 1 ? 'eagle' : d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 1 ? 'bogey' : d >= 2 ? 'dbl' : ''; }

  function courseArt(c) {
    const th = c.theme;
    const sky = th === 'forest' ? ['#7fa9b5', '#c9dad5'] : th === 'open' ? ['#6fb4e0', '#dfeadc'] : ['#5aa6d8', '#e6eee8'];
    const dunes = th === 'forest' ? '#6b7a45' : '#c9b56e';
    let s = `<svg viewBox="0 0 300 118" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="sk${c.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs><rect width="300" height="118" fill="url(#sk${c.id})"/>`;
    s += `<circle cx="${230 + (c.id.length % 3) * 10}" cy="26" r="13" fill="#fff6d0" opacity=".85"/>`;
    s += `<ellipse cx="70" cy="30" rx="34" ry="7" fill="#fff" opacity=".6"/><ellipse cx="150" cy="18" rx="26" ry="5" fill="#fff" opacity=".5"/>`;
    if (th === 'coast') s += `<rect y="62" width="300" height="30" fill="#2a79a0"/><path d="M0 70 Q40 66 80 70 T160 70 T240 70 T300 70" stroke="#bfe3ee" stroke-width="1.2" fill="none" opacity=".7"/>`;
    s += `<path d="M0 118 V84 Q40 66 85 82 T170 78 T250 84 T300 76 V118Z" fill="${dunes}"/>`;
    if (th === 'forest') {
      for (let i = 0; i < 26; i++) { const x = 8 + i * 11.5, h = 26 + ((i * 37) % 22); s += `<path d="M${x} ${86} l-7 0 l7 -${h} l7 ${h}Z" fill="${i % 2 ? '#1f4a2a' : '#2b5e34'}"/>`; }
    }
    s += `<path d="M0 118 V98 Q70 84 140 96 T300 92 V118Z" fill="#6aa74a"/><path d="M90 118 Q130 96 190 90 L205 92 Q150 104 135 118Z" fill="#86c25d"/>`;
    if (c.style.gorse > 0.3 && th !== 'forest') s += `<circle cx="40" cy="92" r="6" fill="#4d6a2c"/><circle cx="48" cy="94" r="4" fill="#d6b52a"/><circle cx="262" cy="90" r="5" fill="#4d6a2c"/><circle cx="268" cy="88" r="3" fill="#d6b52a"/>`;
    s += `<ellipse cx="150" cy="90" rx="${c.style.green > 15 ? 18 : 12}" ry="4" fill="#9bdc7a"/><rect x="149.3" y="68" width="1.4" height="22" fill="#fff"/><path d="M150.7 68 l11 4 l-11 4Z" fill="#ff5b4a"/></svg>`;
    return s;
  }

  function bestKey(cid, diff, n) { return 'bandonlinks.best.' + cid + '.' + diff + '.' + n; }
  function getBest(cid, diff, n) { try { const v = localStorage.getItem(bestKey(cid, diff, n)); return v == null ? null : +v; } catch (e) { return null; } }
  function setBest(cid, diff, n, v) { try { const o = getBest(cid, diff, n); if (o == null || v < o) { localStorage.setItem(bestKey(cid, diff, n), String(v)); return true; } } catch (e) {} return false; }

  function courseCards(onPick) {
    const g = $('courseGrid'); g.innerHTML = '';
    BG.COURSES.forEach((c) => {
      const el = document.createElement('div'); el.className = 'ccard';
      const b = getBest(c.id, 'normal', c.holes);
      el.innerHTML = courseArt(c) + `<div class="cc-body"><div class="cc-meta">${esc(c.designer)} · ${c.year}</div><div class="cc-name">${esc(c.name)}</div><div class="cc-desc">${esc(c.blurb)}</div><div class="cc-stats"><div><b>${c.holes}</b>holes</div><div><b>${c.par}</b>par</div><div><b>${c.total.toLocaleString()}</b>yards</div></div></div>`;
      el.addEventListener('click', () => onPick(c)); g.appendChild(el);
    });
  }
  function diffCards(sel, onPick) {
    const g = $('diffGrid'); g.innerHTML = '';
    ['simple', 'normal', 'realistic'].forEach((k, i) => {
      const d = BG.DIFFICULTY[k], el = document.createElement('div'); el.className = 'dcard' + (k === sel ? ' sel' : '');
      el.innerHTML = `<h3>${d.name}</h3><div class="bar">${[0, 1, 2].map((j) => `<i class="${j <= i ? 'on' : ''}"></i>`).join('')}</div><ul>${d.text.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
      el.addEventListener('click', () => onPick(k)); g.appendChild(el);
    });
  }
  function holesPick(course, sel, onPick) {
    const g = $('holesPick'); g.innerHTML = '';
    const opts = course.holes === 18 ? [['all', 'All 18'], ['front', 'Front 9'], ['back', 'Back 9']] : [['all', 'All ' + course.holes + ' holes'], ['first', 'First 4']];
    opts.forEach(([k, label]) => { const c = document.createElement('div'); c.className = 'chip' + (k === sel ? ' sel' : ''); c.textContent = label; c.onclick = () => onPick(k); g.appendChild(c); });
  }

  function scorecardHTML(round, curIdx) {
    const c = round.course, list = round.list;
    let html = '';
    for (let a = 0; a < list.length; a += 9) {
      const seg = list.slice(a, a + 9), last = a + 9 >= list.length;
      const row = (lbl, fn, tot) => `<tr><td class="lbl">${lbl}</td>${seg.map((h, i) => fn(h, a + i)).join('')}${tot != null ? `<td class="tot">${tot}</td>` : ''}</tr>`;
      const sumPar = seg.reduce((s, h) => s + c.pars[h], 0), sumYds = seg.reduce((s, h) => s + c.yds[h], 0);
      const played = seg.every((h, i) => round.strokes[a + i] != null);
      const sumS = seg.reduce((s, h, i) => s + (round.strokes[a + i] || 0), 0);
      html += `<table class="cardtbl"><tr><th></th>${seg.map((h, i) => `<th class="${a + i === curIdx ? 'cur' : ''}">${h + 1}</th>`).join('')}<th>${list.length > 9 ? (a === 0 ? 'OUT' : 'IN') : 'TOT'}</th></tr>`;
      html += row('Yards', (h) => `<td>${c.yds[h]}</td>`, sumYds);
      html += row('Par', (h) => `<td>${c.pars[h]}</td>`, sumPar);
      html += row('Score', (h, i) => { const s = round.strokes[i]; return `<td class="${i === curIdx ? 'cur' : ''}">${s == null ? '·' : `<span class="sc ${scCls(s, c.pars[h])}">${s}</span>${round.autoPutts && round.autoPutts[i] ? '<sup class="au" title="Auto putt">a</sup>' : ''}`}</td>`; }, played || seg.some((h, i) => round.strokes[i] != null) ? sumS : '·');
      html += row('Putts', (h, i) => { const p = round.putts[i]; return `<td>${round.strokes[i] == null ? '' : p + (round.autoPutts && round.autoPutts[i] ? '<sup class="au">a</sup>' : '')}</td>`; }, round.strokes.some((x) => x != null) ? seg.reduce((s, h, i) => s + (round.putts[a + i] || 0), 0) : '·');
      html += '</table>';
    }
    const done = round.strokes.filter((s) => s != null);
    const par = round.list.reduce((s, h, i) => s + (round.strokes[i] != null ? c.pars[h] : 0), 0);
    const tot = done.reduce((a, b) => a + b, 0);
    html += `<div class="stats"><div class="stat"><b>${tot || '–'}</b><span>Strokes</span></div><div class="stat"><b>${done.length ? fmtDiff(tot - par) : '–'}</b><span>To par</span></div><div class="stat"><b>${done.length}/${list.length}</b><span>Holes</span></div></div>`;
    return html;
  }

  function helpHTML() {
    return `<h2>How to play</h2><div class="howgrid">
      <div><b>Slingshot swing</b>Press and drag <i>backwards</i> (away from the target), like a slingshot. Pull distance sets power, pull direction sets aim. Release to hit. Pull back less than a few pixels to cancel.</div>
      <div><b>Aim</b>The camera looks where you’re aimed. Turn it with ◀ ▶, <kbd>A</kbd>/<kbd>D</kbd> or ←/→ (hold <kbd>Shift</kbd> for fine steps); ⌖ re-aims at the target.</div>
      <div><b>Clubs</b>Tap the club bar, use ‹ ›, mouse wheel or ↑/↓. The green star marks the auto-suggested club for the distance, wind, elevation and lie. On the green you get the putter.</div>
      <div><b>Wind</b>The dial shows where the wind blows relative to your aim. Gusts and shifts change flight, so watch the pin flag. Headwinds balloon shots; crosswinds push them.</div>
      <div><b>Lies &amp; hazards</b>Fairway is clean; rough and deep native cost distance and control; bunkers need a wedge. Gorse, ocean, water and out of bounds cost penalty strokes.</div>
      <div><b>Putting</b>Slopes are real: read the shading and the break readout. Pull distance maps to putt length (the meter shows feet). Don’t be short!</div>
    </div>
    <p style="color:var(--mut);font-size:13px">Shortcuts: <kbd>T</kbd> scorecard · <kbd>V</kbd> hole overview · <kbd>M</kbd> sound · <kbd>Esc</kbd> menu · <kbd>Space</kbd> skip fly-over / fast-forward ball</p>
    <button class="btn primary" data-close="1">Got it</button>`;
  }

  BG.UI = { $, esc, scoreName, fmtDiff, scCls, courseArt, courseCards, diffCards, holesPick, scorecardHTML, helpHTML, getBest, setBest };
})(window);
