import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addOrRefreshShop,
  deleteShop,
  deleteProduct,
  getSettings,
  listShops,
  manualRefreshAllShops,
  refreshAllShops,
  refreshShop,
  updateProductGroup,
  updateSettings
} from './shops.js';
import { startScheduler } from './scheduler.js';
import { requireAdmin, verifyAdminPassword } from './auth.js';
import { getVersionInfo, runSelfUpdate } from './updater.js';

const app = express();
const port = Number(process.env.PORT || 4177);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/shops', async (req, res, next) => {
  try {
    res.json(await listShops());
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/login', async (req, res, next) => {
  try {
    res.json({ ok: await verifyAdminPassword(req.body?.password) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/shops', requireAdmin, async (req, res, next) => {
  try {
    const shop = await addOrRefreshShop(req.body?.url);
    res.status(201).json(shop);
  } catch (error) {
    next(error);
  }
});

app.post('/api/shops/:token/refresh', requireAdmin, async (req, res, next) => {
  try {
    res.json(await refreshShop(req.params.token));
  } catch (error) {
    next(error);
  }
});

app.post('/api/shops/refresh-all', requireAdmin, async (req, res, next) => {
  try {
    res.json(await manualRefreshAllShops());
  } catch (error) {
    next(error);
  }
});

app.get('/api/settings', async (req, res, next) => {
  try {
    res.json(await getSettings());
  } catch (error) {
    next(error);
  }
});

app.get('/api/version', requireAdmin, async (req, res, next) => {
  try {
    res.json(await getVersionInfo({ checkRemote: req.query.check === '1' }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/update', requireAdmin, async (req, res, next) => {
  try {
    res.json(await runSelfUpdate());
  } catch (error) {
    next(error);
  }
});

app.put('/api/settings', requireAdmin, async (req, res, next) => {
  try {
    res.json(await updateSettings(req.body));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/shops/:token', requireAdmin, async (req, res, next) => {
  try {
    await deleteShop(req.params.token);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.patch('/api/products/:shopToken/:productKey/group', requireAdmin, async (req, res, next) => {
  try {
    res.json(await updateProductGroup({
      shopToken: req.params.shopToken,
      productKey: req.params.productKey,
      groupId: req.body?.groupId
    }));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/products/:shopToken/:productKey', requireAdmin, async (req, res, next) => {
  try {
    res.json(await deleteProduct({
      shopToken: req.params.shopToken,
      productKey: req.params.productKey
    }));
  } catch (error) {
    next(error);
  }
});

if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(rootDir, 'dist');
  app.use(express.static(distDir));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((error, req, res, next) => {
  const status = error.status || 500;
  res.status(status).json({
    message: error.message || '服务器内部错误'
  });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`API server listening on http://127.0.0.1:${port}`);
  startScheduler();
});
