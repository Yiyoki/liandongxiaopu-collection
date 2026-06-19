import { classifyProduct } from './groups.js';

const BASE_URL = 'https://pay.ldxp.cn';
const GOODS_TYPES = ['card', 'article', 'resource', 'equity'];
const ACW_SC_V2_COOKIE = 'acw_sc__v2';
const ACW_SC_V2_KEY = '3000176000856006061501533003690027800375';
const ACW_SC_V2_UNSBOX_INDEXES = [
  0xf, 0x23, 0x1d, 0x18, 0x21, 0x10, 0x1, 0x26, 0xa, 0x9,
  0x13, 0x1f, 0x28, 0x1b, 0x16, 0x17, 0x19, 0xd, 0x6, 0xb,
  0x27, 0x12, 0x14, 0x8, 0xe, 0x15, 0x20, 0x1a, 0x2, 0x1e,
  0x7, 0x4, 0x11, 0x5, 0x3, 0x1c, 0x22, 0x25, 0xc, 0x24
];
const upstreamCookies = new Map();

export function normalizeShopUrl(input) {
  if (!input || typeof input !== 'string') {
    throw httpError(400, '请输入店铺链接');
  }

  let url;
  try {
    url = new URL(input.trim());
  } catch {
    throw httpError(400, '店铺链接格式不正确');
  }

  if (url.hostname !== 'pay.ldxp.cn') {
    throw httpError(400, '仅支持 pay.ldxp.cn 的店铺链接');
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'shop' || !parts[1]) {
    throw httpError(400, '请输入以 https://pay.ldxp.cn/shop/ 开头的店铺链接');
  }

  const token = parts[1].trim();
  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    throw httpError(400, '店铺 token 不合法');
  }

  return {
    token,
    url: `${BASE_URL}/shop/${token}`
  };
}

export async function fetchShopSnapshot(url) {
  const normalized = normalizeShopUrl(url);
  const infoResponse = await postShopApi('/shopApi/Shop/info', { token: normalized.token });
  const info = infoResponse.data;
  const goodsTypes = Array.isArray(info.goods_type_sort) && info.goods_type_sort.length
    ? info.goods_type_sort
    : GOODS_TYPES;

  const categories = [];
  const productsByKey = new Map();

  for (const goodsType of goodsTypes) {
    categories.push(...await fetchCategories(normalized.token, goodsType));
    const products = await fetchGoodsByType(normalized.token, goodsType);
    for (const product of products) {
      const normalizedProduct = normalizeProduct(product, goodsType, normalized.token);
      if (!normalizedProduct.excluded) {
        productsByKey.set(product.goods_key, normalizedProduct);
      }
    }
  }

  const products = Array.from(productsByKey.values()).sort((a, b) => {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    if (a.groupId !== b.groupId) return a.groupLabel.localeCompare(b.groupLabel, 'zh-CN');
    return a.price - b.price;
  });

  return {
    token: normalized.token,
    link: normalized.url,
    name: info.nickname || normalized.token,
    avatar: info.avatar || '',
    description: stripHtml(info.description || ''),
    authStatus: info.auth_status,
    depositMoney: numberOrNull(info.deposit_money),
    sellCount: numberOrNull(info.sell_count),
    goodsCount: numberOrNull(info.goods_count),
    typeCounts: {
      card: numberOrZero(info.card_count),
      article: numberOrZero(info.article_count),
      resource: numberOrZero(info.resource_count),
      equity: numberOrZero(info.equity_count)
    },
    categories: dedupeCategories(categories),
    fetchedAt: new Date().toISOString(),
    products
  };
}

async function fetchCategories(token, goodsType) {
  try {
    const response = await postShopApi('/shopApi/Shop/categoryList', {
      token,
      goods_type: goodsType
    });

    return (response.data || []).map((category) => ({
      id: category.id,
      name: category.name,
      image: category.image || '',
      goodsCount: numberOrZero(category.goods_count),
      goodsType
    }));
  } catch {
    return [];
  }
}

async function fetchGoodsByType(token, goodsType) {
  const pageSize = 100;
  let current = 1;
  const all = [];

  while (current <= 50) {
    const response = await postShopApi('/shopApi/Shop/goodsList', {
      token,
      keywords: '',
      category_id: 0,
      goods_type: goodsType,
      current,
      pageSize
    });

    const list = response.data?.list || [];
    all.push(...list);

    const total = Number(response.data?.total || 0);
    if (list.length === 0 || all.length >= total || list.length < pageSize) {
      break;
    }

    current += 1;
  }

  return all;
}

async function postShopApi(pathname, body) {
  const payload = await requestShopApi(pathname, body, true);
  if (payload.code !== 1) {
    throw httpError(502, payload.msg || '链动小铺接口返回失败');
  }

  return payload;
}

async function requestShopApi(pathname, body, allowChallengeRetry) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: 'POST',
    headers: buildShopApiHeaders(body),
    body: JSON.stringify(body)
  });
  rememberSetCookies(response.headers);
  const text = await response.text();

  if (!response.ok) {
    throw httpError(response.status, `链动小铺接口请求失败：${response.status}`);
  }

  if (isHtmlResponse(response, text)) {
    const challengeCookie = resolveAcwScV2Cookie(text);
    if (challengeCookie && allowChallengeRetry) {
      upstreamCookies.set(ACW_SC_V2_COOKIE, challengeCookie);
      return requestShopApi(pathname, body, false);
    }

    throw httpError(
      502,
      '链动小铺上游返回了反爬验证页，自动验证失败。请稍后重试，或更换服务器出口 IP/配置代理。'
    );
  }

  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw httpError(502, '链动小铺接口返回了无效 JSON');
  }
  return payload;
}

function buildShopApiHeaders(body) {
  const headers = {
    'content-type': 'application/json;charset=UTF-8',
    accept: 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    origin: BASE_URL,
    referer: body?.token ? `${BASE_URL}/shop/${encodeURIComponent(body.token)}` : `${BASE_URL}/`
  };

  const cookie = buildCookieHeader();
  if (cookie) headers.cookie = cookie;

  return headers;
}

function buildCookieHeader() {
  const configuredCookie = process.env.LDXP_ACW_SC_V2 || process.env.LDXP_ACW_SC__V2;
  if (configuredCookie && !upstreamCookies.has(ACW_SC_V2_COOKIE)) {
    upstreamCookies.set(ACW_SC_V2_COOKIE, normalizeAcwCookieValue(configuredCookie));
  }

  return Array.from(upstreamCookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function normalizeAcwCookieValue(value) {
  const match = String(value).match(/(?:^|;\s*)acw_sc__v2=([^;]+)/);
  return match ? match[1].trim() : String(value).trim();
}

function rememberSetCookies(headers) {
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : splitSetCookieHeader(headers.get('set-cookie'));

  for (const value of values) {
    const pair = value.split(';')[0];
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex <= 0) continue;
    upstreamCookies.set(pair.slice(0, separatorIndex).trim(), pair.slice(separatorIndex + 1).trim());
  }
}

function splitSetCookieHeader(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,]+=)/).map((item) => item.trim()).filter(Boolean);
}

function isHtmlResponse(response, text) {
  const contentType = response.headers.get('content-type') || '';
  const trimmed = text.trimStart();
  return contentType.includes('text/html') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<!doctype html') ||
    /var\s+arg1\s*=/.test(text);
}

export function resolveAcwScV2Cookie(html) {
  const arg1 = extractAcwArg1(html);
  if (!arg1 || arg1.length !== ACW_SC_V2_UNSBOX_INDEXES.length) return null;
  return hexXor(unsbox(arg1), ACW_SC_V2_KEY);
}

export function extractAcwArg1(html) {
  const match = String(html).match(/var\s+arg1\s*=\s*['"]([0-9a-fA-F]+)['"]/);
  return match ? match[1] : null;
}

function unsbox(value) {
  const result = new Array(value.length);
  for (let index = 0; index < ACW_SC_V2_UNSBOX_INDEXES.length; index += 1) {
    result[ACW_SC_V2_UNSBOX_INDEXES[index]] = value[index];
  }
  return result.join('');
}

function hexXor(value, key) {
  let result = '';
  for (let index = 0; index < value.length && index < key.length; index += 2) {
    const left = Number.parseInt(value.slice(index, index + 2), 16);
    const right = Number.parseInt(key.slice(index, index + 2), 16);
    result += (left ^ right).toString(16).padStart(2, '0');
  }
  return result;
}

function normalizeProduct(product, goodsType, shopToken) {
  const stock = numberOrNull(product.extend?.stock_count);
  const price = Number(product.price || 0);
  const description = stripHtml(product.description || '');
  const normalized = {
    key: product.goods_key,
    link: product.link || `${BASE_URL}/item/${product.goods_key}`,
    shopToken,
    type: product.goods_type || goodsType,
    name: product.name || '未命名商品',
    price,
    marketPrice: numberOrNull(product.market_price),
    stock,
    inStock: stock === null ? true : stock > 0,
    stockVisible: product.extend?.show_stock_type !== undefined
      ? Number(product.extend.show_stock_type)
      : null,
    categoryId: product.category?.id || null,
    category: product.category?.name || '',
    image: product.image || '',
    description,
    createdAt: unixToIso(product.create_time),
    hasDiscount: Boolean(
      product.discount?.available === 1 ||
      product.multipleoffers?.available === 1 ||
      product.fullgift?.available === 1
    ),
    excluded: isExcludedProduct(product, description)
  };

  return {
    ...normalized,
    ...classifyProduct(normalized)
  };
}

function isExcludedProduct(product, description) {
  const category = product.category?.name || '';
  const text = `${product.name || ''} ${category} ${description || ''}`.toLowerCase();
  const primaryText = `${product.name || ''} ${category}`.toLowerCase();

  const isEmailUtility = /邮箱|outlook|hotmail|gmail|oauth|graph/.test(primaryText);
  if (isEmailUtility) return false;

  const apiPrimaryPatterns = [
    /\bapi\b/i,
    /api\s*key/i,
    /apikey/i,
    /接口/,
    /中转/,
    /转发/,
    /额度api/i
  ];

  const isClearlyApiProduct = apiPrimaryPatterns.some((pattern) => pattern.test(primaryText));
  if (isClearlyApiProduct) return true;

  const descriptionApiOnly = (
    /api\s*key/i.test(text) ||
    /apikey/i.test(text) ||
    text.includes('接口额度') ||
    text.includes('中转额度')
  );

  return descriptionApiOnly && !/(账号|成品|plus|pro|free|team|接码|邮箱|rt|cpa|sub)/i.test(primaryText);
}

function dedupeCategories(categories) {
  const seen = new Map();
  for (const category of categories) {
    const key = `${category.goodsType}:${category.id}`;
    seen.set(key, category);
  }
  return Array.from(seen.values());
}

function stripHtml(value) {
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unixToIso(value) {
  const number = Number(value);
  if (!number) return null;
  return new Date(number * 1000).toISOString();
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
