# Bandon Dunes Golf

A first-person, slingshot-style golf game set on the seven courses at Bandon Dunes (Bandon Dunes, Pacific Dunes, Bandon Trails, Old Macdonald, Sheep Ranch, Bandon Preserve, Shorty's). Pure static HTML/JS + three.js, no build step.

**Play:** https://gorillastocks.github.io/bandon-golf/

## Controls
- **Swing:** press/touch and pull back (away from the target) like a slingshot; pull length = power, pull angle = aim. Release to hit.
- **Aim:** ◀ ▶ buttons or A/D / arrow keys; P or the crosshair button aims at the pin.
- **Club:** ‹ › or W/S; mouse wheel. A club is auto-suggested from distance, elevation, wind and lie.
- **Other:** V overview map, T scorecard, M mute, Esc pause, Space fast-forward the ball.

## Difficulty
- **Simple** – light wind, aim assist, forgiving lies, full trajectory preview, gimme putts.
- **Normal** – moderate wind with gusts, less assist, line preview.
- **Realistic** – strong gusty wind, mishits driven by how clean your pull is, no preview, full lie penalties.

Physics: drag, Magnus lift/spin, wind profile + gusts, bounce/roll by lie, green slope, cup lip-outs. Distances in yards, score vs par, scorecard and round stats are tracked.

Holes are stylized procedural layouts using real pars and approximate yardages; not surveyed.

![aim](docs/screenshot5-aim.png)
![drag](docs/screenshot6-drag.png)
