import { createHash } from 'node:crypto';
import { ContractError } from './validate.mjs';

export function createSource(input) {
   let text;
   if (typeof input === 'string') text = input;
   else if (input instanceof Uint8Array) {
      try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input); }
      catch { throw new ContractError('Input is not valid UTF-8'); }
   } else throw new ContractError('Input must be a string or UTF-8 bytes');
   if (!text.isWellFormed()) throw new ContractError('Input contains an unpaired UTF-16 surrogate');

   const starts = [0];
   for (let index = 0; index < text.length; index++) {
      if (text[index] === '\r') {
         if (text[index + 1] === '\n') index++;
         starts.push(index + 1);
      } else if (text[index] === '\n') starts.push(index + 1);
   }
   const hash = createHash('sha256').update(text, 'utf8').digest('hex');
   function assertOffset(offset) {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length) throw new ContractError('Offset is outside the input');
      if (offset > 0 && offset < text.length) {
         if (/[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset])) throw new ContractError('Offset splits a surrogate pair');
         if (text[offset - 1] === '\r' && text[offset] === '\n') throw new ContractError('Offset splits CRLF');
      }
   }
   function location(offset) {
      assertOffset(offset);
      let low = 0;
      let high = starts.length;
      while (low + 1 < high) {
         const middle = Math.floor((low + high) / 2);
         if (starts[middle] <= offset) low = middle;
         else high = middle;
      }
      return { line: low + 1, column: [...text.slice(starts[low], offset)].length + 1 };
   }
   function span(start, end) {
      assertOffset(start);
      assertOffset(end);
      if (end < start) throw new ContractError('Span ends before it starts');
      return { start, end, text: text.slice(start, end), startLocation: location(start), endLocation: location(end) };
   }
   return Object.freeze({ text, hash, utf16Length: text.length, byteLength: Buffer.byteLength(text, 'utf8'), location, span });
}
