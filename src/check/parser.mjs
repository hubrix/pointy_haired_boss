import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMath from 'remark-math';
import { decodeString } from 'micromark-util-decode-string';
import { ContractError } from '../contracts/validate.mjs';
import { validateSuppression, overlaps } from '../contracts/phrases.mjs';

const parser = unified().use(remarkParse).use(remarkGfm)
   .use(remarkFrontmatter, ['yaml', 'toml']).use(remarkMath);
const protectedTypes = new Set(['code', 'inlineCode', 'blockquote', 'yaml', 'toml',
   'math', 'inlineMath', 'html', 'definition', 'footnoteDefinition', 'footnoteReference',
   'image', 'imageReference']);
const containers = new Set(['root', 'list', 'listItem', 'table', 'tableRow']);
const blocks = new Set(['paragraph', 'heading', 'tableCell']);
const formatting = new Set(['emphasis', 'strong', 'delete']);
const escapeOrEntity = /^\\[!-/:-@[-`{-~]|^&(?:#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/i;
const word = /[\p{L}\p{M}\p{N}]/u;
const nodeRange = (node) => ({ start: node.position.start.offset, end: node.position.end.offset });
const containsHtml = (node) => node.type === 'html' || (node.children ?? []).some(containsHtml);

// Each projected UTF-16 unit retains its complete original spelling. An entity
// that expands to several units maps all of them to the same source interval.
function project(raw, start, decode) {
   let text = '';
   const map = [];
   for (let offset = 0; offset < raw.length;) {
      const token = decode ? raw.slice(offset).match(escapeOrEntity)?.[0] : undefined;
      const decoded = token ? decodeString(token) : undefined;
      // Unknown named references stay literal; their individual characters must
      // not all acquire the interval of the entire entity-looking string.
      const original = token && decoded !== token ? token : String.fromCodePoint(raw.codePointAt(offset));
      const value = original === token ? decoded : original;
      const range = { start: start + offset, end: start + offset + original.length };
      text += value;
      for (let unit = 0; unit < value.length; unit++) map.push(range);
      offset += original.length;
   }
   return { text, map };
}

function alignIndentation(part, value) {
   if (part.text === value) return part;
   const rawLines = part.text.split(/(\r\n|\r|\n)/);
   const lines = value.split(/(\r\n|\r|\n)/);
   if (rawLines.length !== lines.length) return null;
   const map = [];
   let offset = 0;
   for (let index = 0; index < lines.length; index++) {
      const skipped = rawLines[index].length - lines[index].length;
      if (skipped < 0 || !rawLines[index].endsWith(lines[index]) ||
          (skipped && (index === 0 || index % 2 || !/^[\t ]+$/.test(rawLines[index].slice(0, skipped))))) return null;
      for (let unit = offset + skipped; unit < offset + rawLines[index].length; unit++) map.push(part.map[unit]);
      offset += rawLines[index].length;
   }
   return { text: value, map };
}

export function sourceRange(segment, range) {
   if (range.start < 0 || range.end > segment.text.length || range.end <= range.start ||
       !segment.map[range.start] || !segment.map[range.end - 1]) throw new ContractError('Unmapped prose range');
   return { start: segment.map[range.start].start, end: segment.map[range.end - 1].end };
}

function directives(tree, source, enabled) {
   const locked = [];
   const suppressions = [];
   if (!enabled) return { locked, suppressions };
   let active;
   for (const node of tree.children) {
      if (node.type !== 'html' || !/^<!--\s*phb:/i.test(node.value)) continue;
      const match = node.value.match(/^<!--\s*phb:(lock|unlock|suppress|resume)(?:\s+(\{[^]*\}))?\s*-->$/);
      if (!match) throw new ContractError('Invalid trusted phb directive');
      const [, command, json] = match;
      const range = nodeRange(node);
      if (command === 'lock' || command === 'suppress') {
         if (active) throw new ContractError('Trusted phb directives cannot nest');
         let data;
         try { data = JSON.parse(json); } catch { throw new ContractError('Opening phb directive needs a JSON object'); }
         const keys = command === 'lock' ? ['reason'] : ['reason', 'ruleIds'];
         if (Object.keys(data).some((key) => !keys.includes(key)) || typeof data.reason !== 'string' || !data.reason.trim()) {
            throw new ContractError('Trusted phb directive needs a reason and supported fields');
         }
         active = { command, data, start: range.end };
      } else {
         if (json || !active || command !== (active.command === 'lock' ? 'unlock' : 'resume')) {
            throw new ContractError('Unmatched closing phb directive');
         }
         const content = { start: active.start, end: range.start };
         if (content.end <= content.start) throw new ContractError('Trusted phb directive has an empty range');
         if (active.command === 'lock') locked.push({ ...content, reason: `Locked: ${active.data.reason}` });
         else suppressions.push(validateSuppression(source, { version: 1, ...active.data, range: content }));
         active = undefined;
      }
   }
   if (active) throw new ContractError('Unclosed trusted phb directive');
   return { locked, suppressions };
}

// Quote recognition is intentionally conservative. Unclosed double/curly quotes
// protect the rest of the block and make boundary coverage incomplete.
function quoteRanges(text) {
   const ranges = [];
   const stack = [];
   const closing = { '“': '”', '‘': '’', '"': '"', "'": "'" };
   for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (!'“”‘’"\''.includes(char)) continue;
      const before = text[i - 1] ?? '';
      const after = text[i + 1] ?? '';
      if ((char === "'" || char === '’') && word.test(before) && word.test(after)) continue;
      if (stack.length && char === stack.at(-1).close) {
         const opened = stack.pop();
         if (!stack.length) ranges.push({ start: opened.start, end: i + 1 });
      } else if (Object.hasOwn(closing, char)) {
         if (char === "'" && (word.test(before) || /\s/.test(after) || !after)) continue;
         stack.push({ start: i, close: closing[char] });
      }
   }
   if (stack.length) ranges.push({ start: stack[0].start, end: text.length, incomplete: true });
   return ranges;
}

export function parseProse(source, { format = 'markdown', trustedDirectives = false, selection } = {}) {
   if (!['markdown', 'text'].includes(format)) throw new ContractError('Input format must be markdown or text');
   if (selection) {
      source.span(selection.start, selection.end);
      if (selection.end <= selection.start) throw new ContractError('Selection must be nonempty');
   }
   const protectedSpans = [];
   const issues = [];
   const projected = [];
   let inlineSuppressions = [];
   function protect(range, reason) {
      source.span(range.start, range.end);
      if (range.end > range.start) protectedSpans.push({ ...range, reason });
   }
   function unknown(node) {
      issues.push(`Unsupported Markdown node: ${node.type}`);
      protect(nodeRange(node), `Unsupported Markdown node: ${node.type}`);
   }
   if (format === 'text') {
      // Plain text has no Markdown decoding, but quotations and citations retain
      // protection. Blank lines bound prose context just as paragraphs do.
      for (const match of source.text.matchAll(/[^]*?(?:\r?\n[\t ]*\r?\n|$)/g)) {
         if (match[0]) projected.push(project(match[0], match.index, false));
      }
   } else {
      // Ignore signature bytes for syntax recognition, retaining every original
      // offset. Multiple copied BOMs must not hide front matter or code blocks.
      const signatureLength = source.text.match(/^\uFEFF+/)?.[0].length ?? 0;
      const tree = parser.parse(source.text.slice(signatureLength));
      function shift(node) {
         if (node.position) {
            node.position.start.offset += signatureLength;
            node.position.end.offset += signatureLength;
         }
         for (const child of node.children ?? []) shift(child);
      }
      if (signatureLength) shift(tree);
      const parsedDirectives = directives(tree, source, trustedDirectives);
      protectedSpans.push(...parsedDirectives.locked);
      inlineSuppressions = parsedDirectives.suppressions;
      function block(node) {
         if (containsHtml(node)) {
            protect(nodeRange(node), 'Raw inline HTML: protected enclosing prose block.');
            return;
         }
         let text = '';
         const map = [];
         const barrier = () => { text += '\uFFFC'; map.push(null); };
         function inline(child) {
            const range = nodeRange(child);
            if (protectedTypes.has(child.type)) {
               protect(range, `Markdown ${child.type}.`);
               barrier();
            } else if (child.type === 'text') {
               const part = alignIndentation(project(source.text.slice(range.start, range.end), range.start, true), child.value);
               if (!part) {
                  issues.push('Markdown text could not be mapped to its original source.');
                  protect(range, 'Unmapped Markdown text.');
                  barrier();
                  return;
               }
               text += part.text;
               for (const unit of part.map) map.push(unit);
            } else if (formatting.has(child.type)) {
               child.children.forEach(inline);
            } else if (child.type === 'link' || child.type === 'linkReference') {
               const raw = source.text.slice(range.start, range.end);
               if (raw.startsWith('<') || raw === child.url || /^\[(?:\d+[\d,–\- ]*|@[^\]]+)\]/.test(raw)) {
                  protect(range, 'Autolink or citation reference.');
                  barrier();
               } else {
                  const first = child.children[0];
                  const last = child.children.at(-1);
                  if (!first) { protect(range, 'Empty link.'); barrier(); return; }
                  protect({ start: range.start, end: first.position.start.offset }, 'Link delimiter.');
                  protect({ start: last.position.end.offset, end: range.end }, 'Link destination/reference and delimiter.');
                  child.children.forEach(inline);
               }
            } else if (child.type === 'break') {
               text += '\n'; map.push(range);
            } else { unknown(child); barrier(); }
         }
         node.children.forEach(inline);
         projected.push({ text, map });
      }
      function walk(node) {
         if (protectedTypes.has(node.type)) protect(nodeRange(node), `Markdown ${node.type}.`);
         else if (blocks.has(node.type)) block(node);
         else if (containers.has(node.type)) node.children.forEach(walk);
         else if (node.type !== 'thematicBreak') unknown(node);
      }
      walk(tree);
   }
   const segments = [];
   for (const block of projected) {
      const ranges = [
         ...quoteRanges(block.text).map((range) => ({ ...range, reason: 'Exact quotation.' })),
         ...[...block.text.matchAll(/\[[^\]\n]*@[\w:./-]+[^\]\n]*\]|\[\d+(?:[\d,–\- ]*)\]|\([^()\n]*\b(?:1[5-9]|20)\d{2}[a-z]?\b[^()\n]*\)/g)]
            .map((match) => ({ start: match.index, end: match.index + match[0].length, reason: 'Citation or year-bearing parenthetical.' })),
         ...[...block.text.matchAll(/(?:https?:\/\/|www\.)[^\s<>]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi)]
            .map((match) => ({ start: match.index, end: match.index + match[0].length, reason: 'URL or email address.' })),
      ];
      for (const range of ranges) {
         const units = block.map.slice(range.start, range.end).filter(Boolean);
         if (units.length) protect({ start: units[0].start, end: units.at(-1).end }, range.reason);
         if (range.incomplete) issues.push('Unclosed quotation: the rest of its prose block is protected.');
      }
      let start = 0;
      for (let i = 0; i <= block.text.length; i++) {
         const mapped = block.map[i];
         const eligible = mapped && !protectedSpans.some((range) => overlaps(range, mapped));
         if (!eligible) {
            if (i > start) segments.push({ text: block.text.slice(start, i), map: block.map.slice(start, i) });
            start = i + 1;
         }
      }
   }
   // Keep the surrounding segment for grammar and word boundaries. The checker
   // filters findings to the selection after matching against that context.
   const selectedSegments = selection ? segments.filter((segment) =>
      overlaps(sourceRange(segment, { start: 0, end: segment.text.length }), selection)) : segments;
   return { segments: selectedSegments, protectedSpans, inlineSuppressions, issues: [...new Set(issues)],
      check: issues.length ? { id: 'boundaries', status: 'partial', reason: [...new Set(issues)].join(' ') } : { id: 'boundaries', status: 'complete' } };
}
