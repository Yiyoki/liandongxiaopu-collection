import './loadEnv.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.LDXP_DATA_DIR
  ? path.resolve(process.env.LDXP_DATA_DIR)
  : path.resolve(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'shops.json');
const DEFAULT_SETTINGS = {
  siteTitle: '链动小铺比价台',
  language: 'zh-CN',
  adminPassword: 'admin123',
  autoRefreshEnabled: true,
  refreshIntervalMinutes: 15,
  lastAutoRefreshAt: null,
  lastAutoRefreshStatus: 'idle',
  lastAutoRefreshMessage: ''
};

export async function readStore() {
  try {
    const content = await readFile(dataFile, 'utf8');
    return withDefaults(JSON.parse(content));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return withDefaults({});
    }
    throw error;
  }
}

export async function writeStore(store) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function withDefaults(store) {
  return {
    shops: [],
    productGroupOverrides: {},
    deletedProducts: {},
    ...store,
    productGroupOverrides: store.productGroupOverrides || {},
    deletedProducts: store.deletedProducts || {},
    settings: {
      ...DEFAULT_SETTINGS,
      ...(store.settings || {})
    }
  };
}
