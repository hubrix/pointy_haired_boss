import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { localJsonRequest } from '../../eval/compliance/http.mjs';

async function fixture(handler, run) {
   const server = createServer(handler);
   await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
   try { await run(`http://127.0.0.1:${server.address().port}/v1/chat/completions`); }
   finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
test('local transport preserves UTF-8 requests and waits for delayed headers within its deadline', async () => {
   await fixture(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      assert.equal(JSON.parse(body).text, 'Zoë 10\u00a0kg');
      await new Promise(resolve => setTimeout(resolve, 60));
      res.end(JSON.stringify({ text: 'Zoë 10\u00a0kg' }));
   }, async url => {
      assert.deepEqual(await localJsonRequest(url, { text: 'Zoë 10\u00a0kg' }, {}, 1000), { text: 'Zoë 10\u00a0kg' });
   });
});
test('one deadline also bounds a server that sends no headers', async () => {
   await fixture(() => {}, async url => {
      await assert.rejects(localJsonRequest(url, {}, {}, 30), { name: 'AbortError' });
   });
});
test('local transport rejects redirects, HTTP failures, malformed JSON, and remote URLs', async () => {
   for (const status of [302, 500]) await fixture((_req, res) => { res.writeHead(status); res.end(); }, async url => {
      await assert.rejects(localJsonRequest(url, {}), new RegExp(`HTTP ${status}`));
   });
   await fixture((_req, res) => res.end('not json'), async url => {
      await assert.rejects(localJsonRequest(url, {}), /invalid JSON/);
   });
   await assert.rejects(localJsonRequest('https://example.test', {}), /loopback/);
});
