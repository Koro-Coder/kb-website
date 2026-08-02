const test = require('node:test');
const assert = require('node:assert/strict');
const { assembleLibrary, annotateCounts } = require('./catalog');

// assembleLibrary is pure — catalog in, library out — so these run with no
// database, no network and no credentials, same as the rest of the suite.

function book(bookId, subject, extra) {
  return { bookId, subject, ...extra };
}

// One book per subject layout, each with a hierarchy and the files it points at.
const APTITUDE = book('apt_v1', 'aptitude', {
  hierarchy: [
    { key: '2024', label: '2024', sessions: [{ fileId: '2024/s1', label: 'Session 1' }] },
    {
      key: '2025',
      label: '2025',
      sessions: [
        { fileId: '2025/s1', label: 'Session 1' },
        { fileId: '2025/s2', label: 'Session 2' }
      ]
    }
  ],
  files: [
    { fileId: '2024/s1', questionCount: 10 },
    { fileId: '2025/s1', questionCount: 20 },
    { fileId: '2025/s2', questionCount: 5 }
  ]
});

const MATHS = book('maths_v1', 'maths', {
  hierarchy: [
    {
      key: 'ch2_calculus',
      label: 'Calculus',
      branches: [
        { fileId: 'ch2_calculus/ec', branchCode: 'EC', label: 'Electronics & Communication Engineering' },
        { fileId: 'ch2_calculus/ee', branchCode: 'EE', label: 'Electrical Engineering' }
      ]
    },
    {
      key: 'ch1_linear_algebra',
      label: 'Linear Algebra',
      branches: [
        { fileId: 'ch1_linear_algebra/ec', branchCode: 'EC', label: 'Electronics & Communication Engineering' }
      ]
    }
  ],
  files: [
    { fileId: 'ch2_calculus/ec', questionCount: 7 },
    { fileId: 'ch2_calculus/ee', questionCount: 3 },
    { fileId: 'ch1_linear_algebra/ec', questionCount: 4 }
  ]
});

const NEXUS_EC = book('nexus_nw_ec', 'nexus_x', {
  hierarchy: [
    { key: 'ch1', label: 'Basic Concepts', fileId: 'ch1' },
    { key: 'ch2', label: 'Network Theorems', fileId: 'ch2' }
  ],
  files: [
    { fileId: 'ch1', questionCount: 6 },
    { fileId: 'ch2', questionCount: 9 }
  ]
});

const NEXUS_EE = book('nexus_nw_ee', 'nexus_x', {
  hierarchy: [{ key: 'ch1', label: 'Basic Concepts', fileId: 'ch1' }],
  files: [{ fileId: 'ch1', questionCount: 2 }]
});

const SUBJECTS = [
  { key: 'aptitude', label: 'Aptitude' },
  { key: 'maths', label: 'Maths' },
  { key: 'nexus_x', label: 'Nexus X' },
  { key: 'silicon_x', label: 'Silicon X' }
];

const CATALOG = {
  subjects: SUBJECTS,
  books: [
    { bookId: 'apt_v1', subject: 'aptitude', solutionCount: 30 },
    { bookId: 'maths_v1', subject: 'maths', solutionCount: 0 },
    { bookId: 'nexus_nw_ec', subject: 'nexus_x', domain: 'Network Theory', branch: 'EC', solutionCount: 15 },
    { bookId: 'nexus_nw_ee', subject: 'nexus_x', domain: 'Network Theory', branch: 'EE', solutionCount: 0 }
  ]
};

const BOOKS = [APTITUDE, MATHS, NEXUS_EC, NEXUS_EE];

function subjectNamed(library, key) {
  return library.subjects.find((s) => s.key === key);
}

test('leaf counts come from the file that leaf points at', () => {
  const library = assembleLibrary(CATALOG, BOOKS);
  const [newest] = subjectNamed(library, 'aptitude').tree;
  assert.equal(newest.label, '2025');
  assert.deepEqual(
    newest.children.map((c) => [c.label, c.questionCount]),
    [
      ['Session 1', 20],
      ['Session 2', 5]
    ]
  );
});

test('branch counts are the sum of everything beneath them', () => {
  const library = assembleLibrary(CATALOG, BOOKS);
  const aptitude = subjectNamed(library, 'aptitude');
  assert.deepEqual(
    aptitude.tree.map((n) => [n.label, n.questionCount, n.sectionCount]),
    [
      ['2025', 25, 2],
      ['2024', 10, 1]
    ]
  );
  assert.equal(aptitude.questionCount, 35);
  assert.equal(aptitude.sectionCount, 3);
});

test('counts roll up through every level of the technical tree', () => {
  const library = assembleLibrary(CATALOG, BOOKS);
  const [domain] = subjectNamed(library, 'nexus_x').tree;
  assert.equal(domain.label, 'Network Theory');
  // Two branches of the same domain live in two different repos; the tree
  // merges them and the count follows.
  assert.equal(domain.questionCount, 17);
  assert.equal(domain.sectionCount, 3);
  assert.deepEqual(
    domain.children.map((c) => [c.label, c.questionCount, c.sectionCount]),
    [
      ['EC', 15, 2],
      ['EE', 2, 1]
    ]
  );
});

test('maths branches are labelled by their two-letter code', () => {
  const library = assembleLibrary(CATALOG, BOOKS);
  const calculus = subjectNamed(library, 'maths').tree.find((n) => n.label === 'Calculus');
  assert.deepEqual(
    calculus.children.map((c) => c.label),
    ['EC', 'EE']
  );
});

test('a maths chapter counts its branches', () => {
  const library = assembleLibrary(CATALOG, BOOKS);
  const maths = subjectNamed(library, 'maths');
  assert.deepEqual(
    maths.tree.map((n) => [n.label, n.questionCount]),
    [
      ['Calculus', 10],
      ['Linear Algebra', 4]
    ]
  );
  assert.equal(maths.questionCount, 14);
});

test('aptitude years run newest first', () => {
  const library = assembleLibrary(CATALOG, BOOKS);
  assert.deepEqual(
    subjectNamed(library, 'aptitude').tree.map((n) => n.label),
    ['2025', '2024']
  );
});

test('a subject with nothing registered is an empty shelf, not an omission', () => {
  const library = assembleLibrary(CATALOG, BOOKS);
  const silicon = subjectNamed(library, 'silicon_x');
  assert.deepEqual(silicon.tree, []);
  assert.equal(silicon.bookCount, 0);
  assert.equal(silicon.questionCount, 0);
});

test('every known subject gets an entry, with or without books', () => {
  const library = assembleLibrary(CATALOG, BOOKS);
  assert.deepEqual(
    library.subjects.map((s) => s.key),
    ['aptitude', 'maths', 'nexus_x', 'silicon_x']
  );
  // No site-wide totals: nothing renders them.
  assert.deepEqual(Object.keys(library), ['subjects']);
});

test('solution counts come from the books, since files do not carry them', () => {
  const library = assembleLibrary(CATALOG, BOOKS);
  assert.equal(subjectNamed(library, 'nexus_x').solutionCount, 15);
  assert.equal(subjectNamed(library, 'maths').solutionCount, 0);
});

test('a hierarchy entry with no matching file counts zero rather than throwing', () => {
  const orphaned = { ...NEXUS_EE, files: [] };
  const library = assembleLibrary(
    { subjects: SUBJECTS, books: CATALOG.books },
    [APTITUDE, MATHS, NEXUS_EC, orphaned]
  );
  const [domain] = subjectNamed(library, 'nexus_x').tree;
  assert.equal(domain.children.find((c) => c.label === 'EE').questionCount, 0);
});

test('annotateCounts works on any tree shape it is handed', () => {
  const tree = [
    {
      key: 'a',
      children: [
        { key: 'a1', leaf: { bookId: 'b', fileId: 'f1' } },
        { key: 'a2', children: [{ key: 'a2i', leaf: { bookId: 'b', fileId: 'f2' } }] }
      ]
    }
  ];
  const totals = annotateCounts(tree, (bookId, fileId) => (fileId === 'f1' ? 4 : 6));
  assert.deepEqual(totals, { questions: 10, sections: 2 });
  assert.equal(tree[0].questionCount, 10);
  assert.equal(tree[0].children[1].questionCount, 6);
  assert.equal(tree[0].children[1].sectionCount, 1);
});
