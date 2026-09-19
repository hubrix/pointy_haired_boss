import { ContractError } from './validate.mjs';

const word = /[\p{L}\p{M}\p{N}\p{Pc}]/u;
const apostrophe = (character) => character === "'" || character === '’';
const beforeAt = (text, offset) => offset > 0 ? String.fromCodePoint(text.codePointAt(offset - (/[\uDC00-\uDFFF]/.test(text[offset - 1]) ? 2 : 1))) : '';
const afterAt = (text, offset) => offset < text.length ? String.fromCodePoint(text.codePointAt(offset)) : '';
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function findPhraseMatches(source, phrase, { caseSensitive = false, whitespace = 'horizontal' } = {}) {
   if (typeof phrase !== 'string' || !phrase.trim() || phrase.trim() !== phrase || /[\r\n]/.test(phrase) || !phrase.isWellFormed()) throw new ContractError('Phrase must be well-formed single-line text without outer whitespace');
   if (typeof caseSensitive !== 'boolean' || !['horizontal', 'literal'].includes(whitespace)) throw new ContractError('Invalid phrase matching policy');
   const pattern = whitespace === 'horizontal' ? phrase.split(/[\t\p{Zs}]+/u).map(escape).join('[\\t\\p{Zs}]+') : escape(phrase);
   const regex = new RegExp(`(?=(${pattern}))`, caseSensitive ? 'gu' : 'giu');
   const matches = [];
   for (const match of source.text.matchAll(regex)) {
      const start = match.index;
      const end = start + match[1].length;
      // Read complete Unicode scalars on both sides, without lowercasing the
      // input or assuming regex \b describes a Unicode word boundary.
      const before = beforeAt(source.text, start);
      const after = afterAt(source.text, end);
      if ((before && word.test(before)) || (after && word.test(after))) continue;
      if (apostrophe(before) && word.test(beforeAt(source.text, start - before.length))) continue;
      if (apostrophe(after) && word.test(afterAt(source.text, end + after.length))) continue;
      matches.push({ start, end });
   }
   return matches;
}
