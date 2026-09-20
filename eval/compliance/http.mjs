import { request } from 'node:http';

// The local endpoint can spend several minutes reasoning before sending headers.
// Use one explicit deadline for the entire response, including that first byte.
export function localJsonRequest(url, body, headers = {}, timeoutMs = 600_000) {
   return new Promise((resolve, reject) => {
      const target = new URL(url);
      if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) {
         reject(new Error('Expected an HTTP loopback model endpoint.')); return;
      }
      const bytes = Buffer.from(JSON.stringify(body));
      const req = request(target, { method: 'POST', signal: AbortSignal.timeout(timeoutMs), headers: {
         ...headers, 'content-type': 'application/json', 'content-length': bytes.length,
      } }, res => {
         if (res.statusCode !== 200) {
            res.resume(); reject(new Error(`Local endpoint HTTP ${res.statusCode}`)); return;
         }
         let size = 0;
         const chunks = [];
         res.on('data', chunk => {
            size += chunk.length;
            if (size > 16 * 1024 * 1024) { req.destroy(new Error('Local response exceeds 16 MiB.')); return; }
            chunks.push(chunk);
         });
         res.on('error', reject);
         res.on('end', () => {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
            catch { reject(new Error('Local endpoint returned invalid JSON.')); }
         });
      });
      req.on('error', reject);
      req.end(bytes);
   });
}
