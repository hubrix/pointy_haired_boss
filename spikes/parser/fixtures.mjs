// Occurrence indexes below are hand-labeled: which appearances of "quietly"
// belong to editable prose, independent of either parser's AST.
export const fixtures = [
   { id: 'plain', source: 'Maya quietly approved the report.', editable: [0] },
   { id: 'emphasis', source: 'Maya **quietly** approved the report.', editable: [0] },
   { id: 'code', source: '`quietly`\n\n```js\nconst quietly = 1;\n```\n\nMaya quietly approved it.', editable: [2] },
   { id: 'blockquote', source: '> She quietly approved it.\n>\n> > quietly\n\nMaya quietly approved it.', editable: [2] },
   { id: 'link-and-image', source: '[quietly](https://example.org/quietly "quietly") ![quietly](quietly.png)', editable: [0] },
   { id: 'autolinks', source: '<https://example.org/quietly> https://example.org/quietly\n\nMaya quietly approved it.', editable: [2] },
   { id: 'yaml', source: '---\ntitle: quietly\n---\n\nMaya quietly approved it.', editable: [1] },
   { id: 'toml', source: '+++\ntitle = "quietly"\n+++\n\nMaya quietly approved it.', editable: [1] },
   { id: 'math', source: '$quietly$\n\n$$\nquietly\n$$\n\nMaya quietly approved it.', editable: [2] },
   { id: 'html-block', source: '<div>quietly</div>\n\nMaya quietly approved it.', editable: [1] },
   { id: 'html-inline', source: 'A <span>quietly</span> fragment.\n\nMaya quietly approved it.', editable: [1] },
   { id: 'footnotes', source: 'Maya quietly approved it.[^note]\n\n[^note]: She said quietly.', editable: [0] },
   { id: 'references', source: '[quietly][ref]\n\n[ref]: https://example.org/quietly "quietly"', editable: [0] },
   { id: 'table-and-task', source: '| Action |\n| --- |\n| quietly |\n\n- [ ] Act quietly.', editable: [0, 1] },
   { id: 'unicode-crlf', source: '# 👩🏽‍💻 cafe\u0301\r\n\r\nMaya quietly approved it.\r\n', editable: [0] },
   { id: 'escape-and-entity', source: '\\*quietly &amp; quietly', editable: [0, 1], transformed: true },
];

export const expectedHits = (fixture) => {
   const all = [...fixture.source.matchAll(/\bquietly\b/g)];
   return fixture.editable.map((index) => ({ start: all[index].index, end: all[index].index + 7 }));
};

// These deliberately expose missing product protection. A parser alone cannot
// declare quotation, citation, and user-lock coverage complete.
export const boundaryGaps = [
   { id: 'inline-quotation', source: 'She wrote, “act quietly.” Maya quietly agreed.', editable: [1] },
   { id: 'author-date-citation', source: 'Maya quietly agreed (quietly, 2026).', editable: [0] },
   { id: 'user-lock', source: 'Before.\n\n<!-- phb:lock -->\n\nAct quietly.\n\n<!-- phb:unlock -->\n\nMaya quietly agreed.', editable: [1] },
];

export const grammarFixtures = [
   { text: 'Maya quickly approved the report.', adverbs: ['quickly'], passive: false },
   { text: 'Maya often approves reports.', adverbs: ['often'], passive: false },
   { text: 'A friendly reviewer approved the report.', adverbs: [], passive: false },
   { text: 'A lovely report arrived.', adverbs: [], passive: false },
   { text: 'The daily report arrived.', adverbs: [], passive: false },
   { text: 'Maya works hard.', adverbs: ['hard'], passive: false },
   { text: 'Maya arrived late.', adverbs: ['late'], passive: false },
   { text: 'She did not approve it.', adverbs: ['not'], passive: false },
   { text: 'This is only a draft.', adverbs: ['only'], passive: false },
   { text: 'Maya never approved the report.', adverbs: ['never'], passive: false },
   { text: 'The report was approved by Maya.', adverbs: [], passive: true },
   { text: 'The report has been approved.', adverbs: [], passive: true },
   { text: 'The server got restarted.', adverbs: [], passive: true },
   { text: 'The server is ready.', adverbs: [], passive: false },
   { text: 'Maya has approved the report.', adverbs: [], passive: false },
   { text: 'The report needs to be reviewed.', adverbs: [], passive: true },
   { text: 'The report, approved by Maya, reached the board.', adverbs: [], passive: true },
   { text: 'The door remained closed.', adverbs: [], passive: false },
   { text: 'The report will be reviewed.', adverbs: [], passive: true },
   { text: 'The report is being reviewed.', adverbs: [], passive: true },
];
