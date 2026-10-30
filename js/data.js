/* Course data: pars & yardages (Black / back tees) from public scorecards
   (GolfPass, TheGrint, BlueGolf, GolfCore, bandondunesgolf.com). Layouts are stylized. */
(function (root) {
  const BG = (root.BG = root.BG || {});
  // coast: hole number -> [oceanSide (+1 right / -1 left), fromFrac, toFrac, cliffOffsetMeters]
  BG.COURSES = [
    {
      id: 'bandon', name: 'Bandon Dunes', designer: 'David McLay Kidd', year: 1999, theme: 'coast',
      blurb: 'The original. Wind-whipped links with gorse-covered dunes, and holes that tumble to the cliffs above the Pacific.',
      pars: [4,3,5,4,4,3,4,4,5, 4,4,3,5,4,3,4,4,5],
      yds:  [386,189,543,410,428,161,383,359,558, 362,384,199,553,359,163,363,389,543],
      style: { fw: 19, rough: 8, dunes: 8.5, gorse: 0.55, roll: 0.9, green: 12.5, bunker: 1.0, forest: false, sky: 0 },
      coast: { 4:[1,.35,1,40], 5:[1,0,1,36], 6:[1,0,1,32], 12:[-1,.25,1,38], 13:[-1,0,1,42], 14:[-1,.3,1,40], 15:[-1,0,1,33], 16:[-1,0,.85,40] },
      flavor: ['Gentle opener into the dunes', 'Uphill par 3 into the breeze', 'Three-shotter through the gorse', 'First look at the Pacific', 'Cliff-edge test, narrowing fairway', 'Exposed short hole above the sea'],
    },
    {
      id: 'pacific', name: 'Pacific Dunes', designer: 'Tom Doak', year: 2001, theme: 'coast',
      blurb: 'Doak\'s clifftop masterpiece: bold blowout bunkers, wild native sand and nearly every hole in sight of the sea.',
      pars: [4,4,5,4,3,4,4,4,4, 3,3,5,4,3,5,4,3,5],
      yds:  [370,368,499,463,199,316,464,400,406, 206,148,529,444,145,539,338,208,591],
      style: { fw: 17, rough: 7, dunes: 10.5, gorse: 0.45, roll: 1.0, green: 11.5, bunker: 1.35, forest: false, sky: 1 },
      coast: { 4:[1,.3,1,34], 5:[1,0,1,30], 6:[1,.4,1,36], 10:[1,0,1,38], 11:[1,0,1,28], 12:[1,.3,1,46], 13:[1,0,1,30], 14:[1,0,1,34], 17:[-1,0,1,50] },
      flavor: ['Dune-lined drive to start', 'Bold bunkers guard the bend', 'Short par 4 with a daring line', 'Wild native on both sides'],
    },
    {
      id: 'trails', name: 'Bandon Trails', designer: 'Coore & Crenshaw', year: 2005, theme: 'forest',
      blurb: 'Dunes, meadow, then deep forest. The most inland test at the resort, with subtle, fast greens and tall firs.',
      pars: [4,3,5,4,3,4,4,4,5, 4,4,3,4,4,4,5,3,4],
      yds:  [392,214,549,408,133,395,440,321,567, 418,445,242,401,325,406,530,182,420],
      style: { fw: 15, rough: 7, dunes: 5.5, gorse: 0.18, roll: 0.9, green: 12, bunker: 1.0, forest: true, sky: 2 },
      forestHoles: [4,5,6,7,8,9,10,11,12,13,14,15,16],
      coast: {},
      flavor: ['Dunes to open', 'Short walk through meadow', 'Timber closing in'],
    },
    {
      id: 'oldmac', name: 'Old Macdonald', designer: 'Tom Doak & Jim Urbina', year: 2010, theme: 'open',
      blurb: 'A tribute to C.B. Macdonald: enormous fairways, huge rolling greens and sprawling bunkers inspired by the classics.',
      pars: [4,3,4,4,3,5,4,3,4, 4,4,3,4,4,5,4,5,4],
      yds:  [341,181,375,504,160,555,363,181,416, 465,445,237,346,370,535,455,546,469],
      style: { fw: 29, rough: 9, dunes: 4.5, gorse: 0.1, roll: 1.4, green: 19, bunker: 1.9, forest: false, sky: 0 },
      coast: {},
      flavor: ['Wide open and welcoming', 'Big green, bigger bunkers', 'Roll with the template'],
    },
    {
      id: 'sheep', name: 'The Sheep Ranch', designer: 'Coore & Crenshaw', year: 2020, theme: 'coast',
      blurb: 'Sweeping fairways draped across the bluffs with no trees in sight: an unhurried, wide-open ride on the Pacific.',
      pars: [5,4,3,4,3,4,3,4,4, 4,5,4,5,4,4,3,4,5],
      yds:  [549,318,120,474,198,460,155,429,399, 390,529,440,510,403,321,151,326,464],
      style: { fw: 31, rough: 10, dunes: 7.5, gorse: 0.3, roll: 1.2, green: 19, bunker: 1.2, forest: false, sky: 0 },
      coast: { 1:[-1,.4,1,62], 2:[1,.5,1,52], 3:[1,0,1,46], 4:[-1,.4,1,64], 5:[1,0,1,48], 6:[1,.2,1,46], 7:[1,0,1,40], 8:[-1,.2,1,52], 15:[1,.3,1,48], 16:[1,0,1,40], 17:[1,0,1,46], 18:[1,.1,1,52] },
      flavor: ['Generous landing areas', 'Bluff-top beauty'],
    },
    {
      id: 'preserve', name: 'Bandon Preserve', designer: 'Coore & Crenshaw', year: 2012, theme: 'coast',
      blurb: 'Thirteen par 3s tumbling down a dune toward the beach. Short, spectacular and all about the wind. Play all 13.',
      pars: [3,3,3,3,3,3,3,3,3,3,3,3,3],
      yds:  [134,150,87,118,142,131,147,63,134,120,142,132,109],
      style: { fw: 17, rough: 6, dunes: 9, gorse: 0.35, roll: 1.1, green: 17, bunker: 1.3, forest: false, sky: 1, short: true },
      coast: { 4:[1,0,1,62], 5:[1,0,1,56], 9:[-1,0,1,60], 12:[1,0,1,56] },
      flavor: [],
    },
    {
      id: 'shortys', name: "Shorty's", designer: 'David McLay Kidd', year: 2013, theme: 'open',
      blurb: 'Nine free-to-play par 3s from 86 to 177 yards by the practice range. Pitch-and-run heaven and a perfect warm-up.',
      pars: [3,3,3,3,3,3,3,3,3],
      yds:  [86,113,177,126,145,111,108,92,146],
      style: { fw: 15, rough: 5.5, dunes: 5, gorse: 0.2, roll: 1.0, green: 13, bunker: 1.0, forest: false, sky: 0, short: true },
      coast: {},
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
      gorsePenalty: true, obPenalty: 'replay', gimme: 0, capScale: 1.0, text: ['Full Bandon wind, big gusts & shifts', 'No aim assist, no preview', 'Mishits from a sloppy pull', 'Full lie penalties, lost balls = stroke & distance', 'Fast, tricky greens'],
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
