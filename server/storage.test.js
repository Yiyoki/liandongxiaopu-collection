import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('store defaults include UTF-8 title and language for new data files', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ldxp-store-'));
  const cwd = process.cwd();
  process.chdir(tempDir);
  process.env.LDXP_DATA_DIR = path.join(tempDir, 'data');

  try {
    const { readStore } = await import(`./storage.js?new-defaults=${Date.now()}`);
    const store = await readStore();

    assert.equal(store.settings.siteTitle, '链动小铺比价台');
    assert.equal(store.settings.language, 'zh-CN');
    assert.equal(store.settings.adminPassword, 'admin123');
  } finally {
    delete process.env.LDXP_DATA_DIR;
    process.chdir(cwd);
    await rm(tempDir, { recursive: true, force: true });
  }
});
