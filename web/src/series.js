// One place that says what a subject looks like: its colour, its cover
// artwork, the words under its shelf heading, and where it sits on the page.
//
// The colours are the PDF library's (pyq.prepfusion.in/pdf/) series palette,
// so a visitor arriving from there recognises the same five shelves. Each is a
// pair — `color` for light mode, `colorDark` a lightened twin — because the
// light-mode value as text or as a chip fill on a dark background falls under
// the 4.5:1 contrast minimum.
//
// `cover` is the gradient the card artwork is painted with: a mid tone into a
// much darker one, so white cover text clears contrast on every series.

const SERIES = {
  nexus_x: {
    label: 'Nexus X',
    glyph: 'N',
    color: '#2563EB',
    colorDark: '#81ABFF',
    cover: ['#2563EB', '#15316D'],
    tint: '#E9EFFD',
    edge: '#ACC4F7',
    tagline: 'Core technical subjects — Networks, Analog, Digital, Signals & Control.'
  },
  silicon_x: {
    label: 'Silicon X',
    glyph: 'S',
    color: '#7C3AED',
    colorDark: '#C096FF',
    cover: ['#7C3AED', '#3B1A73'],
    tint: '#F1EAFE',
    edge: '#CDB4FA',
    tagline: 'Electronics specialisation — devices, circuits and semiconductors.'
  },
  power_x: {
    label: 'Power X',
    glyph: 'P',
    color: '#E11D48',
    colorDark: '#FF83A0',
    cover: ['#E11D48', '#6E0E24'],
    tint: '#FEE9EE',
    edge: '#F9AFC1',
    tagline: 'Electrical engineering — machines, power systems and drives.'
  },
  maths: {
    label: 'Maths',
    glyph: 'M',
    color: '#047857',
    colorDark: '#6BBAA3',
    cover: ['#047857', '#023426'],
    tint: '#E3F3ED',
    edge: '#A3D3C3',
    tagline: 'Engineering mathematics, chapter by chapter, across every branch.'
  },
  aptitude: {
    label: 'Aptitude',
    glyph: 'A',
    color: '#B45309',
    colorDark: '#E09D68',
    cover: ['#B45309', '#4E2404'],
    tint: '#FBEEE0',
    edge: '#EFC79B',
    tagline: 'General aptitude — every paper, every session, newest first.'
  }
};

// The order the shelves appear in, matching the PDF library. Technical first
// (it is what most visitors came for), then Maths, then Aptitude.
const ORDER = ['nexus_x', 'silicon_x', 'power_x', 'maths', 'aptitude'];

const FALLBACK = {
  label: '',
  glyph: '?',
  color: '#475a78',
  colorDark: '#a9b8d6',
  cover: ['#475a78', '#1b2434'],
  tint: '#e9eef7',
  edge: '#c3cddf',
  tagline: ''
};

// What each level of a subject's tree is *called*, top down. The tree itself
// is shape-generic — every node is a branch or a leaf — but the words a
// student reads should not be: "3 branches · 41 chapters" tells them something
// "3 nodes · 41 leaves" does not. Mirrors the layouts in
// server/parsing/adapters/: technical is Domain > Branch > Chapter, maths is
// Chapter > Branch, aptitude is Year > Session.
const LEVELS = {
  nexus_x: ['domain', 'branch', 'chapter'],
  silicon_x: ['domain', 'branch', 'chapter'],
  power_x: ['domain', 'branch', 'chapter'],
  maths: ['chapter', 'branch'],
  aptitude: ['year', 'session']
};

const FALLBACK_LEVELS = ['section', 'section', 'section'];

// depth 0 is the card itself, 1 its buttons, 2 what those open.
export function levelNoun(subjectKey, depth) {
  const levels = LEVELS[subjectKey] || FALLBACK_LEVELS;
  return levels[depth] || levels[levels.length - 1] || 'section';
}

export function seriesFor(subjectKey) {
  return SERIES[subjectKey] || FALLBACK;
}

// Inline custom properties every series-coloured rule reads. Set once on the
// element (shelf, card, chip) so its children inherit the right swatch without
// a per-series stylesheet.
export function seriesStyle(subjectKey) {
  const series = seriesFor(subjectKey);
  return {
    '--sc': series.color,
    '--sc-d': series.colorDark,
    '--sc-tint': series.tint,
    '--sc-edge': series.edge,
    '--cv1': series.cover[0],
    '--cv2': series.cover[1]
  };
}

// A subject the server knows about but this file does not still gets a shelf —
// it just sorts after the five named ones, keeping its server order among its
// own kind rather than jumping to the front.
export function sortSubjects(subjects) {
  return [...subjects].sort((a, b) => {
    const ai = ORDER.indexOf(a.key);
    const bi = ORDER.indexOf(b.key);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

// "Nexus X" reads better as the shelf heading than the raw `nexus_x` key, but
// the server already sends a label — this is only the fallback for a subject
// that has none.
export function subjectTitle(key) {
  return String(key || '')
    .split(/[_-]/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

// 8315 -> "8,315". Every count on the page goes through this; a four-digit
// question total with no separator reads as a year.
export function formatCount(n) {
  return Number(n || 0).toLocaleString('en-IN');
}

// "branch" needs -es, not -s. Only the endings the level nouns actually use
// are handled — this is a label helper, not a linguistics library.
export function pluralWord(word) {
  return `${word}${/(ch|sh|s|x|z)$/i.test(word) ? 'es' : 's'}`;
}

export function plural(n, word) {
  return `${formatCount(n)} ${Number(n) === 1 ? word : pluralWord(word)}`;
}
