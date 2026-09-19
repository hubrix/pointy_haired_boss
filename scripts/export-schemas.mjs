import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { schemas } from '../src/contracts/schemas.mjs';
import { rules } from '../src/contracts/catalog.mjs';
import { houseProfile } from '../src/contracts/config.mjs';
import { validate } from '../src/contracts/validate.mjs';

for (const rule of rules) validate('rule', rule);
validate('profile', houseProfile);
const files = [
   ...Object.entries(schemas).map(([name, schema]) => [`schemas/${name}.schema.json`, schema]),
   ['rules/catalog.json', { version: 1, rules }],
   ['profiles/house.json', houseProfile],
];
for (const [path, value] of files) {
   const destination = new URL(`../${path}`, import.meta.url);
   const text = JSON.stringify(value, null, 3) + '\n';
   if (process.argv.includes('--check')) {
      if (await readFile(destination, 'utf8') !== text) throw new Error(`Generated contract is stale: ${path}`);
   } else {
      await mkdir(new URL('./', destination), { recursive: true });
      await writeFile(destination, text);
   }
}
console.log(`Validated ${rules.length} rule records and ${Object.keys(schemas).length} schemas; generated files ${process.argv.includes('--check') ? 'match' : 'written'}.`);
