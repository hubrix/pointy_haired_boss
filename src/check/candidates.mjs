import nlp from 'compromise';

const participle = '(?:[\\p{L}]+ed|done|made|written|given|taken|seen|known|shown|sent|built|bought|brought|taught|caught|found|held|kept|left|lost|paid|read|said|sold|told|understood|won|worn|chosen|broken|driven|eaten|fallen|forgotten|frozen|hidden|risen|spoken|stolen|thrown)';
const gap = '(?:\\s+(?:not|never|[\\p{L}]+ly))*\\s+';
const passive = new RegExp(`\\b(?:am|is|are|was|were|be|been|being|get|gets|got|getting)${gap}${participle}\\b`, 'giu');
const reduced = new RegExp(`\\b${participle}\\s+by\\s+[\\p{L}][^,.!?;\\n]*`, 'giu');
const obligation = new RegExp(`\\b(?:(?:must|should|shall|ought\\s+to|needs?\\s+to|has\\s+to|have\\s+to)${gap}be${gap}${participle}|(?:is|are|was|were)\\s+(?:required|mandatory|necessary)|it\\s+is\\s+(?:essential|important|necessary)\\s+to|there\\s+is\\s+a\\s+need\\s+to)\\b`, 'giu');
const contrasts = [
   /\bnot\s+(?:just|only|merely)\b[^.!?\n]{1,160}\bbut\b[^.!?\n]*/giu,
   /\b(?:this|that|it)(?:\s+is\s+not|\s+isn['’]t|['’]s\s+not)\b[^.!?\n]{1,160}[.!?]\s*(?:this|that|it)(?:\s+is|['’]s)\b[^.!?\n]*/giu,
   /[^.!?\n]{1,160}[,;—–]\s*not\b[^.!?\n]*/giu,
];

export function grammarCandidates(text) {
   const document = nlp(text);
   const candidates = [];
   function add(ruleId, start, end, reason) {
      if (Number.isInteger(start) && Number.isInteger(end) && end > start && start >= 0 && end <= text.length) {
         candidates.push({ ruleId, range: { start, end }, reason });
      }
   }
   const terms = document.terms().json({ offset: true }).flatMap((item) => item.terms);
   for (const term of terms) {
      if (term.tags.includes('Adverb') && term.offset && text.slice(term.offset.start, term.offset.start + term.offset.length) === term.text) {
         add('GRAM-01', term.offset.start, term.offset.start + term.offset.length,
            'Possible grammatical adverb. Confirm its role and recast only if meaning survives.');
      }
   }
   for (const match of text.matchAll(/\b(?:not|never|[\p{L}]+n['’]t)\b/giu)) {
      add('GRAM-01', match.index, match.index + match[0].length,
         'Possible negation adverb. Preserve the negative claim; do not delete negation to satisfy the ban.');
   }
   for (const phrase of document.verbs().json({ offset: true })) {
      if (phrase.verb?.grammar?.passive !== true) continue;
      const first = phrase.terms[0]?.offset;
      const last = phrase.terms.at(-1)?.offset;
      if (first && last) add('CLR-01', first.start, last.start + last.length,
         'Possible passive voice. Confirm the construction and use an actor only when the source supports one.');
   }
   for (const pattern of [passive, reduced]) {
      for (const match of text.matchAll(pattern)) add('CLR-01', match.index, match.index + match[0].length,
         'Possible passive construction, including an infinitive or reduced clause. Context must confirm it.');
   }
   for (const pattern of contrasts) {
      for (const match of text.matchAll(pattern)) add('STR-01', match.index, match.index + match[0].length,
         'Possible staged contrast. Review the framing while preserving factual distinctions and negation.');
   }
   for (const match of text.matchAll(obligation)) {
      const sentenceEnd = text.slice(match.index).search(/[.!?;\n]/);
      const tail = text.slice(match.index, sentenceEnd < 0 ? undefined : match.index + sentenceEnd);
      if (/\bby\s+[\p{L}]/iu.test(tail)) continue;
      add('CLR-05', match.index, match.index + match[0].length,
         'Possible obligation without a responsible actor. Check surrounding context; request the owner if none is supplied. Never invent one.');
   }
   // Multiple grammar signals can describe the same phrase. Keep the widest
   // candidate for overlapping same-rule spans; this does not confirm a rule.
   const ordered = candidates.sort((a, b) => a.range.start - b.range.start || b.range.end - a.range.end);
   return ordered.filter((item, index) => !ordered.some((other, otherIndex) => otherIndex < index &&
      item.ruleId === other.ruleId && item.range.start >= other.range.start && item.range.end <= other.range.end));
}
