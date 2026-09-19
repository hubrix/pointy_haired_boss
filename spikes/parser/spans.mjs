import { createHash } from 'node:crypto';

// Spike adapters share the same conservative extraction policy. This is not yet
// the product's complete quote, citation, locked-span, or sentence projection.
const protectedTypes = new Set([
   'code', 'inlineCode', 'blockquote', 'yaml', 'toml', 'math', 'inlineMath',
   'html', 'definition', 'footnoteDefinition', 'footnoteReference', 'image',
   'imageReference', 'Code', 'CodeBlock', 'BlockQuote', 'Yaml', 'Html',
   'Definition', 'Image', 'ImageReference',
]);
const textTypes = new Set(['text', 'Str']);
const paragraphTypes = new Set(['paragraph', 'Paragraph', 'heading', 'Header', 'tableCell']);
const linkTypes = new Set(['link', 'Link']);

const range = (node) => node.range ?? [node.position.start.offset, node.position.end.offset];
const hasHtml = (node) => ['html', 'Html'].includes(node.type) || (node.children ?? []).some(hasHtml);

export function proseSpans(tree, source) {
   const spans = [];
   function walk(node) {
      if (protectedTypes.has(node.type)) return;
      // HTML inline regions are sibling nodes. Protect their enclosing block
      // until the implementation has a proper boundary policy.
      if (paragraphTypes.has(node.type) && hasHtml(node)) return;
      if (linkTypes.has(node.type)) {
         const [start, end] = range(node);
         const raw = source.slice(start, end);
         if (raw.startsWith('<') || raw === node.url) return;
      }
      if (textTypes.has(node.type)) {
         const [start, end] = range(node);
         const raw = source.slice(start, end);
         spans.push({ start, end, raw, decoded: node.value, patchable: raw === node.value });
      }
      for (const child of node.children ?? []) walk(child);
   }
   walk(tree);
   return spans;
}

export function sentinelHits(spans) {
   return spans.flatMap((span) => [...span.raw.matchAll(/\bquietly\b/g)].map((match) => ({
      start: span.start + match.index,
      end: span.start + match.index + match[0].length,
   })));
}

export const inputHash = (source) => createHash('sha256').update(source, 'utf8').digest('hex');

// Source positions: zero-based half-open UTF-16; columns count Unicode scalars.
// CRLF counts as one line break. Patch boundaries may not split a surrogate pair.
export function location(source, offset) {
   if (!Number.isInteger(offset) || offset < 0 || offset > source.length) throw new Error('Invalid offset');
   const prefix = source.slice(0, offset);
   const lines = prefix.split(/\r\n|\r|\n/);
   return { line: lines.length, column: [...lines.at(-1)].length + 1 };
}

function splitsSurrogate(source, offset) {
   return offset > 0 && offset < source.length &&
      /[\uD800-\uDBFF]/.test(source[offset - 1]) && /[\uDC00-\uDFFF]/.test(source[offset]);
}

export function applyPatches(source, hash, patches, spans) {
   if (hash !== inputHash(source)) throw new Error('Stale input hash');
   const ordered = [...patches].sort((a, b) => a.start - b.start);
   let previousEnd = -1;
   for (const patch of ordered) {
      if (!Number.isInteger(patch.start) || !Number.isInteger(patch.end) ||
          patch.start < 0 || patch.end <= patch.start || patch.end > source.length ||
          typeof patch.replacement !== 'string' || splitsSurrogate(source, patch.start) ||
          splitsSurrogate(source, patch.end)) throw new Error('Invalid patch range');
      if (patch.start < previousEnd) throw new Error('Overlapping patches');
      if (source.slice(patch.start, patch.end) !== patch.original) throw new Error('Stale original text');
      if (!spans.some((span) => span.patchable && patch.start >= span.start && patch.end <= span.end)) {
         throw new Error('Protected or unmapped patch');
      }
      previousEnd = patch.end;
   }
   let result = source;
   for (const patch of ordered.reverse()) {
      result = result.slice(0, patch.start) + patch.replacement + result.slice(patch.end);
   }
   return result;
}
