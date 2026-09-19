// Explicit maintenance command; the checker never downloads Unicode data.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const version = '17.0.0';
const urls = {
   characters: `https://www.unicode.org/Public/${version}/ucd/UnicodeData.txt`,
   aliases: `https://www.unicode.org/Public/${version}/ucd/NameAliases.txt`,
   emoji: `https://www.unicode.org/Public/${version}/emoji/emoji-test.txt`,
   license: 'https://www.unicode.org/license.txt',
};
const hash = (text) => createHash('sha256').update(text).digest('hex');
const sources = {};
const contents = {};
for (const [key, url] of Object.entries(urls)) {
   const response = await fetch(url);
   if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
   contents[key] = await response.text();
   sources[key] = { url, sha256: hash(contents[key]) };
}
if (!contents.aliases.includes(`NameAliases-${version}`) || !contents.emoji.includes('# Version: 17.0')) throw new Error('Unexpected Unicode data version');
const aliases = new Map();
for (const line of contents.aliases.split('\n')) {
   const [cp, name, type] = line.split(';');
   if (type === 'control') aliases.set(cp, name);
}
const characters = {};
for (const line of contents.characters.split('\n')) {
   const [hex, name, category, , , decomposition] = line.split(';');
   if (!hex || [9, 10, 13, 32].includes(parseInt(hex, 16))) continue;
   if (!/^(?:M.|Cf|Cc|Z.)$/.test(category) && !decomposition.startsWith('<')) continue;
   characters[parseInt(hex, 16)] = [name === '<control>' ? aliases.get(hex) ?? `CONTROL-${hex}` : name,
      category, decomposition.startsWith('<')];
}
const emoji = new Set();
for (const line of contents.emoji.split('\n')) {
   if (!/^[A-F0-9]/.test(line)) continue;
   const [sequence, status] = line.split('#')[0].split(';').map((part) => part.trim());
   if (!['fully-qualified', 'minimally-qualified', 'unqualified'].includes(status)) continue;
   const points = sequence.split(' ').map((hex) => parseInt(hex, 16));
   if (points.some((cp) => characters[cp])) emoji.add(String.fromCodePoint(...points));
}
const data = JSON.stringify({ version, characters, emoji: [...emoji] }) + '\n';
const destination = new URL('../data/', import.meta.url);
await mkdir(destination, { recursive: true });
await writeFile(new URL('unicode-17.0.0.json', destination), data);
await writeFile(new URL('UNICODE-LICENSE.txt', destination), contents.license);
await writeFile(new URL('unicode-manifest.json', destination), JSON.stringify({ version, sources,
   generated: { file: 'unicode-17.0.0.json', sha256: hash(data), characters: Object.keys(characters).length, emoji: emoji.size } }, null, 3) + '\n');
console.log(`Generated Unicode ${version}: ${Object.keys(characters).length} character records; ${emoji.size} emoji sequences.`);
