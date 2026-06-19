import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');

export async function upsertEnvValue(key, value) {
  let content = '';
  try {
    content = await readFile(envPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const line = `${key}=${JSON.stringify(String(value))}`;
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex((item) => item.trimStart().startsWith(`${key}=`));

  if (index >= 0) {
    lines[index] = line;
  } else {
    if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
    lines.push(line);
  }

  await writeFile(envPath, `${lines.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
}
