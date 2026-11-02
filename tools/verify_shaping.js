// Headless check of intentional shot shaping (draw/fade) with the real physics. Usage: node tools/verify_shaping.js
// Right-handed golfer: facing -z, +x is right. A draw starts right of the aim line and curves left; a fade starts left and curves right.
// "curve" = lateral distance between the start line (initial direction) and the landing point at carry; the ball should land near the aim line.
global.window = global;
require('../js/physics.js');
const P = BG.Phys, YD = P.YD;
let bad = 0; const chk = (ok, msg) => { if (!ok) { bad++; console.log('FAIL', msg); } };
function fly(club, p, shape) {
  const m = P.shapeMods(club, shape, p), b = P.newBall(0, P.R, 0);
  P.launch(b, { club, power: p, yaw: 0, mods: { speed: 1, launch: m.launch, spin: m.spin, yaw: m.yaw, sideSpin: m.sideSpin } });
  const startYaw = Math.atan2(b.vx, -b.vz), env = { terrain: P.flatTerrain() };
  for (let i = 0; i < 4000 && !b.landed; i++) P.stepFlight(b, 1 / 240, env);
  const L = { x: b.land.x / YD, z: -b.land.z / YD }, speed = b.land.speed, apex = b.maxY / YD, launch = b.launch, rpm = b.spinRpm;
  for (let i = 0; i < 240 * 60 && b.mode !== 'stopped'; i++) P.stepBall(b, 1 / 240, env);
  return { startYawDeg: startYaw * 180 / Math.PI, landX: L.x, carry: L.z, curve: L.z * Math.tan(startYaw), apex, launch, rpm, roll: Math.hypot(b.x, b.z) / YD - L.z, restX: b.x / YD };
}
const f = (v, d = 1) => v.toFixed(d).padStart(6);
console.log('club  shape      startYaw  landX  carry  curve(yd)  launch  rpm   roll(yd)');
const res = {};
for (const id of ['DR', '3W', '7I', 'PW', 'LW']) for (const sh of [-2, -1, 0, 1, 2]) {
  const c = P.CLUBS.find((x) => x.id === id), r = (res[id + sh] = fly(c, 1, sh));
  console.log(id.padEnd(5), P.SHAPES[sh].name.padEnd(10), f(r.startYawDeg, 2) + '°', f(r.landX), f(r.carry), f(r.curve), f(r.launch), f(r.rpm, 0), f(r.roll));
}
const draw = (id) => res[id + '-1'], fade = (id) => res[id + '1'], bd = (id) => res[id + '-2'], bf = (id) => res[id + '2'], st = (id) => res[id + '0'];
for (const id of ['DR', '7I']) {
  chk(draw(id).startYawDeg > 0.5 && draw(id).curve > 0, `${id} draw should start right`);
  chk(fade(id).startYawDeg < -0.5 && fade(id).curve < 0, `${id} fade should start left`);
  chk(Math.abs(draw(id).landX) < 1 && Math.abs(fade(id).landX) < 1, `${id} shaped shots should land on the aim line at carry`);
  chk(draw(id).restX < 0 && fade(id).restX > 0, `${id} draw should finish left, fade right (after roll)`);
  chk(draw(id).launch < st(id).launch && fade(id).launch > st(id).launch, `${id} draw lower / fade higher`);
  chk(draw(id).rpm < st(id).rpm && fade(id).rpm > st(id).rpm, `${id} draw less / fade more spin`);
  chk(draw(id).roll > st(id).roll && fade(id).roll < st(id).roll, `${id} draw more roll / fade less`);
  chk(Math.abs(bd(id).curve) > 1.8 * Math.abs(draw(id).curve) && Math.abs(bf(id).curve) > 1.8 * Math.abs(fade(id).curve), `${id} big shapes should ~double the curve`);
}
const dr = [draw('DR'), fade('DR')].map((r) => Math.abs(r.curve)), ir = [draw('7I'), fade('7I')].map((r) => Math.abs(r.curve));
chk(dr.every((v) => v >= 10 && v <= 25), 'driver draw/fade curve 10-25 yd: ' + dr.map((v) => v.toFixed(1)));
chk(ir.every((v) => v >= 5 && v <= 12), '7-iron draw/fade curve 5-12 yd: ' + ir.map((v) => v.toFixed(1)));
chk(Math.abs(bd('DR').curve) <= 25 && Math.abs(bf('DR').curve) <= 25 && Math.abs(bd('7I').curve) <= 12.5 && Math.abs(bf('7I').curve) <= 12.5, 'big shapes within ~25 / 12 yd');
chk(Math.abs(draw('LW').curve) < Math.abs(draw('7I').curve) && Math.abs(draw('7I').curve) < Math.abs(draw('DR').curve), 'driver curves most, wedges least');
chk(P.shapeMods(P.CLUBS.find((x) => x.type === 'putter'), -2, 0.5).sideSpin === 0, 'putter is never shaped');
console.log(bad ? `${bad} failures` : 'shaping OK');
process.exit(bad ? 1 : 0);
