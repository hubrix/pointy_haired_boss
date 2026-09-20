import { readFile } from 'node:fs/promises';

if (!process.argv[2]) throw new Error('Usage: node eval/compliance/summarize.mjs path/to/run.json [...]');
for (const file of process.argv.slice(2)) {
   const data = JSON.parse(await readFile(file, 'utf8'));
   console.log(`\n${file}: ${data.backend?.requestedModel ?? 'setup failed'}`);
   for (const condition of ['generic', 'phb']) {
      const first = data.runs.filter(run => run.condition === condition && run.repetition === 1 && run.status === 'completed');
      const scores = first.flatMap(run => run.scores);
      const usage = first.reduce((total, run) => total + run.latencyMs, 0);
      console.log(`${condition}: ${scores.length} outputs; ${scores.filter(score => score.mechanicalPass).length} without mechanical flags; ${scores.filter(score => score.claimedStatus === 'needs-review').length} need review; ${(usage / 1000).toFixed(1)}s`);
      for (const score of scores) {
         if (score.flags.length) console.log(`  ${score.id}: ${JSON.stringify(score.flags)}`);
         if (score.id === 'readability') console.log(`  reading grade: ${JSON.stringify(score.readability)}`);
      }
   }
   for (const run of data.runs) if (run.status === 'error') console.log(`  ERROR ${run.condition} r${run.repetition}: ${JSON.stringify(run.error)}`);
}
