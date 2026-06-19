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

const TYPE_LABELS = {
  card: '卡密',
  article: '知识',
  resource: '资源',
  equity: '权益'
};

const DEFAULT_PASSWORD = '';

function App() {
  const isAdminRoute = window.location.pathname === '/admin';
  const [data, setData] = useState({ shops: [], products: [], groups: [], settings: {} });
  const [shopUrl, setShopUrl] = useState('https://pay.ldxp.cn/shop/VK6TGVU1');
  const [adminPassword, setAdminPassword] = useState(() => sessionStorage.getItem('adminPassword') || DEFAULT_PASSWORD);
  const [adminAuthed, setAdminAuthed] = useState(() => Boolean(sessionStorage.getItem('adminPassword')));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [shopFilter, setShopFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('in');
  const [typeFilter, setTypeFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [sortKey, setSortKey] = useState('priceAsc');

  const load = async () => {
    const response = await fetch('/api/shops');
    setData(await readJson(response));
  };

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, []);

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
    const payload = await readJson(response);

    if (!payload.ok) {
      setMessage('管理密码不正确');
      return;
    }

    sessionStorage.setItem('adminPassword', adminPassword);
    setAdminAuthed(true);
    setMessage('已进入管理后台');
  };

  const addShop = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage('正在同步店铺商品...');
    try {
      const response = await fetch('/api/shops', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ url: shopUrl })
      });
      const payload = await readJson(response);
      await load();
      setMessage(`已同步 ${payload.name}，共 ${payload.products.length} 个商品`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshShop = async (token) => {
    setLoading(true);
    setMessage('正在刷新店铺...');
    try {
      const response = await fetch(`/api/shops/${token}/refresh`, {
        method: 'POST',
        headers: adminHeaders()
      });
      const payload = await readJson(response);
      await load();
      setMessage(`已刷新 ${payload.name}`);
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
    setMessage('正在刷新全部店铺...');
    try {
      const response = await fetch('/api/shops/refresh-all', {
        method: 'POST',
        headers: adminHeaders()
      });
      const payload = await readJson(response);
      await load();
      setMessage(payload.settings?.lastAutoRefreshMessage || '已刷新全部店铺');
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
      if (!response.ok) await readJson(response);
      await load();
      setMessage('已移除店铺');
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
      const settings = await readJson(response);
      setData((current) => ({ ...current, settings }));
      setMessage('刷新设置已保存');
    } catch (error) {
      setMessage(error.message);
    }
  };

  const updateAdminPassword = async (newAdminPassword) => {
    if (!newAdminPassword.trim()) {
      setMessage('请输入新的管理密码');
      return;
    }

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ ...data.settings, newAdminPassword })
      });
      const settings = await readJson(response);
      setData((current) => ({ ...current, settings }));
      sessionStorage.removeItem('adminPassword');
      setAdminPassword('');
      setAdminAuthed(false);
      setMessage('管理密码已修改，请重新登录');
    } catch (error) {
      setMessage(error.message);
    }
  };

  const changeProductGroup = async (product, groupId) => {
    const groupLabel = data.groups.find((group) => group.id === groupId)?.label || product.groupLabel;
    setData((current) => ({
      ...current,
      products: current.products.map((item) => (
        item.shopToken === product.shopToken && item.key === product.key
          ? { ...item, groupId, groupLabel, groupOverride: true, matchedKeywords: ['手动分类'] }
          : item
      )),
      shops: current.shops.map((shop) => ({
        ...shop,
        products: (shop.products || []).map((item) => (
          item.shopToken === product.shopToken && item.key === product.key
            ? { ...item, groupId, groupLabel, groupOverride: true, matchedKeywords: ['手动分类'] }
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
      const payload = await readJson(response);
      setMessage(`已将 ${product.name} 归类为 ${payload.groupLabel}`);
      await load();
    } catch (error) {
      setMessage(error.message);
      await load();
    }
  };

  const deleteProduct = async (product) => {
    if (!window.confirm(`确定从本地列表删除「${product.name}」吗？手动刷新店铺后会重新拉回。`)) {
      return;
    }

    try {
      const response = await fetch(`/api/products/${product.shopToken}/${product.key}`, {
        method: 'DELETE',
        headers: adminHeaders()
      });
      await readJson(response);
      await load();
      setMessage(`已删除 ${product.name}`);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const products = data.products.filter((product) => {
      const matchesQuery = !normalizedQuery ||
        [
          product.name,
          product.category,
          product.groupLabel,
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
      if (sortKey === 'group') return `${a.groupLabel}${a.price}`.localeCompare(`${b.groupLabel}${b.price}`, 'zh-CN');
      return a.price - b.price;
    });
  }, [data.products, query, shopFilter, stockFilter, typeFilter, groupFilter, sortKey]);

  const stats = useMemo(() => {
    const inStock = data.products.filter((product) => product.inStock).length;
    const prices = data.products.map((product) => product.price).filter(Number.isFinite);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    return { inStock, minPrice };
  }, [data.products]);

  const groupSummaries = useMemo(() => {
    return data.groups.map((group) => {
      const products = data.products.filter((product) => product.groupId === group.id);
      const inStockProducts = products.filter((product) => product.inStock);
      const cheapest = [...inStockProducts].sort((a, b) => a.price - b.price)[0];
      return { ...group, count: products.length, inStock: inStockProducts.length, cheapest };
    });
  }, [data.groups, data.products]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Store size={22} /></div>
          <div>
            <h1>{data.settings.siteTitle || '链动小铺比价台'}</h1>
            <p>商品价格汇总与分类管理</p>
          </div>
        </div>

        {isAdminRoute ? (
          <nav className="view-nav">
            <a href="/">
              <Box size={17} />
              比价
            </a>
            <a className="active" href="/admin">
              <Store size={17} />
              管理
            </a>
          </nav>
        ) : null}

        <section className="refresh-box compact">
          <div className="section-title">刷新状态</div>
          <div className="status-line">
            <Clock3 size={16} />
            <span>{data.settings.autoRefreshEnabled ? `${data.settings.refreshIntervalMinutes || 15} 分钟刷新` : '自动刷新关闭'}</span>
          </div>
          <button className="secondary-button" onClick={refreshAll} disabled={loading}>
            <RefreshCcw size={16} />
            立即刷新全部
          </button>
          <p>{data.settings.lastAutoRefreshAt ? `上次：${formatDate(data.settings.lastAutoRefreshAt)}` : '尚未自动刷新'}</p>
        </section>

        <div className="side-note">
          <span>{data.shops.length} 个店铺</span>
          <span>{data.products.filter((product) => product.inStock).length} 个有库存商品</span>
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
              loading={loading}
              filteredProducts={filteredProducts}
              changeProductGroup={changeProductGroup}
              deleteProduct={deleteProduct}
              query={query}
              setQuery={setQuery}
              shopFilter={shopFilter}
              setShopFilter={setShopFilter}
              groupFilter={groupFilter}
              setGroupFilter={setGroupFilter}
            />
          ) : (
            <AdminLogin
              adminPassword={adminPassword}
              setAdminPassword={setAdminPassword}
              loginAdmin={loginAdmin}
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
          />
        )}
      </main>
    </div>
  );
}

function DashboardView({
  data,
  stats,
  groupSummaries,
  groupFilter,
  setGroupFilter,
  query,
  setQuery,
  shopFilter,
  setShopFilter,
  typeFilter,
  setTypeFilter,
  stockFilter,
  setStockFilter,
  sortKey,
  setSortKey,
  filteredProducts
}) {
  return (
    <>
      <div className="summary-grid">
        <Metric icon={<Store size={20} />} label="店铺" value={data.shops.length} />
        <Metric icon={<Box size={20} />} label="商品" value={data.products.length} />
        <Metric icon={<CheckCircle2 size={20} />} label="有库存" value={stats.inStock} />
        <Metric icon={<ArrowUpDown size={20} />} label="最低价" value={`￥${formatPrice(stats.minPrice)}`} />
      </div>

      <GroupCards groups={groupSummaries} activeGroup={groupFilter} onChange={setGroupFilter} />
      <ProductToolbar
        data={data}
        query={query}
        setQuery={setQuery}
        shopFilter={shopFilter}
        setShopFilter={setShopFilter}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        stockFilter={stockFilter}
        setStockFilter={setStockFilter}
        groupFilter={groupFilter}
        setGroupFilter={setGroupFilter}
        sortKey={sortKey}
        setSortKey={setSortKey}
      />
      <ProductTable data={data} filteredProducts={filteredProducts} readOnly />
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
  loading,
  filteredProducts,
  changeProductGroup,
  deleteProduct,
  query,
  setQuery,
  shopFilter,
  setShopFilter,
  groupFilter,
  setGroupFilter
}) {
  const [newPassword, setNewPassword] = useState('');

  return (
    <>
      <section className="management-grid">
        <div className="management-panel">
          <div className="panel-header compact-header">
            <h2>店铺管理</h2>
            <span>{data.shops.length} 个店铺</span>
          </div>
          <form className="add-form management-form" onSubmit={addShop}>
            <label htmlFor="shopUrl">店铺链接</label>
            <div className="input-row">
              <LinkIcon size={17} />
              <input
                id="shopUrl"
                value={shopUrl}
                onChange={(event) => setShopUrl(event.target.value)}
                placeholder="https://pay.ldxp.cn/shop/..."
              />
            </div>
            <button className="primary-button" disabled={loading}>
              <Plus size={17} />
              添加并同步
            </button>
          </form>
        </div>

        <div className="management-panel">
          <div className="panel-header compact-header">
            <h2>定时刷新</h2>
            <span>{data.settings.lastAutoRefreshAt ? formatDate(data.settings.lastAutoRefreshAt) : '未刷新'}</span>
          </div>
          <div className="settings-form">
            <label htmlFor="siteTitle">左上角标题</label>
            <div className="input-row">
              <input
                id="siteTitle"
                value={data.settings.siteTitle || ''}
                onChange={(event) => updateSettings({ siteTitle: event.target.value })}
                placeholder="链动小铺比价台"
              />
            </div>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={Boolean(data.settings.autoRefreshEnabled)}
                onChange={(event) => updateSettings({ autoRefreshEnabled: event.target.checked })}
              />
              <span>自动刷新</span>
            </label>
            <label className="number-row">
              <Clock3 size={16} />
              <input
                type="number"
                min="1"
                max="1440"
                value={data.settings.refreshIntervalMinutes || 15}
                onChange={(event) => updateSettings({ refreshIntervalMinutes: event.target.value })}
              />
              <span>分钟</span>
            </label>
          </div>
        </div>

        <div className="management-panel">
          <div className="panel-header compact-header">
            <h2>管理密码</h2>
            <span>本地配置</span>
          </div>
          <div className="settings-form">
            <label htmlFor="newAdminPassword">新密码</label>
            <div className="input-row">
              <input
                id="newAdminPassword"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="输入新的管理密码"
              />
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                updateAdminPassword(newPassword);
                setNewPassword('');
              }}
            >
              保存新密码
            </button>
          </div>
        </div>
      </section>

      <section className="product-panel">
        <div className="panel-header">
          <h2>已管理店铺</h2>
          <span>刷新与移除</span>
        </div>
        <div className="managed-shops">
          {data.shops.length === 0 ? (
            <div className="empty">还没有店铺</div>
          ) : data.shops.map((shop) => (
            <div className="shop-card managed" key={shop.token}>
              <div className="shop-main">
                <img src={shop.avatar || placeholderImage(shop.name)} alt="" />
                <div>
                  <a href={shop.link} target="_blank" rel="noreferrer">{shop.name}</a>
                  <span>{shop.products.length} 个商品 · {shop.categories?.length || 0} 个原始分类 · {formatDate(shop.fetchedAt)}</span>
                </div>
              </div>
              <div className="shop-actions">
                <button title="刷新" onClick={() => refreshShop(shop.token)} disabled={loading}>
                  <RefreshCcw size={15} />
                </button>
                <button title="移除" onClick={() => removeShop(shop.token)} disabled={loading}>
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
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索需要手动分类的商品"
          />
        </div>
        <SelectControl icon={<FolderKanban size={16} />} value={groupFilter} onChange={setGroupFilter}>
          <option value="all">全部分组</option>
          {data.groups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
        </SelectControl>
        <SelectControl icon={<Store size={16} />} value={shopFilter} onChange={setShopFilter}>
          <option value="all">全部店铺</option>
          {data.shops.map((shop) => <option key={shop.token} value={shop.token}>{shop.name}</option>)}
        </SelectControl>
      </section>

      <ProductTable
        data={data}
        filteredProducts={filteredProducts}
        changeProductGroup={changeProductGroup}
        deleteProduct={deleteProduct}
      />
    </>
  );
}

function AdminLogin({ adminPassword, setAdminPassword, loginAdmin }) {
  return (
    <section className="admin-login">
      <form className="management-panel login-panel" onSubmit={loginAdmin}>
        <div className="panel-header compact-header">
          <h2>管理后台</h2>
          <span>/admin</span>
        </div>
        <div className="settings-form">
          <label htmlFor="adminPassword">管理密码</label>
          <div className="input-row">
            <input
              id="adminPassword"
              type="password"
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
              placeholder="请输入管理密码"
            />
          </div>
          <button className="primary-button">进入后台</button>
        </div>
      </form>
    </section>
  );
}

function GroupCards({ groups, activeGroup, onChange }) {
  return (
    <section className="group-grid">
      {groups.map((group) => (
        <button
          key={group.id}
          className={activeGroup === group.id ? 'group-card active' : 'group-card'}
          onClick={() => onChange(activeGroup === group.id ? 'all' : group.id)}
        >
          <div>
            <strong>{group.label}</strong>
            <span>{group.count} 个商品 · {group.inStock} 有库存</span>
          </div>
          <em>{group.cheapest ? `￥${formatPrice(group.cheapest.price)}` : '-'}</em>
        </button>
      ))}
    </section>
  );
}

function ProductToolbar({
  data,
  query,
  setQuery,
  shopFilter,
  setShopFilter,
  typeFilter,
  setTypeFilter,
  stockFilter,
  setStockFilter,
  groupFilter,
  setGroupFilter,
  sortKey,
  setSortKey
}) {
  return (
    <section className="toolbar">
      <div className="search-box">
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索商品、分类、关键词或店铺"
        />
      </div>
      <SelectControl icon={<FolderKanban size={16} />} value={groupFilter} onChange={setGroupFilter}>
        <option value="all">全部分组</option>
        {data.groups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
      </SelectControl>
      <SelectControl icon={<Store size={16} />} value={shopFilter} onChange={setShopFilter}>
        <option value="all">全部店铺</option>
        {data.shops.map((shop) => <option key={shop.token} value={shop.token}>{shop.name}</option>)}
      </SelectControl>
      <SelectControl icon={<Filter size={16} />} value={typeFilter} onChange={setTypeFilter}>
        <option value="all">全部类型</option>
        {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </SelectControl>
      <SelectControl icon={<CheckCircle2 size={16} />} value={stockFilter} onChange={setStockFilter}>
        <option value="all">全部库存</option>
        <option value="in">仅有库存</option>
        <option value="out">仅缺货</option>
      </SelectControl>
      <SelectControl icon={<ArrowUpDown size={16} />} value={sortKey} onChange={setSortKey}>
        <option value="priceAsc">价格从低到高</option>
        <option value="priceDesc">价格从高到低</option>
        <option value="stockDesc">库存从高到低</option>
        <option value="updatedDesc">最近刷新</option>
        <option value="group">按分组</option>
      </SelectControl>
    </section>
  );
}

function ProductTable({ data, filteredProducts, changeProductGroup, deleteProduct, readOnly = false }) {
  return (
    <section className="product-panel">
      <div className="panel-header">
        <h2>商品比价</h2>
        <span>{filteredProducts.length} 条结果</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>商品</th>
              <th>分组</th>
              <th>店铺</th>
              <th>原始分类</th>
              <th>价格</th>
              <th>库存</th>
              <th>刷新时间</th>
              <th>链接</th>
              {!readOnly ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={readOnly ? 8 : 9} className="table-empty">暂无匹配商品</td>
              </tr>
            ) : filteredProducts.map((product) => (
              <tr key={`${product.shopToken}-${product.key}`}>
                <td>
                  <div className="product-cell">
                    <img src={product.image || placeholderImage(product.name)} alt="" />
                    <div>
                      <a href={product.link} target="_blank" rel="noreferrer">{product.name}</a>
                      <span>{TYPE_LABELS[product.type] || product.type}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="group-cell">
                    {readOnly ? (
                      <b>{product.groupLabel}</b>
                    ) : (
                      <select
                        value={product.groupId}
                        onChange={(event) => changeProductGroup(product, event.target.value)}
                        aria-label="修改商品分组"
                      >
                        {data.groups.map((group) => (
                          <option key={group.id} value={group.id}>{group.label}</option>
                        ))}
                      </select>
                    )}
                    <span>{product.groupOverride ? '手动分类' : ((product.matchedKeywords || []).join(' / ') || '-')}</span>
                  </div>
                </td>
                <td>
                  <a className="plain-link" href={product.shopLink} target="_blank" rel="noreferrer">
                    {product.shopName}
                  </a>
                </td>
                <td>{product.category || '-'}</td>
                <td className="price">￥{formatPrice(product.price)}</td>
                <td>
                  <span className={product.inStock ? 'stock in' : 'stock out'}>
                    {product.inStock ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    {product.stock === null ? '未知' : product.stock}
                  </span>
                </td>
                <td>{formatDate(product.fetchedAt)}</td>
                <td>
                  <a className="icon-link" href={product.link} target="_blank" rel="noreferrer" title="打开商品">
                    <ExternalLink size={16} />
                  </a>
                </td>
                {!readOnly ? (
                  <td>
                    <button className="danger-icon-button" onClick={() => deleteProduct(product)} title="删除商品">
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

async function readJson(response) {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  let payload = {};

  if (contentType.includes('application/json')) {
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error('服务器返回了无效 JSON');
    }
  } else if (text.trim().startsWith('<')) {
    throw new Error(`接口返回了 HTML 页面，可能是部署代理没有把 /api 转发到后端。状态码：${response.status}`);
  } else if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(payload.message || '请求失败');
  }
  return payload;
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2,
    maximumFractionDigits: 2
  });
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function placeholderImage(text) {
  const initial = encodeURIComponent((text || '店').slice(0, 1));
  return `https://dummyimage.com/96x96/e9eef5/304256.png&text=${initial}`;
}

createRoot(document.getElementById('root')).render(<App />);
