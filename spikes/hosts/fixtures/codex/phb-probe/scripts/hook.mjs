import { appendFileSync } from 'node:fs';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const event = JSON.parse(input);
// Log only fixture lifecycle metadata, never prompts, transcripts, or credentials.
if (process.env.PHB_PROBE_EVENTS) {
   appendFileSync(process.env.PHB_PROBE_EVENTS, JSON.stringify({
      event: event.hook_event_name,
      source: event.source ?? null,
      session: event.session_id,
   }) + '\n');
}
console.log(JSON.stringify({
   hookSpecificOutput: {
      hookEventName: event.hook_event_name,
      additionalContext: `PHB_HOOK_${event.hook_event_name}`,
   },
}));
