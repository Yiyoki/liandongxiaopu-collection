import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowUpDown,
  Box,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Filter,
  FolderKanban,
  Link as LinkIcon,
  Plus,
  RefreshCcw,
  Search,
  Store,
  Trash2,
  XCircle
} from 'lucide-react';
import './styles.css';
import { LANGUAGES, createTranslator, groupLabel } from './i18n.js';

const TYPE_LABEL_KEYS = {
  card: 'typeCard',
  article: 'typeArticle',
  resource: 'typeResource',
  equity: 'typeEquity'
};

function App() {
  const isAdminRoute = window.location.pathname === '/admin';
  const [data, setData] = useState({ shops: [], products: [], groups: [], settings: {} });
  const [shopUrl, setShopUrl] = useState('https://pay.ldxp.cn/shop/VK6TGVU1');
  const [adminPassword, setAdminPassword] = useState(() => sessionStorage.getItem('adminPassword') || '');
  const [adminAuthed, setAdminAuthed] = useState(() => Boolean(sessionStorage.getItem('adminPassword')));
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [versionInfo, setVersionInfo] = useState(null);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [shopFilter, setShopFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('in');
  const [typeFilter, setTypeFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [sortKey, setSortKey] = useState('priceAsc');
  const language = data.settings.language || 'zh-CN';
  const t = useMemo(() => createTranslator(language), [language]);

  const load = async () => {
    const response = await fetch('/api/shops');
    setData(await readJson(response, t));
  };

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    document.title = data.settings.siteTitle || t('defaultTitle');
    document.documentElement.lang = language;
  }, [data.settings.siteTitle, t]);

  const adminHeaders = () => ({
    'content-type': 'application/json',
    'x-admin-password': adminPassword
  });

  const loginAdmin = async (event) => {
    event.preventDefault();
    setMessage('');
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: adminPassword })
    });
    const payload = await readJson(response, t);

    if (!payload.ok) {
      setMessage(t('wrongPassword'));
      return;
    }

    sessionStorage.setItem('adminPassword', adminPassword);
    setAdminAuthed(true);
    setMessage(t('adminEntered'));
  };

  const addShop = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage(t('syncingShop'));
    try {
      const response = await fetch('/api/shops', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ url: shopUrl })
      });
      const payload = await readJson(response, t);
      await load();
      setMessage(t('syncedShop', { name: payload.name, count: payload.products.length }));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshShop = async (token) => {
    setLoading(true);
    setMessage(t('refreshingShop'));
    try {
      const response = await fetch(`/api/shops/${token}/refresh`, {
        method: 'POST',
        headers: adminHeaders()
      });
      const payload = await readJson(response, t);
      await load();
      setMessage(t('refreshedShop', { name: payload.name }));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshAll = async () => {
    if (!isAdminRoute || !adminAuthed) {
      window.location.href = '/admin';
      return;
    }

    setLoading(true);
    setMessage(t('refreshingAll'));
    try {
      const response = await fetch('/api/shops/refresh-all', {
        method: 'POST',
        headers: adminHeaders()
      });
      const payload = await readJson(response, t);
      await load();
      const failed = (payload.results || []).filter((result) => !result.ok).length;
      setMessage(failed > 0
        ? t('refreshPartial', { failed })
        : t('refreshedShopCount', { count: payload.results?.length || 0 }));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const removeShop = async (token) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/shops/${token}`, {
        method: 'DELETE',
        headers: adminHeaders()
      });
      if (!response.ok) await readJson(response, t);
      await load();
      setMessage(t('removedShop'));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (patch) => {
    const next = { ...data.settings, ...patch };
    setData((current) => ({ ...current, settings: next }));
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify(next)
      });
      const settings = await readJson(response, t);
      setData((current) => ({ ...current, settings }));
      setMessage(t('settingsSaved'));
    } catch (error) {
      setMessage(error.message);
    }
  };

  const updateAdminPassword = async (newAdminPassword) => {
    if (!newAdminPassword.trim()) {
      setMessage(t('inputNewPassword'));
      return;
    }

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ ...data.settings, newAdminPassword })
      });
      const settings = await readJson(response, t);
      setData((current) => ({ ...current, settings }));
      sessionStorage.removeItem('adminPassword');
      setAdminPassword('');
      setAdminAuthed(false);
      setMessage(t('passwordChangedRelogin'));
    } catch (error) {
      setMessage(error.message);
    }
  };

  const loadVersionInfo = async (checkRemote = false) => {
    if (!isAdminRoute || !adminAuthed) return;
    if (checkRemote) setMessage(t('checkingUpdate'));
    try {
      const response = await fetch(`/api/version${checkRemote ? '?check=1' : ''}`, {
        headers: adminHeaders()
      });
      const payload = await readJson(response, t);
      setVersionInfo(payload);
      if (checkRemote) {
        setMessage(payload.hasUpdate ? t('updateAvailable') : t('upToDate'));
      }
    } catch (error) {
      setMessage(error.message);
    }
  };

  const selfUpdate = async () => {
    if (!window.confirm(t('selfUpdate'))) return;

    setUpdating(true);
    setMessage(t('updatingApp'));
    try {
      const response = await fetch('/api/update', {
        method: 'POST',
        headers: adminHeaders()
      });
      const payload = await readJson(response, t);
      setVersionInfo(payload.version || versionInfo);
      setMessage(payload.updated
        ? t('updateInstalledWithRestart', { restart: t('restartMode', { mode: payload.restart?.mode || 'unknown' }) })
        : t('updateNotNeeded'));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setUpdating(false);
    }
  };

  const changeProductGroup = async (product, groupId) => {
    const nextGroupLabel = groupLabel(groupId, language);
    setData((current) => ({
      ...current,
      products: current.products.map((item) => (
        item.shopToken === product.shopToken && item.key === product.key
          ? { ...item, groupId, groupLabel: nextGroupLabel, groupOverride: true, matchedKeywords: [t('manualGroup')] }
          : item
      )),
      shops: current.shops.map((shop) => ({
        ...shop,
        products: (shop.products || []).map((item) => (
          item.shopToken === product.shopToken && item.key === product.key
            ? { ...item, groupId, groupLabel: nextGroupLabel, groupOverride: true, matchedKeywords: [t('manualGroup')] }
            : item
        ))
      }))
    }));

    try {
      const response = await fetch(`/api/products/${product.shopToken}/${product.key}/group`, {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify({ groupId })
      });
      const payload = await readJson(response, t);
      setMessage(t('groupChanged', { name: product.name, group: groupLabel(payload.groupId, language) }));
      await load();
    } catch (error) {
      setMessage(error.message);
      await load();
    }
  };

  const deleteProduct = async (product) => {
    if (!window.confirm(t('confirmDeleteProduct', { name: product.name }))) return;

    try {
      const response = await fetch(`/api/products/${product.shopToken}/${product.key}`, {
        method: 'DELETE',
        headers: adminHeaders()
      });
      await readJson(response, t);
      await load();
      setMessage(t('deletedProduct', { name: product.name }));
    } catch (error) {
      setMessage(error.message);
    }
  };

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const products = data.products.filter((product) => {
      const localizedGroup = groupLabel(product.groupId, language);
      const matchesQuery = !normalizedQuery ||
        [
          product.name,
          product.category,
          localizedGroup,
          product.shopName,
          ...(product.matchedKeywords || [])
        ].join(' ').toLowerCase().includes(normalizedQuery);
      const matchesShop = shopFilter === 'all' || product.shopToken === shopFilter;
      const matchesStock = stockFilter === 'all' ||
        (stockFilter === 'in' && product.inStock) ||
        (stockFilter === 'out' && !product.inStock);
      const matchesType = typeFilter === 'all' || product.type === typeFilter;
      const matchesGroup = groupFilter === 'all' || product.groupId === groupFilter;
      return matchesQuery && matchesShop && matchesStock && matchesType && matchesGroup;
    });

    return products.sort((a, b) => {
      if (sortKey === 'priceDesc') return b.price - a.price;
      if (sortKey === 'stockDesc') return (b.stock ?? -1) - (a.stock ?? -1);
      if (sortKey === 'updatedDesc') return new Date(b.fetchedAt) - new Date(a.fetchedAt);
      if (sortKey === 'group') return `${groupLabel(a.groupId, language)}${a.price}`.localeCompare(`${groupLabel(b.groupId, language)}${b.price}`, language);
      return a.price - b.price;
    });
  }, [data.products, query, shopFilter, stockFilter, typeFilter, groupFilter, sortKey, language]);

  const stats = useMemo(() => {
    const inStock = data.products.filter((product) => product.inStock).length;
    const prices = data.products.map((product) => product.price).filter(Number.isFinite);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    return { inStock, minPrice };
  }, [data.products]);

  const groupSummaries = useMemo(() => (
    data.groups.map((group) => {
      const products = data.products.filter((product) => product.groupId === group.id);
      const inStockProducts = products.filter((product) => product.inStock);
      const cheapest = [...inStockProducts].sort((a, b) => a.price - b.price)[0];
      return { ...group, label: groupLabel(group.id, language), count: products.length, inStock: inStockProducts.length, cheapest };
    })
  ), [data.groups, data.products, language]);

  useEffect(() => {
    if (isAdminRoute && adminAuthed) {
      loadVersionInfo(false);
    }
  }, [isAdminRoute, adminAuthed]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Store size={22} /></div>
          <div>
            <h1>{data.settings.siteTitle || t('defaultTitle')}</h1>
            <p>{t('appSubtitle')}</p>
          </div>
        </div>

        {isAdminRoute ? (
          <nav className="view-nav">
            <a href="/">
              <Box size={17} />
              {t('compare')}
            </a>
            <a className="active" href="/admin">
              <Store size={17} />
              {t('admin')}
            </a>
          </nav>
        ) : null}

        <section className="refresh-box compact">
          <div className="section-title">{t('refreshStatus')}</div>
          <div className="status-line">
            <Clock3 size={16} />
            <span>{data.settings.autoRefreshEnabled ? t('refreshEvery', { minutes: data.settings.refreshIntervalMinutes || 15 }) : t('autoRefreshOff')}</span>
          </div>
          <button className="secondary-button" onClick={refreshAll} disabled={loading}>
            <RefreshCcw size={16} />
            {t('refreshNow')}
          </button>
          <p>{data.settings.lastAutoRefreshAt ? t('lastRefresh', { time: formatDate(data.settings.lastAutoRefreshAt, language) }) : t('neverAutoRefresh')}</p>
        </section>

        <div className="side-note">
          <span>{t('shopCount', { count: data.shops.length })}</span>
          <span>{t('inStockProductCount', { count: data.products.filter((product) => product.inStock).length })}</span>
        </div>
      </aside>

      <main className="workspace">
        {message && <div className="message">{message}</div>}

        {isAdminRoute ? (
          adminAuthed ? (
            <AdminView
              data={data}
              shopUrl={shopUrl}
              setShopUrl={setShopUrl}
              addShop={addShop}
              refreshShop={refreshShop}
              removeShop={removeShop}
              updateSettings={updateSettings}
              updateAdminPassword={updateAdminPassword}
              versionInfo={versionInfo}
              loadVersionInfo={loadVersionInfo}
              selfUpdate={selfUpdate}
              loading={loading}
              updating={updating}
              filteredProducts={filteredProducts}
              changeProductGroup={changeProductGroup}
              deleteProduct={deleteProduct}
              query={query}
              setQuery={setQuery}
              shopFilter={shopFilter}
              setShopFilter={setShopFilter}
              groupFilter={groupFilter}
              setGroupFilter={setGroupFilter}
              t={t}
              language={language}
            />
          ) : (
            <AdminLogin
              adminPassword={adminPassword}
              setAdminPassword={setAdminPassword}
              loginAdmin={loginAdmin}
              t={t}
            />
          )
        ) : (
          <DashboardView
            data={data}
            stats={stats}
            groupSummaries={groupSummaries}
            groupFilter={groupFilter}
            setGroupFilter={setGroupFilter}
            query={query}
            setQuery={setQuery}
            shopFilter={shopFilter}
            setShopFilter={setShopFilter}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            stockFilter={stockFilter}
            setStockFilter={setStockFilter}
            sortKey={sortKey}
            setSortKey={setSortKey}
            filteredProducts={filteredProducts}
            t={t}
            language={language}
          />
        )}
      </main>
    </div>
  );
}

function DashboardView(props) {
  const { data, stats, groupSummaries, groupFilter, setGroupFilter, filteredProducts, t, language } = props;
  return (
    <>
      <div className="summary-grid">
        <Metric icon={<Store size={20} />} label={t('shops')} value={data.shops.length} />
        <Metric icon={<Box size={20} />} label={t('products')} value={data.products.length} />
        <Metric icon={<CheckCircle2 size={20} />} label={t('inStock')} value={stats.inStock} />
        <Metric icon={<ArrowUpDown size={20} />} label={t('lowestPrice')} value={`${t('currencySymbol')}${formatPrice(stats.minPrice, language)}`} />
      </div>

      <GroupCards groups={groupSummaries} activeGroup={groupFilter} onChange={setGroupFilter} t={t} language={language} />
      <ProductToolbar {...props} />
      <ProductTable data={data} filteredProducts={filteredProducts} readOnly t={t} language={language} />
    </>
  );
}

function AdminView({
  data,
  shopUrl,
  setShopUrl,
  addShop,
  refreshShop,
  removeShop,
  updateSettings,
  updateAdminPassword,
  versionInfo,
  loadVersionInfo,
  selfUpdate,
  loading,
  updating,
  filteredProducts,
  changeProductGroup,
  deleteProduct,
  query,
  setQuery,
  shopFilter,
  setShopFilter,
  groupFilter,
  setGroupFilter,
  t,
  language
}) {
  const [newPassword, setNewPassword] = useState('');

  return (
    <>
      <section className="management-grid">
        <div className="management-panel">
          <div className="panel-header compact-header">
            <h2>{t('shopManagement')}</h2>
            <span>{t('shopCount', { count: data.shops.length })}</span>
          </div>
          <form className="add-form management-form" onSubmit={addShop}>
            <label htmlFor="shopUrl">{t('shopLink')}</label>
            <div className="input-row">
              <LinkIcon size={17} />
              <input id="shopUrl" value={shopUrl} onChange={(event) => setShopUrl(event.target.value)} placeholder="https://pay.ldxp.cn/shop/..." />
            </div>
            <button className="primary-button" disabled={loading}>
              <Plus size={17} />
              {t('addAndSync')}
            </button>
          </form>
        </div>

        <div className="management-panel">
          <div className="panel-header compact-header">
            <h2>{t('scheduledRefresh')}</h2>
            <span>{data.settings.lastAutoRefreshAt ? formatDate(data.settings.lastAutoRefreshAt, language) : t('notRefreshed')}</span>
          </div>
          <div className="settings-form">
            <label htmlFor="siteTitle">{t('siteTitle')}</label>
            <div className="input-row">
              <input id="siteTitle" value={data.settings.siteTitle || ''} onChange={(event) => updateSettings({ siteTitle: event.target.value })} placeholder={t('defaultTitle')} />
            </div>
            <label htmlFor="language">{t('language')}</label>
            <label className="select-control">
              <select id="language" value={language} onChange={(event) => updateSettings({ language: event.target.value })}>
                {LANGUAGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="switch-row">
              <input type="checkbox" checked={Boolean(data.settings.autoRefreshEnabled)} onChange={(event) => updateSettings({ autoRefreshEnabled: event.target.checked })} />
              <span>{t('autoRefresh')}</span>
            </label>
            <label className="number-row">
              <Clock3 size={16} />
              <input type="number" min="1" max="1440" value={data.settings.refreshIntervalMinutes || 15} onChange={(event) => updateSettings({ refreshIntervalMinutes: event.target.value })} />
              <span>{t('minutes')}</span>
            </label>
          </div>
        </div>

        <div className="management-panel">
          <div className="panel-header compact-header">
            <h2>{t('adminPassword')}</h2>
            <span>{t('localConfig')}</span>
          </div>
          <div className="settings-form">
            <label htmlFor="newAdminPassword">{t('newPassword')}</label>
            <div className="input-row">
              <input id="newAdminPassword" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder={t('newPasswordPlaceholder')} />
            </div>
            <button className="secondary-button" type="button" onClick={() => { updateAdminPassword(newPassword); setNewPassword(''); }}>
              {t('saveNewPassword')}
            </button>
          </div>
        </div>

        <div className="management-panel">
          <div className="panel-header compact-header">
            <h2>{t('versionUpdate')}</h2>
            <span>{versionInfo ? (versionInfo.hasUpdate ? t('updateAvailable') : t('upToDate')) : t('noVersionInfo')}</span>
          </div>
          <div className="settings-form">
            <VersionLine label={t('currentVersion')} value={versionInfo?.localShortHash || '-'} />
            <VersionLine label={t('remoteVersion')} value={versionInfo?.remoteShortHash || '-'} />
            <VersionLine label={t('branch')} value={versionInfo?.branch || '-'} />
            {versionInfo?.dirty ? <div className="warning-line">{t('localChanges')}</div> : null}
            {versionInfo?.remoteError ? <div className="warning-line">{versionInfo.remoteError}</div> : null}
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={() => loadVersionInfo(true)} disabled={updating}>
                <RefreshCcw size={16} />
                {t('checkUpdate')}
              </button>
              <button className="primary-button" type="button" onClick={selfUpdate} disabled={updating || versionInfo?.dirty}>
                <RefreshCcw size={16} />
                {t('selfUpdate')}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="product-panel">
        <div className="panel-header">
          <h2>{t('managedShops')}</h2>
          <span>{t('refreshAndRemove')}</span>
        </div>
        <div className="managed-shops">
          {data.shops.length === 0 ? (
            <div className="empty">{t('emptyShops')}</div>
          ) : data.shops.map((shop) => (
            <div className="shop-card managed" key={shop.token}>
              <div className="shop-main">
                <img src={shop.avatar || placeholderImage(shop.name)} alt="" />
                <div>
                  <a href={shop.link} target="_blank" rel="noreferrer">{shop.name}</a>
                  <span>{[t('productCount', { count: shop.products.length }), t('rawCategoryCount', { count: shop.categories?.length || 0 }), formatDate(shop.fetchedAt, language)].join(t('separator'))}</span>
                </div>
              </div>
              <div className="shop-actions">
                <button title={t('refresh')} onClick={() => refreshShop(shop.token)} disabled={loading}>
                  <RefreshCcw size={15} />
                </button>
                <button title={t('remove')} onClick={() => removeShop(shop.token)} disabled={loading}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="toolbar management-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchAdmin')} />
        </div>
        <SelectControl icon={<FolderKanban size={16} />} value={groupFilter} onChange={setGroupFilter}>
          <option value="all">{t('allGroups')}</option>
          {data.groups.map((group) => <option key={group.id} value={group.id}>{groupLabel(group.id, language)}</option>)}
        </SelectControl>
        <SelectControl icon={<Store size={16} />} value={shopFilter} onChange={setShopFilter}>
          <option value="all">{t('allShops')}</option>
          {data.shops.map((shop) => <option key={shop.token} value={shop.token}>{shop.name}</option>)}
        </SelectControl>
      </section>

      <ProductTable data={data} filteredProducts={filteredProducts} changeProductGroup={changeProductGroup} deleteProduct={deleteProduct} t={t} language={language} />
    </>
  );
}

function AdminLogin({ adminPassword, setAdminPassword, loginAdmin, t }) {
  return (
    <section className="admin-login">
      <form className="management-panel login-panel" onSubmit={loginAdmin}>
        <div className="panel-header compact-header">
          <h2>{t('adminPanel')}</h2>
          <span>/admin</span>
        </div>
        <div className="settings-form">
          <label htmlFor="adminPassword">{t('password')}</label>
          <div className="input-row">
            <input id="adminPassword" type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} placeholder={t('passwordPlaceholder')} />
          </div>
          <button className="primary-button">{t('enterAdmin')}</button>
        </div>
      </form>
    </section>
  );
}

function VersionLine({ label, value }) {
  return (
    <div className="version-line">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function GroupCards({ groups, activeGroup, onChange, t, language }) {
  return (
    <section className="group-grid">
      {groups.map((group) => (
        <button key={group.id} className={activeGroup === group.id ? 'group-card active' : 'group-card'} onClick={() => onChange(activeGroup === group.id ? 'all' : group.id)}>
          <div>
            <strong>{groupLabel(group.id, language)}</strong>
            <span>{[t('productCount', { count: group.count }), t('inStockCount', { count: group.inStock })].join(t('separator'))}</span>
          </div>
          <em>{group.cheapest ? `${t('currencySymbol')}${formatPrice(group.cheapest.price, language)}` : '-'}</em>
        </button>
      ))}
    </section>
  );
}

function ProductToolbar({ data, query, setQuery, shopFilter, setShopFilter, typeFilter, setTypeFilter, stockFilter, setStockFilter, groupFilter, setGroupFilter, sortKey, setSortKey, t, language }) {
  return (
    <section className="toolbar">
      <div className="search-box">
        <Search size={18} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchDashboard')} />
      </div>
      <SelectControl icon={<FolderKanban size={16} />} value={groupFilter} onChange={setGroupFilter}>
        <option value="all">{t('allGroups')}</option>
        {data.groups.map((group) => <option key={group.id} value={group.id}>{groupLabel(group.id, language)}</option>)}
      </SelectControl>
      <SelectControl icon={<Store size={16} />} value={shopFilter} onChange={setShopFilter}>
        <option value="all">{t('allShops')}</option>
        {data.shops.map((shop) => <option key={shop.token} value={shop.token}>{shop.name}</option>)}
      </SelectControl>
      <SelectControl icon={<Filter size={16} />} value={typeFilter} onChange={setTypeFilter}>
        <option value="all">{t('allTypes')}</option>
        {Object.entries(TYPE_LABEL_KEYS).map(([value, labelKey]) => <option key={value} value={value}>{t(labelKey)}</option>)}
      </SelectControl>
      <SelectControl icon={<CheckCircle2 size={16} />} value={stockFilter} onChange={setStockFilter}>
        <option value="all">{t('allStock')}</option>
        <option value="in">{t('onlyInStock')}</option>
        <option value="out">{t('onlyOutOfStock')}</option>
      </SelectControl>
      <SelectControl icon={<ArrowUpDown size={16} />} value={sortKey} onChange={setSortKey}>
        <option value="priceAsc">{t('priceAsc')}</option>
        <option value="priceDesc">{t('priceDesc')}</option>
        <option value="stockDesc">{t('stockDesc')}</option>
        <option value="updatedDesc">{t('updatedDesc')}</option>
        <option value="group">{t('groupSort')}</option>
      </SelectControl>
    </section>
  );
}

function ProductTable({ data, filteredProducts, changeProductGroup, deleteProduct, readOnly = false, t, language }) {
  return (
    <section className="product-panel">
      <div className="panel-header">
        <h2>{t('productCompare')}</h2>
        <span>{t('resultCount', { count: filteredProducts.length })}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('product')}</th>
              <th>{t('group')}</th>
              <th>{t('shops')}</th>
              <th>{t('originalCategory')}</th>
              <th>{t('price')}</th>
              <th>{t('stock')}</th>
              <th>{t('refreshTime')}</th>
              <th>{t('link')}</th>
              {!readOnly ? <th>{t('action')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={readOnly ? 8 : 9} className="table-empty">{t('emptyProducts')}</td>
              </tr>
            ) : filteredProducts.map((product) => (
              <tr key={`${product.shopToken}-${product.key}`}>
                <td>
                  <div className="product-cell">
                    <img src={product.image || placeholderImage(product.name)} alt="" />
                    <div>
                      <a href={product.link} target="_blank" rel="noreferrer">{product.name}</a>
                      <span>{t(TYPE_LABEL_KEYS[product.type] || product.type)}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="group-cell">
                    {readOnly ? (
                      <b>{groupLabel(product.groupId, language)}</b>
                    ) : (
                      <select value={product.groupId} onChange={(event) => changeProductGroup(product, event.target.value)} aria-label={t('changeProductGroup')}>
                        {data.groups.map((group) => <option key={group.id} value={group.id}>{groupLabel(group.id, language)}</option>)}
                      </select>
                    )}
                    <span>{product.groupOverride ? t('manualGroup') : ((product.matchedKeywords || []).join(' / ') || '-')}</span>
                  </div>
                </td>
                <td>
                  <a className="plain-link" href={product.shopLink} target="_blank" rel="noreferrer">{product.shopName}</a>
                </td>
                <td>{product.category || '-'}</td>
                <td className="price">{t('currencySymbol')}{formatPrice(product.price, language)}</td>
                <td>
                  <span className={product.inStock ? 'stock in' : 'stock out'}>
                    {product.inStock ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    {product.stock === null ? t('unknown') : product.stock}
                  </span>
                </td>
                <td>{formatDate(product.fetchedAt, language)}</td>
                <td>
                  <a className="icon-link" href={product.link} target="_blank" rel="noreferrer" title={t('openProduct')}>
                    <ExternalLink size={16} />
                  </a>
                </td>
                {!readOnly ? (
                  <td>
                    <button className="danger-icon-button" onClick={() => deleteProduct(product)} title={t('deleteProduct')}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div className="metric">
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function SelectControl({ icon, value, onChange, children }) {
  return (
    <label className="select-control">
      {icon}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

async function readJson(response, t = createTranslator('zh-CN')) {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  let payload = {};

  if (contentType.includes('application/json')) {
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(t('invalidJson'));
    }
  } else if (text.trim().startsWith('<')) {
    throw new Error(t(response.status >= 500 ? 'htmlGatewayResponse' : 'htmlResponse', { status: response.status }));
  } else if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(payload.message || t('requestFailed'));
  }
  return payload;
}

function formatPrice(value, language = 'zh-CN') {
  return Number(value || 0).toLocaleString(language, {
    minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2,
    maximumFractionDigits: 2
  });
}

function formatDate(value, language = 'zh-CN') {
  if (!value) return '-';
  return new Intl.DateTimeFormat(language, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function placeholderImage(text) {
  const initial = encodeURIComponent((text || 'S').slice(0, 1));
  return `https://dummyimage.com/96x96/e9eef5/304256.png&text=${initial}`;
}

createRoot(document.getElementById('root')).render(<App />);
