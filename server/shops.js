import { fetchShopSnapshot, normalizeShopUrl } from './ldxpClient.js';
import { groupOptions } from './groups.js';
import { readStore, writeStore } from './storage.js';

export async function listShops() {
  const store = await readStore();
  const groups = groupOptions();
  const shops = applyGroupOverridesToShops(
    filterDeletedProducts(store.shops || [], store.deletedProducts || {}),
    store.productGroupOverrides || {},
    groups
  );

  return {
    shops,
    products: flattenProducts(shops),
    groups,
    settings: publicSettings(store.settings)
  };
}

export async function addOrRefreshShop(url) {
  const snapshot = await fetchShopSnapshot(url);
  const store = await readStore();
  const shops = store.shops || [];
  const index = shops.findIndex((shop) => shop.token === snapshot.token);

  if (index >= 0) {
    shops[index] = {
      ...shops[index],
      ...snapshot,
      createdAt: shops[index].createdAt || new Date().toISOString()
    };
  } else {
    shops.push({
      ...snapshot,
      createdAt: new Date().toISOString()
    });
  }

  await writeStore({ ...store, shops });
  return shops.find((shop) => shop.token === snapshot.token);
}

export async function refreshShop(token) {
  const normalized = normalizeShopUrl(`https://pay.ldxp.cn/shop/${token}`);
  const shop = await addOrRefreshShop(normalized.url);
  await restoreDeletedProductsForShop(normalized.token);
  return shop;
}

export async function deleteShop(token) {
  const store = await readStore();
  const shops = (store.shops || []).filter((shop) => shop.token !== token);
  const deletedProducts = Object.fromEntries(
    Object.entries(store.deletedProducts || {}).filter(([key]) => !key.startsWith(`${token}:`))
  );
  const productGroupOverrides = Object.fromEntries(
    Object.entries(store.productGroupOverrides || {}).filter(([key]) => !key.startsWith(`${token}:`))
  );
  await writeStore({ ...store, shops, deletedProducts, productGroupOverrides });
}

export async function refreshAllShops() {
  const store = await readStore();
  const shops = store.shops || [];
  const results = [];

  for (const shop of shops) {
    try {
      const refreshed = await fetchShopSnapshot(shop.link);
      const index = shops.findIndex((item) => item.token === refreshed.token);
      shops[index] = {
        ...shop,
        ...refreshed,
        createdAt: shop.createdAt || new Date().toISOString()
      };
      results.push({ token: shop.token, ok: true, products: refreshed.products.length });
    } catch (error) {
      results.push({ token: shop.token, ok: false, message: error.message });
    }
  }

  const failed = results.filter((result) => !result.ok);
  const settings = {
    ...store.settings,
    lastAutoRefreshAt: new Date().toISOString(),
    lastAutoRefreshStatus: failed.length > 0 ? 'partial' : 'success',
    lastAutoRefreshMessage: failed.length > 0
      ? `${failed.length} 个店铺刷新失败`
      : `已刷新 ${results.length} 个店铺`
  };

  await writeStore({ ...store, shops, settings });
  return { results, settings: publicSettings(settings) };
}

export async function manualRefreshAllShops() {
  const result = await refreshAllShops();
  const store = await readStore();
  await writeStore({ ...store, deletedProducts: {} });
  return result;
}

export async function getSettings() {
  const store = await readStore();
  return publicSettings(store.settings);
}

export async function updateProductGroup({ shopToken, productKey, groupId }) {
  if (!shopToken || !productKey || !groupId) {
    throw httpError(400, '缺少商品或分组参数');
  }

  const groups = groupOptions();
  const group = groups.find((item) => item.id === groupId);
  if (!group) {
    throw httpError(400, '分组不存在');
  }

  const store = await readStore();
  const product = (store.shops || [])
    .flatMap((shop) => shop.products || [])
    .find((item) => item.shopToken === shopToken && item.key === productKey);

  if (!product) {
    throw httpError(404, '商品不存在');
  }

  const overrideKey = productOverrideKey(shopToken, productKey);
  const productGroupOverrides = {
    ...(store.productGroupOverrides || {}),
    [overrideKey]: {
      groupId,
      groupLabel: group.label,
      updatedAt: new Date().toISOString()
    }
  };

  await writeStore({ ...store, productGroupOverrides });
  return {
    shopToken,
    productKey,
    groupId,
    groupLabel: group.label
  };
}

export async function deleteProduct({ shopToken, productKey }) {
  if (!shopToken || !productKey) {
    throw httpError(400, '缺少商品参数');
  }

  const store = await readStore();
  const product = (store.shops || [])
    .flatMap((shop) => shop.products || [])
    .find((item) => item.shopToken === shopToken && item.key === productKey);

  if (!product) {
    throw httpError(404, '商品不存在');
  }

  const deletedProducts = {
    ...(store.deletedProducts || {}),
    [productOverrideKey(shopToken, productKey)]: {
      deletedAt: new Date().toISOString(),
      name: product.name
    }
  };

  await writeStore({ ...store, deletedProducts });
  return { shopToken, productKey };
}

export async function updateSettings(input) {
  const store = await readStore();
  const refreshIntervalMinutes = Number(input?.refreshIntervalMinutes);
  const settings = {
    ...store.settings,
    siteTitle: sanitizeText(input?.siteTitle, store.settings.siteTitle || '链动小铺比价台'),
    adminPassword: sanitizePassword(input?.newAdminPassword, store.settings.adminPassword),
    autoRefreshEnabled: Boolean(input?.autoRefreshEnabled),
    refreshIntervalMinutes: Number.isFinite(refreshIntervalMinutes)
      ? Math.min(1440, Math.max(1, Math.round(refreshIntervalMinutes)))
      : store.settings.refreshIntervalMinutes
  };

  await writeStore({ ...store, settings });
  return publicSettings(settings);
}

function flattenProducts(shops) {
  return shops.flatMap((shop) =>
    (shop.products || []).map((product) => ({
      ...product,
      shopName: shop.name,
      shopLink: shop.link,
      shopAvatar: shop.avatar,
      fetchedAt: shop.fetchedAt
    }))
  );
}

function filterDeletedProducts(shops, deletedProducts) {
  return shops.map((shop) => ({
    ...shop,
    products: (shop.products || []).filter((product) => (
      !deletedProducts[productOverrideKey(shop.token, product.key)]
    ))
  }));
}

function applyGroupOverridesToShops(shops, overrides, groups) {
  const groupMap = new Map(groups.map((group) => [group.id, group.label]));

  return shops.map((shop) => ({
    ...shop,
    products: (shop.products || []).map((product) => {
      const override = overrides[productOverrideKey(shop.token, product.key)];
      if (!override || !groupMap.has(override.groupId)) return product;

      return {
        ...product,
        groupId: override.groupId,
        groupLabel: groupMap.get(override.groupId),
        groupOverride: true,
        groupOverrideUpdatedAt: override.updatedAt,
        matchedKeywords: ['手动分类']
      };
    })
  }));
}

function productOverrideKey(shopToken, productKey) {
  return `${shopToken}:${productKey}`;
}

async function restoreDeletedProductsForShop(shopToken) {
  const store = await readStore();
  const deletedProducts = Object.fromEntries(
    Object.entries(store.deletedProducts || {}).filter(([key]) => !key.startsWith(`${shopToken}:`))
  );
  await writeStore({ ...store, deletedProducts });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sanitizeText(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 40) : fallback;
}

function sanitizePassword(value, fallback) {
  if (typeof value !== 'string' || value.trim().length === 0) return fallback;
  return value.trim().slice(0, 80);
}

function publicSettings(settings) {
  const { adminPassword, ...safeSettings } = settings || {};
  return safeSettings;
}
