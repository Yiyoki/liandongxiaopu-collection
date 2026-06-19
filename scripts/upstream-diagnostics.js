import '../server/loadEnv.js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { diagnoseUpstream } from '../server/ldxpClient.js';

const args = process.argv.slice(2);
const url = args.find((arg) => !arg.startsWith('--'));
const outArg = args.find((arg) => arg.startsWith('--out='));
const outDir = path.resolve(outArg ? outArg.slice('--out='.length) : 'diagnostics');

if (!url) {
  console.error('Usage: npm run diagnose:upstream -- https://pay.ldxp.cn/shop/VK6TGVU1 [--out=diagnostics]');
  process.exit(1);
}

await mkdir(outDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const result = await diagnoseUpstream(url, {
  includeBody: true,
  bodyPreviewLength: 1200
});

for (const [index, attempt] of result.attempts.entries()) {
  const extension = attempt.contentType.includes('json') ? 'json' : 'html';
  const bodyFile = path.join(outDir, `${timestamp}-${result.token}-attempt-${index + 1}.${extension}`);
  await writeFile(bodyFile, attempt.body || '', 'utf8');
  attempt.bodyFile = bodyFile;
  delete attempt.body;
}

const reportFile = path.join(outDir, `${timestamp}-${result.token}-report.json`);
await writeFile(reportFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  token: result.token,
  shopUrl: result.shopUrl,
  reportFile,
  attempts: result.attempts.map((attempt) => ({
    status: attempt.status,
    ok: attempt.ok,
    contentType: attempt.contentType,
    setCookieNames: attempt.setCookieNames,
    json: attempt.json,
    challenge: attempt.challenge,
    bodyLength: attempt.bodyLength,
    bodyPreview: attempt.bodyPreview,
    bodyFile: attempt.bodyFile,
    error: attempt.error
  }))
}, null, 2));
