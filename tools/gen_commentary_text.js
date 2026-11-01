// Writes the spoken hole commentary (one short paragraph per hole) from the hole designs in js/layouts.js, so every clip matches the
// hole's real in-game par, yardage and hazards. Output: audio/commentary/texts.json  { "<course>_<NN>": "text" }
// The clips themselves are voiced with tools/gen_commentary_audio.py.
global.window = global;
const fs = require('fs'), path = require('path');
['layouts', 'data'].forEach((f) => require(path.join(__dirname, '..', 'js', f + '.js')));
const out = {};
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const side = (v) => (v < 0 ? 'left' : 'right');
const SPOKEN = { 'Preserve Us!': 'Preserve Us', 'Sheep Wreck': 'Sheep Reck' };  // spelling that the TTS voice pronounces as the two words

BG.COURSES.forEach((c) => {
  const rows = BG.LAYOUTS.rows[c.id];
  rows.forEach((row, i) => {
    const no = i + 1, [par, yds, route, ev] = row, D = BG.LAYOUTS.get(c.id, i), r = rng(hash(c.id) + no * 977), pick = (a) => a[Math.floor(r() * a.length)];
    const S = [];
    const lead = [];
    if (no === 1) lead.push(`Welcome to ${SPOKEN[c.name] || c.name}.`);
    lead.push(`Number ${no}. Par ${par}, ${yds} yards.`);
    // character
    if (par === 3) S.push(yds < 100 ? pick(['A short pitch of a hole, but the green is not very big.', 'Barely a full swing here, so it is all about the touch.']) : yds < 150 ? pick(['A friendly par three, with a wedge or a short iron in hand.', 'A mid-length par three that rewards a smooth, committed swing.']) : yds < 195 ? pick(['A proper par three that wants a mid iron struck cleanly.', 'A solid par three, so take enough club.']) : pick(['A big par three that asks for a real swing.', 'One of the longer one-shotters, so a wood or a long iron may be needed.']));
    else if (par === 4) S.push(yds < 345 ? pick(['A short par four that tempts the big hitters.', 'A short par four, where position matters more than power.']) : yds < 430 ? pick(['A solid, mid-length par four.', 'A fair test of a par four that rewards a tee shot in the fairway.']) : pick(['A long par four that asks for two good strikes.', 'A strong par four, with plenty of work to do on the second shot.']));
    else S.push(yds < 535 ? pick(['A par five within reach of the longest hitters in two.', 'A short par five that can be a birdie hole if you hit the fairway.']) : pick(['A proper three-shot par five.', 'A long par five, so plan your layup as carefully as the drive.']));
    // routing
    const turn = route;
    if (par > 3) {
      if (/^(L|LL|el|dl|sl)$/.test(turn)) S.push(pick([`The fairway bends to the left${turn === 'dl' ? ' late, near the green' : turn === 'el' ? ' early, so choose your line off the tee' : ''}.`, 'The hole turns left, so favor the inside of the corner.']));
      else if (/^(R|RR|er|dr|sr)$/.test(turn)) S.push(pick([`The fairway bends to the right${turn === 'dr' ? ' late, near the green' : turn === 'er' ? ' early, so choose your line off the tee' : ''}.`, 'The hole turns right, so favor the inside of the corner.']));
      else if (turn === 'SL' || turn === 'SR') S.push(`An S-shaped hole that ${turn === 'SL' ? 'swings left, then back to the right' : 'swings right, then back to the left'}.`);
      else if (turn === 'DL' || turn === 'DR') S.push(`A double dogleg that ${turn === 'DL' ? 'sweeps left, then cuts back right' : 'sweeps right, then cuts back left'}, so think about every shot.`);
      else if (turn === 'cl' || turn === 'cr') S.push(`The fairway curves gently ${turn === 'cl' ? 'left' : 'right'} all the way to the green.`);
      else if (par >= 4) S.push(pick(['The fairway runs straight to the green.', 'The line is straight, and the challenge is in the hazards.']));
    }
    // elevation
    const E = { u: 'It climbs most of the way, so add a club.', U: 'The green sits well above the tee, so take at least one more club.', d: 'It plays downhill, so the ball will fly farther than the number says.', D: 'The tee is high above the green, so the target looks closer than it plays.', c: 'A ridge hides part of the landing area, so trust your line.', v: 'The fairway dips into a hollow before rising to the green.', p: 'The green sits on a raised plateau, so anything short will roll back.', w: 'The ground rolls like waves, so expect uneven lies.' };
    if (E[ev] && r() < 0.9) S.push(E[ev]);
    // hazards
    const hz = [];
    if (D.xb.length) hz.push(`A row of bunkers crosses the fairway about ${D.xb[0]} yards from the tee.`);
    D.fb.forEach((b, k) => { if (k < 2 && !D.xb.length) hz.push(b[1] ? `Bunkers guard the ${side(b[1])} side of the fairway around ${b[0]} yards.` : `A bunker sits in the middle of the fairway around ${b[0]} yards.`); });
    if (D.ws.length) hz.push(`A sandy waste area runs down the ${side(D.ws[0][1])} side.`);
    if (D.pn.length) hz.push('The fairway pinches in as you near the green.');
    if (D.tr) hz.push('Tall firs line both sides, so accuracy beats distance.');
    if (D.coast) hz.push(`The ocean runs along the ${side(D.coast[0])}, so keep the ball away from the edge.`);
    hz.slice(0, par === 3 ? 1 : 2).forEach((s) => S.push(s));
    // green
    const gs = D.gs || [];
    const has = (a) => a.some((q) => gs.includes(q));
    const gF = gs.includes(150), gB = gs.includes(25), gL = gs.includes(-95), gR = gs.includes(95);
    let g = '';
    if (gF && gB && gL && gR) g = pick(['Bunkers ring the green, so the safe play is the middle.', 'The green is surrounded by sand, and there is no easy miss.']);
    else if (gF && gB) g = 'Bunkers guard the front and the back of the green.';
    else if (gF) g = gR || gL ? `Bunkers guard the front and the ${gR ? 'right' : 'left'} of the green.` : 'Bunkers guard the front of the green, so take enough club.';
    else if (gB) g = 'The green is protected by bunkers behind it, so do not be long.';
    else if (gL || gR) g = `A bunker waits ${gL && gR ? 'on both sides' : 'on the ' + (gL ? 'left' : 'right')} of the green.`;
    if (g) S.push(g);
    if (D.g && D.g < 1) S.push('It is a small target, so a precise swing is needed.');
    else if (D.g && D.g > 1) S.push('A large green gives you a decent chance to hold the shot.');
    // sign-off
    const tail = ['Check the wind and make a smooth swing.', 'Trust the yardage and commit to the shot.', 'Pick your target and let it fly.', 'Take your time and play the percentages.', 'Read the wind, then swing with confidence.'];
    if (i === rows.length - 1) S.push(`That is the last hole at ${SPOKEN[c.name] || c.name}. Finish strong.`);
    else S.push(pick(tail));
    out[`${c.id}_${String(no).padStart(2, '0')}`] = (lead.join(' ') + ' ' + S.join(' ')).replace(/\s+/g, ' ').trim();
  });
});
fs.writeFileSync(path.join(__dirname, '..', 'audio', 'commentary', 'texts.json'), JSON.stringify(out, null, 1) + '\n');
console.log(Object.keys(out).length, 'texts');
