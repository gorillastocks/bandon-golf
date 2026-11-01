/* Course data. Pars and yardages come from the original hole designs in js/layouts.js (load that file first). All course names in this
   game are parodies, and every layout is an original, fictional design. */
(function (root) {
  const BG = (root.BG = root.BG || {});
  BG.COURSES = [
    {
      id: 'bandit', name: 'Bandit Dunes', tag: 'Cliffside links', theme: 'coast',
      blurb: 'Wind-whipped links with gorse-covered dunes and holes that tumble to a fictional cliff-top coast. A dramatic back nine along the water.',
      pars: BG.LAYOUTS.pars('bandit'),
      yds:  BG.LAYOUTS.yds('bandit'),
      style: { fw: 19, rough: 8, dunes: 8.5, gorse: 0.55, roll: 0.9, green: 12.5, bunker: 1.0, forest: false, sky: 0 },
      flavor: ['Gentle opener running downhill', 'Three-shotter with a cross-bunker test', 'Short hole over the dunes', 'Blind crest, then the sea appears', 'Narrowing fairway above the water', 'Exposed little par 3'],
    },
    {
      id: 'terrific', name: 'Terrific Dunes', tag: 'Clifftop showpiece', theme: 'coast',
      blurb: 'A dune-top showpiece: bold blowout bunkers, wild native sand and plenty of sea views.',
      pars: BG.LAYOUTS.pars('terrific'),
      yds:  BG.LAYOUTS.yds('terrific'),
      style: { fw: 17, rough: 7, dunes: 10.5, gorse: 0.45, roll: 1.0, green: 11.5, bunker: 1.35, forest: false, sky: 1 },
      flavor: ['Dune-lined drive to start', 'Plateau green, bold bunkers', 'Reachable par 5 with the sea on the right', 'Uphill, with a blind ridge', 'Elevated tee, drivable line'],
    },
    {
      id: 'trails', name: 'Abandon Trails', tag: 'Dunes to forest', theme: 'forest',
      blurb: 'Dunes, meadow, then deep forest. The most inland test of the bunch, with subtle, fast greens and tall firs. Abandon all hope of a flat lie.',
      pars: BG.LAYOUTS.pars('trails'),
      yds:  BG.LAYOUTS.yds('trails'),
      style: { fw: 15, rough: 7, dunes: 5.5, gorse: 0.18, roll: 0.9, green: 12, bunker: 1.0, forest: true, sky: 2 },
      flavor: ['Open dunes to begin', 'Timber closing in', 'Tight corridor through the trees', 'Short hole in the woods'],
    },
    {
      id: 'oldmac', name: 'Old MacDonald Had a Links', tag: 'Wide-open classic', theme: 'open',
      blurb: 'E-I-E-I-Open! Enormous fairways, huge rolling greens and sprawling bunkers and waste areas. A wide-open, fun links with plenty of room for a wayward drive.',
      pars: BG.LAYOUTS.pars('oldmac'),
      yds:  BG.LAYOUTS.yds('oldmac'),
      style: { fw: 29, rough: 9, dunes: 4.5, gorse: 0.1, roll: 1.4, green: 19, bunker: 1.9, forest: false, sky: 0 },
      flavor: ['Wide open and welcoming', 'Big green, bigger bunkers', 'Waste areas guard the corners'],
    },
    {
      id: 'sheep', name: 'Sheep Wreck', tag: 'Bluff-top ride', theme: 'coast',
      blurb: 'Sweeping fairways draped across a windy bluff with no trees in sight: an unhurried, wide-open ride that ends in a wreck only if you let it.',
      pars: BG.LAYOUTS.pars('sheep'),
      yds:  BG.LAYOUTS.yds('sheep'),
      style: { fw: 31, rough: 10, dunes: 7.5, gorse: 0.3, roll: 1.2, green: 19, bunker: 1.2, forest: false, sky: 0 },
      flavor: ['Generous landing areas', 'Bluff-top beauty', 'Drivable par 4 if the wind helps'],
    },
    {
      id: 'preserve', name: 'Preserve Us!', tag: 'Par-3 dune course', theme: 'coast',
      blurb: 'Thirteen par 3s tumbling down a dune toward the beach. Short, spectacular and all about the wind. Play all 13, and keep your jam from spilling.',
      pars: BG.LAYOUTS.pars('preserve'),
      yds:  BG.LAYOUTS.yds('preserve'),
      style: { fw: 17, rough: 6, dunes: 9, gorse: 0.35, roll: 1.1, green: 17, bunker: 1.3, forest: false, sky: 1, short: true },
      flavor: [],
    },
    {
      id: 'circuit', name: 'Short Circuit', tag: 'Par-3 warm-up', theme: 'open',
      blurb: 'Nine par 3s from 67 to 164 yards. Pitch-and-run heaven, a perfect warm-up, and nothing to short out your score.',
      pars: BG.LAYOUTS.pars('circuit'),
      yds:  BG.LAYOUTS.yds('circuit'),
      style: { fw: 15, rough: 5.5, dunes: 5, gorse: 0.2, roll: 1.0, green: 13, bunker: 1.0, forest: false, sky: 0, short: true },
      flavor: [],
    },
  ];
  BG.COURSES.forEach(c => {
    c.par = c.pars.reduce((a, b) => a + b, 0);
    c.total = c.yds.reduce((a, b) => a + b, 0);
    c.holes = c.pars.length;
  });
  BG.DIFFICULTY = {
    simple: {
      id: 'simple', name: 'Simple', windMph: [3, 7], gust: 0.10, dirVar: 6, aimAssist: 0.5, preview: 'full', lie: 0.35, disperse: 0, greenSlope: 0.55,
      gorsePenalty: false, obPenalty: 'drop', gimme: 0.9, capScale: 1.6, text: ['Light breeze', 'Generous aim assist', 'Full trajectory preview', 'Forgiving lies & no gorse penalty', 'Gentle green slopes, 3-ft gimmes'],
    },
    normal: {
      id: 'normal', name: 'Normal', windMph: [8, 15], gust: 0.28, dirVar: 14, aimAssist: 0.2, preview: 'line', lie: 0.75, disperse: 0.5, greenSlope: 1.0,
      gorsePenalty: true, obPenalty: 'drop', gimme: 0, capScale: 1.25, text: ['Moderate wind with gusts', 'Light aim assist', 'Aim line & carry estimate', 'Real lie penalties, gorse costs a stroke', 'Putt break readout'],
    },
    realistic: {
      id: 'realistic', name: 'Realistic', windMph: [13, 27], gust: 0.55, dirVar: 26, aimAssist: 0, preview: 'none', lie: 1.0, disperse: 1.0, greenSlope: 1.25,
      gorsePenalty: true, obPenalty: 'replay', gimme: 0, capScale: 1.0, text: ['Full coastal wind, big gusts & shifts', 'No aim assist, no preview', 'Mishits from a sloppy pull', 'Full lie penalties, lost balls = stroke & distance', 'Fast, tricky greens'],
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
