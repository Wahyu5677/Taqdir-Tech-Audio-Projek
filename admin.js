import { supabase } from './supabaseClient.js';
import { getUser, onAuthStateChange, signInWithEmail, signOut } from './store.js';

function currency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseDateInput(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

function isOrderPaid(status) {
  const s = String(status || '').toLowerCase();
  return s === 'paid' || s === 'shipped' || s === 'completed';
}

function computeOrderStats(orders, range) {
  const counts = Object.create(null);
  let paidRevenue = 0;
  let allRevenue = 0;
  let totalOrders = 0;

  for (const o of Array.isArray(orders) ? orders : []) {
    if (!o) continue;
    const created = o.created_at ? new Date(o.created_at) : null;
    if (range?.from && created && created < range.from) continue;
    if (range?.to && created && created > range.to) continue;

    totalOrders += 1;
    const st = String(o.status || 'pending');
    counts[st] = (counts[st] || 0) + 1;

    const total = Number(o.total_amount ?? o.subtotal_amount ?? 0);
    allRevenue += Number.isFinite(total) ? total : 0;
    if (isOrderPaid(st)) paidRevenue += Number.isFinite(total) ? total : 0;
  }

  return { counts, paidRevenue, allRevenue, totalOrders };
}

function computeStockStats(products, threshold) {
  const t = Number.isFinite(Number(threshold)) ? Number(threshold) : 5;
  const trackable = (Array.isArray(products) ? products : []).filter((p) => p && p.track_stock !== false);
  const outOfStock = trackable.filter((p) => Number(p.stock_qty || 0) <= 0);
  const lowStock = trackable
    .filter((p) => {
      const q = Number(p.stock_qty || 0);
      return q > 0 && q <= t;
    })
    .sort((a, b) => Number(a.stock_qty || 0) - Number(b.stock_qty || 0));
  const totalTrackable = trackable.length;
  return { threshold: t, totalTrackable, outOfStock, lowStock };
}

async function getMyRole(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.role ?? null;
}

async function loadProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id, slug, title, subtitle, badge, price, stock_qty, track_stock, is_active')
    .order('title', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function upsertProduct(payload) {
  const { data, error } = await supabase
    .from('products')
    .upsert(payload)
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

async function loadProductImages(productId) {
  const { data, error } = await supabase
    .from('product_images')
    .select('id, product_id, image_url, sort_order, created_at')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function addProductImage(productId, url, sortOrder = 0) {
  const { error } = await supabase
    .from('product_images')
    .insert({ product_id: productId, image_url: url, sort_order: sortOrder });
  if (error) throw error;
}

async function updateProductImage(imageId, patch) {
  const { error } = await supabase
    .from('product_images')
    .update(patch)
    .eq('id', imageId);
  if (error) throw error;
}

async function deleteProductImage(imageId) {
  const { error } = await supabase
    .from('product_images')
    .delete()
    .eq('id', imageId);
  if (error) throw error;
}

async function loadShippingRates() {
  const { data, error } = await supabase
    .from('shipping_rates')
    .select('id, province, city, cost, is_active, updated_at')
    .order('province', { ascending: true })
    .order('city', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function upsertShippingRate(payload) {
  const { error } = await supabase
    .from('shipping_rates')
    .upsert(payload);
  if (error) throw error;
}

async function deleteShippingRate(id) {
  const { error } = await supabase
    .from('shipping_rates')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

async function loadSettings() {
  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value, updated_at')
    .order('key', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function upsertSetting(key, value) {
  const { error } = await supabase
    .from('site_settings')
    .upsert({ key, value });
  if (error) throw error;
}

async function deleteSetting(key) {
  const { error } = await supabase
    .from('site_settings')
    .delete()
    .eq('key', key);
  if (error) throw error;
}

async function loadOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, status, subtotal_amount, shipping_cost, total_amount, shipping_province, shipping_city, shipping_address, created_at, user_id')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function updateProductActive(productId, isActive) {
  const { error } = await supabase
    .from('products')
    .update({ is_active: isActive })
    .eq('id', productId);
  if (error) throw error;
}

async function updateOrderStatus(orderId, status) {
  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId);
  if (error) throw error;
}

function setModalOpen(modal, open) {
  if (!modal) return;
  modal.classList.toggle('show', open);
  modal.setAttribute('aria-hidden', open ? 'false' : 'true');
}

async function init() {
  const loginButton = document.getElementById('loginButton');
  const logoutButton = document.getElementById('logoutButton');
  const authModal = document.getElementById('authModal');
  const authForm = document.getElementById('authForm');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');
  const authHint = document.getElementById('authHint');
  const adminHint = document.getElementById('adminHint');
  const adminDashboard = document.getElementById('adminDashboard');
  const productsTable = document.getElementById('productsTable');
  const productEditor = document.getElementById('productEditor');
  const imagesPanel = document.getElementById('imagesPanel');
  const ordersTable = document.getElementById('ordersTable');
  const shippingPanel = document.getElementById('shippingPanel');
  const settingsPanel = document.getElementById('settingsPanel');

  let user = await getUser();

  let cachedProducts = [];
  let selectedProductId = '';

  const renderImagesList = async () => {
    const list = document.getElementById('imagesList');
    const hint = document.getElementById('imagesHint');
    const sel = document.getElementById('adminImageProduct');
    if (!list || !sel) return;
    const pid = String(sel.value || '').trim();
    if (!pid) return;
    selectedProductId = pid;
    list.innerHTML = `<div class="modal__hint">Memuat gambar...</div>`;
    try {
      const rows = await loadProductImages(pid);
      if (!rows.length) {
        list.innerHTML = `<div class="modal__hint">Belum ada gambar untuk produk ini.</div>`;
        if (hint) hint.textContent = '';
        return;
      }
      list.innerHTML = `
        <div style="overflow:auto; border:1px solid rgba(255,255,255,0.1); border-radius:16px;">
          <table style="width:100%; border-collapse:collapse; min-width:920px;">
            <thead>
              <tr>
                <th style="text-align:left; padding:12px;">Preview</th>
                <th style="text-align:left; padding:12px;">URL</th>
                <th style="text-align:left; padding:12px;">Sort</th>
                <th style="text-align:left; padding:12px;">Save</th>
                <th style="text-align:left; padding:12px;">Delete</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((r) => {
                const url = String(r.image_url || '');
                return `
                  <tr>
                    <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">
                      <div style="width:84px; height:60px; border-radius:12px; border:1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.25); background-size:cover; background-position:center; background-image:url('${escapeHtml(url)}');"></div>
                    </td>
                    <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">
                      <input class="catalog-controls__input" type="text" value="${escapeHtml(url)}" data-img-url="${r.id}" />
                    </td>
                    <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">
                      <input class="catalog-controls__input" style="max-width:120px;" type="number" inputmode="numeric" value="${escapeHtml(r.sort_order)}" data-img-sort="${r.id}" />
                    </td>
                    <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">
                      <button class="modal__secondary" type="button" data-img-save="${r.id}">Save</button>
                    </td>
                    <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">
                      <button class="site-header__link site-header__button" type="button" data-img-delete="${r.id}">Hapus</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
      if (hint) hint.textContent = '';
    } catch (err) {
      if (hint) hint.textContent = err && err.message ? err.message : 'Gagal memuat gambar.';
      list.innerHTML = '';
    }
  };

  const refresh = async () => {
    if (!adminHint) return;

    if (!user) {
      adminHint.textContent = 'Silakan login untuk akses admin.';
      if (loginButton) loginButton.style.display = '';
      if (logoutButton) logoutButton.style.display = 'none';
      if (adminDashboard) adminDashboard.innerHTML = '';
      if (productsTable) productsTable.innerHTML = '';
      if (productEditor) productEditor.innerHTML = '';
      if (imagesPanel) imagesPanel.innerHTML = '';
      if (ordersTable) ordersTable.innerHTML = '';
      if (shippingPanel) shippingPanel.innerHTML = '';
      if (settingsPanel) settingsPanel.innerHTML = '';
      return;
    }

    if (loginButton) loginButton.style.display = 'none';
    if (logoutButton) logoutButton.style.display = '';

    const role = await getMyRole(user.id);
    if (role !== 'admin') {
      adminHint.textContent = 'Akun kamu bukan admin. (Admin diset manual di table profiles)';
      if (adminDashboard) adminDashboard.innerHTML = '';
      if (productsTable) productsTable.innerHTML = '';
      if (productEditor) productEditor.innerHTML = '';
      if (imagesPanel) imagesPanel.innerHTML = '';
      if (ordersTable) ordersTable.innerHTML = '';
      if (shippingPanel) shippingPanel.innerHTML = '';
      if (settingsPanel) settingsPanel.innerHTML = '';
      return;
    }

    adminHint.textContent = '';

    const products = await loadProducts();
    cachedProducts = products;
    if (!selectedProductId && products[0] && products[0].id) {
      selectedProductId = String(products[0].id);
    }

    const ordersAll = await loadOrders();
    if (adminDashboard) {
      const fromEl = document.getElementById('dashFrom');
      const toEl = document.getElementById('dashTo');
      const thrEl = document.getElementById('dashLowThreshold');

      const range = {
        from: parseDateInput(fromEl && fromEl instanceof HTMLInputElement ? fromEl.value : ''),
        to: parseDateInput(toEl && toEl instanceof HTMLInputElement ? toEl.value : ''),
      };
      if (range.to) {
        range.to.setHours(23, 59, 59, 999);
      }
      const threshold = thrEl && thrEl instanceof HTMLInputElement ? Number(thrEl.value) : 5;

      const orderStats = computeOrderStats(ordersAll, range);
      const stockStats = computeStockStats(products, threshold);

      const statusOrder = ['pending', 'processing', 'paid', 'shipped', 'completed', 'cancelled'];
      const statusPills = statusOrder
        .filter((s) => (orderStats.counts[s] || 0) > 0)
        .map((s) => {
          return `<div style="padding:10px 12px; border-radius:16px; border:1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04);">
            <div style="font-weight:700;">${escapeHtml(s)}</div>
            <div class="modal__hint" style="margin-top:4px;">${escapeHtml(orderStats.counts[s] || 0)} order</div>
          </div>`;
        })
        .join('');

      const renderStockRow = (p) => {
        const q = Number(p.stock_qty || 0);
        const warn = q <= 0 ? 'rgba(255,80,80,0.16)' : 'rgba(255,200,80,0.14)';
        return `
          <tr style="background:${warn};">
            <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">${escapeHtml(p.title ?? '')}</td>
            <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">${escapeHtml(p.slug ?? '')}</td>
            <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08); font-weight:700;">${escapeHtml(q)}</td>
            <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">
              <button class="modal__secondary" type="button" data-edit-product="${p.id}">Edit</button>
            </td>
          </tr>
        `;
      };

      adminDashboard.innerHTML = `
        <div style="padding:14px; border-radius:18px; border:1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04);">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <strong>Ringkasan</strong>
            <div class="modal__hint">Penghasilan dihitung dari status: paid/shipped/completed</div>
          </div>

          <div style="display:grid; gap:12px; margin-top:12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
            <div style="padding:12px; border-radius:16px; border:1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.22);">
              <div class="modal__hint">Revenue (Paid)</div>
              <div style="font-size:20px; font-weight:800; margin-top:6px;">${currency(orderStats.paidRevenue)}</div>
            </div>
            <div style="padding:12px; border-radius:16px; border:1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.22);">
              <div class="modal__hint">Revenue (All)</div>
              <div style="font-size:20px; font-weight:800; margin-top:6px;">${currency(orderStats.allRevenue)}</div>
            </div>
            <div style="padding:12px; border-radius:16px; border:1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.22);">
              <div class="modal__hint">Total Orders</div>
              <div style="font-size:20px; font-weight:800; margin-top:6px;">${escapeHtml(orderStats.totalOrders)}</div>
            </div>
            <div style="padding:12px; border-radius:16px; border:1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.22);">
              <div class="modal__hint">Out of Stock</div>
              <div style="font-size:20px; font-weight:800; margin-top:6px;">${escapeHtml(stockStats.outOfStock.length)}</div>
            </div>
          </div>

          <div style="display:grid; gap:12px; margin-top:12px; grid-template-columns: 1fr 1fr 140px auto; align-items:end;">
            <div class="catalog-controls__field">
              <label class="catalog-controls__label" for="dashFrom">Dari tanggal</label>
              <input class="catalog-controls__input" id="dashFrom" type="date" />
            </div>
            <div class="catalog-controls__field">
              <label class="catalog-controls__label" for="dashTo">Sampai</label>
              <input class="catalog-controls__input" id="dashTo" type="date" />
            </div>
            <div class="catalog-controls__field">
              <label class="catalog-controls__label" for="dashLowThreshold">Low stock</label>
              <input class="catalog-controls__input" id="dashLowThreshold" type="number" inputmode="numeric" value="${escapeHtml(stockStats.threshold)}" />
            </div>
            <button class="modal__secondary" type="button" id="dashApply">Apply</button>
          </div>

          <div style="margin-top:12px;">
            <strong>Order Status</strong>
            <div style="display:grid; gap:10px; margin-top:10px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));">
              ${statusPills || '<div class="modal__hint">Belum ada order di rentang tanggal ini.</div>'}
            </div>
          </div>

          <div style="margin-top:16px;">
            <strong>Pantau Stock</strong>
            <div class="modal__hint" style="margin-top:6px;">Produk dengan stock 0 atau dibawah threshold.</div>
            <div style="overflow:auto; margin-top:10px; border:1px solid rgba(255,255,255,0.1); border-radius:16px;">
              <table style="width:100%; border-collapse:collapse; min-width:860px;">
                <thead>
                  <tr>
                    <th style="text-align:left; padding:12px;">Title</th>
                    <th style="text-align:left; padding:12px;">Slug</th>
                    <th style="text-align:left; padding:12px;">Stock</th>
                    <th style="text-align:left; padding:12px;">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  ${(stockStats.outOfStock.concat(stockStats.lowStock)).slice(0, 30).map(renderStockRow).join('') || `
                    <tr>
                      <td colspan="4" style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);" class="modal__hint">Aman. Tidak ada produk out of stock / low stock.</td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    if (productsTable) {
      productsTable.innerHTML = `
        <div class="modal__hint">Total produk: ${products.length}</div>
        <div style="overflow:auto; border:1px solid rgba(255,255,255,0.1); border-radius:16px;">
          <table style="width:100%; border-collapse:collapse; min-width:980px;">
            <thead>
              <tr>
                <th style="text-align:left; padding:12px;">Title</th>
                <th style="text-align:left; padding:12px;">Slug</th>
                <th style="text-align:left; padding:12px;">Stock</th>
                <th style="text-align:left; padding:12px;">Price</th>
                <th style="text-align:left; padding:12px;">Active</th>
                <th style="text-align:left; padding:12px;">Edit</th>
              </tr>
            </thead>
            <tbody>
              ${products.map((p) => {
                const track = p.track_stock !== false;
                const stock = track ? Number(p.stock_qty || 0) : '∞';
                return `
                  <tr>
                    <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">${escapeHtml(p.title ?? '')}</td>
                    <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">${escapeHtml(p.slug ?? '')}</td>
                    <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">${escapeHtml(stock)}</td>
                    <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">${currency(p.price)}</td>
                    <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">
                      <label style="display:inline-flex; align-items:center; gap:8px;">
                        <input type="checkbox" data-product-active="${p.id}" ${p.is_active === false ? '' : 'checked'} />
                        <span>${p.is_active === false ? 'Off' : 'On'}</span>
                      </label>
                    </td>
                    <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">
                      <button class="site-header__link site-header__button" type="button" data-edit-product="${p.id}">Edit</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    if (productEditor) {
      const current = selectedProductId ? products.find((p) => String(p.id) === String(selectedProductId)) : null;
      const title = current ? String(current.title || '') : '';
      const slug = current ? String(current.slug || '') : '';
      const subtitle = current ? String(current.subtitle || '') : '';
      const badge = current ? String(current.badge || '') : '';
      const price = current ? String(current.price ?? '') : '';
      const track = current ? (current.track_stock !== false) : true;
      const stockQty = current ? String(current.stock_qty ?? 0) : '0';

      productEditor.innerHTML = `
        <div style="margin-top:14px; padding:14px; border-radius:18px; border:1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04);">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <strong>Editor Produk</strong>
              <select class="catalog-controls__select" id="adminProductSelect" style="min-width:260px;">
                ${products.map((p) => `<option value="${p.id}" ${String(p.id) === String(selectedProductId) ? 'selected' : ''}>${escapeHtml(p.title || p.slug || p.id)}</option>`).join('')}
              </select>
              <button class="site-header__link site-header__button" type="button" id="adminNewProduct">+ Produk Baru</button>
            </div>
            <div class="modal__hint" id="productSaveHint"></div>
          </div>

          <div style="display:grid; gap:12px; margin-top:12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
            <div class="catalog-controls__field">
              <label class="catalog-controls__label" for="adminTitle">Title</label>
              <input class="catalog-controls__input" id="adminTitle" type="text" value="${escapeHtml(title)}" />
            </div>
            <div class="catalog-controls__field">
              <label class="catalog-controls__label" for="adminSlug">Slug</label>
              <input class="catalog-controls__input" id="adminSlug" type="text" value="${escapeHtml(slug)}" placeholder="contoh: arc-eclipse" />
            </div>
            <div class="catalog-controls__field">
              <label class="catalog-controls__label" for="adminPrice">Price</label>
              <input class="catalog-controls__input" id="adminPrice" type="number" inputmode="numeric" value="${escapeHtml(price)}" />
            </div>
            <div class="catalog-controls__field">
              <label class="catalog-controls__label" for="adminBadge">Badge</label>
              <input class="catalog-controls__input" id="adminBadge" type="text" value="${escapeHtml(badge)}" placeholder="Promo 20% / ANC / Best Seller" />
            </div>
            <div class="catalog-controls__field" style="grid-column: 1 / -1;">
              <label class="catalog-controls__label" for="adminSubtitle">Subtitle</label>
              <input class="catalog-controls__input" id="adminSubtitle" type="text" value="${escapeHtml(subtitle)}" />
            </div>
          </div>

          <div style="display:grid; gap:12px; margin-top:12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
            <div class="catalog-controls__field">
              <label class="catalog-controls__label" for="adminTrackStock">Track Stock</label>
              <select class="catalog-controls__select" id="adminTrackStock">
                <option value="true" ${track ? 'selected' : ''}>Yes</option>
                <option value="false" ${!track ? 'selected' : ''}>No (Unlimited)</option>
              </select>
            </div>
            <div class="catalog-controls__field">
              <label class="catalog-controls__label" for="adminStockQty">Stock Qty</label>
              <input class="catalog-controls__input" id="adminStockQty" type="number" inputmode="numeric" value="${escapeHtml(stockQty)}" ${track ? '' : 'disabled'} />
            </div>
            <div class="catalog-controls__field" style="display:flex; align-items:flex-end; gap:10px;">
              <button class="modal__primary" type="button" id="adminSaveProduct">Simpan Produk</button>
            </div>
          </div>
        </div>
      `;
    }

    if (imagesPanel) {
      imagesPanel.innerHTML = `
        <div style="padding:14px; border-radius:18px; border:1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04);">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <strong>Kelola Gambar</strong>
              <select class="catalog-controls__select" id="adminImageProduct" style="min-width:260px;">
                ${products.map((p) => `<option value="${p.id}" ${String(p.id) === String(selectedProductId) ? 'selected' : ''}>${escapeHtml(p.title || p.slug || p.id)}</option>`).join('')}
              </select>
              <button class="site-header__link site-header__button" type="button" id="adminLoadImages">Muat</button>
            </div>
            <div class="modal__hint" id="imagesHint"></div>
          </div>

          <div style="display:grid; gap:12px; margin-top:12px; grid-template-columns: 1fr 140px auto;">
            <input class="catalog-controls__input" id="adminNewImageUrl" type="url" placeholder="https://... atau path asset" />
            <input class="catalog-controls__input" id="adminNewImageSort" type="number" inputmode="numeric" value="0" />
            <button class="modal__secondary" type="button" id="adminAddImage">Tambah</button>
          </div>
          <div id="imagesList" style="margin-top:12px;"></div>
        </div>
      `;
    }

    const orders = ordersAll;
    if (ordersTable) {
      ordersTable.innerHTML = `
        <div class="modal__hint">Total order: ${orders.length}</div>
        <div style="overflow:auto; border:1px solid rgba(255,255,255,0.1); border-radius:16px;">
          <table style="width:100%; border-collapse:collapse; min-width:980px;">
            <thead>
              <tr>
                <th style="text-align:left; padding:12px;">Order</th>
                <th style="text-align:left; padding:12px;">Status</th>
                <th style="text-align:left; padding:12px;">Total</th>
                <th style="text-align:left; padding:12px;">Shipping</th>
                <th style="text-align:left; padding:12px;">Created</th>
              </tr>
            </thead>
            <tbody>
              ${orders.map((o) => {
                const code = o.order_number || o.id;
                const total = o.total_amount ?? o.subtotal_amount ?? 0;
                const ship = [o.shipping_province, o.shipping_city].filter(Boolean).join(' / ');
                return `
                  <tr>
                    <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">${escapeHtml(code)}</td>
                    <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">
                      <select data-order-status="${o.id}" class="catalog-controls__select" style="min-width:180px;">
                        ${['pending','processing','paid','shipped','completed','cancelled'].map((s) => `<option value="${s}" ${String(o.status || '') === s ? 'selected' : ''}>${s}</option>`).join('')}
                      </select>
                    </td>
                    <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">${currency(total)}</td>
                    <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">${escapeHtml(ship || '-')}</td>
                    <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">${o.created_at ? escapeHtml(new Date(o.created_at).toLocaleString('id-ID')) : ''}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    if (shippingPanel) {
      const rates = await loadShippingRates();
      shippingPanel.innerHTML = `
        <div style="padding:14px; border-radius:18px; border:1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04);">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <strong>Tambah / Update Ongkir</strong>
            <div class="modal__hint" id="shippingHint"></div>
          </div>
          <div style="display:grid; gap:12px; margin-top:12px; grid-template-columns: 1fr 1fr 180px auto;">
            <input class="catalog-controls__input" id="shipProvinceAdmin" type="text" placeholder="Provinsi" />
            <input class="catalog-controls__input" id="shipCityAdmin" type="text" placeholder="Kota/Kab" />
            <input class="catalog-controls__input" id="shipCostAdmin" type="number" inputmode="numeric" placeholder="Cost" />
            <button class="modal__secondary" type="button" id="shipAddAdmin">Simpan</button>
          </div>
          <div style="overflow:auto; margin-top:12px; border:1px solid rgba(255,255,255,0.1); border-radius:16px;">
            <table style="width:100%; border-collapse:collapse; min-width:820px;">
              <thead>
                <tr>
                  <th style="text-align:left; padding:12px;">Provinsi</th>
                  <th style="text-align:left; padding:12px;">Kota</th>
                  <th style="text-align:left; padding:12px;">Cost</th>
                  <th style="text-align:left; padding:12px;">Active</th>
                  <th style="text-align:left; padding:12px;">Delete</th>
                </tr>
              </thead>
              <tbody>
                ${rates.map((r) => {
                  return `
                    <tr>
                      <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">${escapeHtml(r.province)}</td>
                      <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">${escapeHtml(r.city)}</td>
                      <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">
                        <input class="catalog-controls__input" style="max-width:180px;" type="number" inputmode="numeric" value="${escapeHtml(r.cost)}" data-ship-cost="${r.id}" />
                      </td>
                      <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">
                        <label style="display:inline-flex; align-items:center; gap:8px;">
                          <input type="checkbox" data-ship-active="${r.id}" ${r.is_active ? 'checked' : ''} />
                          <span>${r.is_active ? 'On' : 'Off'}</span>
                        </label>
                      </td>
                      <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">
                        <button class="site-header__link site-header__button" type="button" data-ship-delete="${r.id}">Hapus</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    if (settingsPanel) {
      const settings = await loadSettings();
      const map = new Map(settings.map((s) => [String(s.key), s]));
      const bannerText = map.get('home_banner_text')?.value ?? '';
      const bannerCta = map.get('home_banner_cta')?.value ?? '';
      settingsPanel.innerHTML = `
        <div style="padding:14px; border-radius:18px; border:1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04);">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <strong>Promo / Banner</strong>
            <div class="modal__hint" id="settingsHint"></div>
          </div>
          <div style="display:grid; gap:12px; margin-top:12px; grid-template-columns: 1fr 1fr auto;">
            <input class="catalog-controls__input" id="settingBannerText" type="text" value="${escapeHtml(bannerText)}" placeholder="Contoh: Promo Akhir Tahun -20%" />
            <input class="catalog-controls__input" id="settingBannerCta" type="text" value="${escapeHtml(bannerCta)}" placeholder="Contoh: Chat Admin" />
            <button class="modal__secondary" type="button" id="settingsSave">Simpan</button>
          </div>

          <div style="margin-top:14px; overflow:auto; border:1px solid rgba(255,255,255,0.1); border-radius:16px;">
            <table style="width:100%; border-collapse:collapse; min-width:720px;">
              <thead>
                <tr>
                  <th style="text-align:left; padding:12px;">Key</th>
                  <th style="text-align:left; padding:12px;">Value</th>
                  <th style="text-align:left; padding:12px;">Delete</th>
                </tr>
              </thead>
              <tbody>
                ${settings.map((s) => {
                  return `
                    <tr>
                      <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">${escapeHtml(s.key)}</td>
                      <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">
                        <input class="catalog-controls__input" type="text" value="${escapeHtml(s.value ?? '')}" data-setting-value="${escapeHtml(s.key)}" />
                      </td>
                      <td style="padding:12px; border-top:1px solid rgba(255,255,255,0.08);">
                        <button class="site-header__link site-header__button" type="button" data-setting-delete="${escapeHtml(s.key)}">Hapus</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div style="display:grid; gap:12px; margin-top:12px; grid-template-columns: 1fr 1fr auto;">
            <input class="catalog-controls__input" id="settingNewKey" type="text" placeholder="Key baru" />
            <input class="catalog-controls__input" id="settingNewValue" type="text" placeholder="Value" />
            <button class="modal__secondary" type="button" id="settingAdd">Tambah</button>
          </div>
        </div>
      `;
    }
  };

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    const close = t.getAttribute('data-close');
    if (close === 'auth') setModalOpen(authModal, false);

    const btn = t.closest('button[data-toggle-password]');
    if (btn) {
      const toggleTarget = btn.getAttribute('data-toggle-password');
      const input = document.getElementById(toggleTarget);
      if (input && input instanceof HTMLInputElement) {
        const nextType = input.type === 'password' ? 'text' : 'password';
        input.type = nextType;
        btn.setAttribute('aria-label', nextType === 'password' ? 'Tampilkan password' : 'Sembunyikan password');
      }
    }

    const editBtn = t.closest('[data-edit-product]');
    const edit = editBtn instanceof HTMLElement ? editBtn.getAttribute('data-edit-product') : null;
    if (edit) {
      selectedProductId = String(edit);
      refresh()
        .then(() => {
          const editor = document.getElementById('productEditor');
          if (editor) editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        })
        .catch(() => {});
      return;
    }

    if (t.id === 'dashApply') {
      refresh().catch(() => {});
      return;
    }

    if (t.id === 'adminNewProduct') {
      selectedProductId = '';
      refresh().catch(() => {});
      return;
    }

    if (t.id === 'adminSaveProduct') {
      const hint = document.getElementById('productSaveHint');
      const titleEl = document.getElementById('adminTitle');
      const slugEl = document.getElementById('adminSlug');
      const subtitleEl = document.getElementById('adminSubtitle');
      const badgeEl = document.getElementById('adminBadge');
      const priceEl = document.getElementById('adminPrice');
      const trackEl = document.getElementById('adminTrackStock');
      const stockEl = document.getElementById('adminStockQty');
      const activeCheckbox = selectedProductId ? document.querySelector(`[data-product-active="${selectedProductId}"]`) : null;

      const payload = {};
      if (selectedProductId) payload.id = selectedProductId;
      payload.title = titleEl && titleEl instanceof HTMLInputElement ? titleEl.value.trim() : '';
      payload.slug = slugEl && slugEl instanceof HTMLInputElement ? slugEl.value.trim() : '';
      payload.subtitle = subtitleEl && subtitleEl instanceof HTMLInputElement ? subtitleEl.value.trim() : '';
      payload.badge = badgeEl && badgeEl instanceof HTMLInputElement ? badgeEl.value.trim() : '';
      payload.price = priceEl && priceEl instanceof HTMLInputElement ? Number(priceEl.value) : 0;
      payload.track_stock = trackEl && trackEl instanceof HTMLSelectElement ? (String(trackEl.value) === 'true') : true;
      payload.stock_qty = stockEl && stockEl instanceof HTMLInputElement ? Number(stockEl.value) : 0;
      if (!payload.track_stock) payload.stock_qty = 0;
      if (activeCheckbox && activeCheckbox instanceof HTMLInputElement) {
        payload.is_active = activeCheckbox.checked;
      }

      if (!payload.title || !payload.slug) {
        if (hint) hint.textContent = 'Title dan Slug wajib diisi.';
        return;
      }

      (async () => {
        try {
          if (hint) hint.textContent = 'Menyimpan...';
          const res = await upsertProduct(payload);
          selectedProductId = String(res.id);
          if (hint) hint.textContent = 'Produk tersimpan.';
          await refresh();
        } catch (err) {
          if (hint) hint.textContent = err && err.message ? err.message : 'Gagal simpan produk.';
        }
      })();
      return;
    }

    if (t.id === 'adminLoadImages') {
      renderImagesList().catch(() => {});
      return;
    }

    if (t.id === 'adminAddImage') {
      const sel = document.getElementById('adminImageProduct');
      const urlEl = document.getElementById('adminNewImageUrl');
      const sortEl = document.getElementById('adminNewImageSort');
      const hint = document.getElementById('imagesHint');
      if (!sel || !urlEl) return;
      const pid = String(sel.value || '').trim();
      const url = String(urlEl.value || '').trim();
      const sort = sortEl ? Number(sortEl.value) : 0;
      if (!pid || !url) {
        if (hint) hint.textContent = 'Pilih produk dan isi URL gambar.';
        return;
      }
      (async () => {
        try {
          await addProductImage(pid, url, Number.isFinite(sort) ? sort : 0);
          if (urlEl) urlEl.value = '';
          if (hint) hint.textContent = 'Gambar ditambahkan.';
          await renderImagesList();
        } catch (err) {
          if (hint) hint.textContent = err && err.message ? err.message : 'Gagal tambah gambar.';
        }
      })();
      return;
    }

    const imgSave = t.getAttribute('data-img-save');
    if (imgSave) {
      const hint = document.getElementById('imagesHint');
      const urlEl = document.querySelector(`[data-img-url="${imgSave}"]`);
      const sortEl = document.querySelector(`[data-img-sort="${imgSave}"]`);
      const url = urlEl && urlEl instanceof HTMLInputElement ? String(urlEl.value || '').trim() : '';
      const sort = sortEl && sortEl instanceof HTMLInputElement ? Number(sortEl.value) : 0;
      (async () => {
        try {
          await updateProductImage(String(imgSave), { image_url: url, sort_order: Number.isFinite(sort) ? sort : 0 });
          if (hint) hint.textContent = 'Gambar disimpan.';
          await renderImagesList();
        } catch (err) {
          if (hint) hint.textContent = err && err.message ? err.message : 'Gagal simpan gambar.';
        }
      })();
      return;
    }

    const imgDel = t.getAttribute('data-img-delete');
    if (imgDel) {
      const hint = document.getElementById('imagesHint');
      (async () => {
        try {
          await deleteProductImage(String(imgDel));
          if (hint) hint.textContent = 'Gambar dihapus.';
          await renderImagesList();
        } catch (err) {
          if (hint) hint.textContent = err && err.message ? err.message : 'Gagal hapus gambar.';
        }
      })();
      return;
    }

    const shipDel = t.getAttribute('data-ship-delete');
    if (shipDel) {
      const hint = document.getElementById('shippingHint');
      (async () => {
        try {
          await deleteShippingRate(String(shipDel));
          if (hint) hint.textContent = 'Ongkir dihapus.';
          await refresh();
        } catch (err) {
          if (hint) hint.textContent = err && err.message ? err.message : 'Gagal hapus ongkir.';
        }
      })();
      return;
    }

    if (t.id === 'shipAddAdmin') {
      const hint = document.getElementById('shippingHint');
      const pEl = document.getElementById('shipProvinceAdmin');
      const cEl = document.getElementById('shipCityAdmin');
      const costEl = document.getElementById('shipCostAdmin');
      const province = pEl && pEl instanceof HTMLInputElement ? pEl.value.trim() : '';
      const city = cEl && cEl instanceof HTMLInputElement ? cEl.value.trim() : '';
      const cost = costEl && costEl instanceof HTMLInputElement ? Number(costEl.value) : 0;
      if (!province || !city || !Number.isFinite(cost)) {
        if (hint) hint.textContent = 'Lengkapi provinsi, kota, dan cost.';
        return;
      }
      (async () => {
        try {
          await upsertShippingRate({ province, city, cost: Math.max(0, Math.round(cost)), is_active: true });
          if (hint) hint.textContent = 'Ongkir disimpan.';
          if (pEl) pEl.value = '';
          if (cEl) cEl.value = '';
          if (costEl) costEl.value = '';
          await refresh();
        } catch (err) {
          if (hint) hint.textContent = err && err.message ? err.message : 'Gagal simpan ongkir.';
        }
      })();
      return;
    }

    if (t.id === 'settingsSave') {
      const hint = document.getElementById('settingsHint');
      const textEl = document.getElementById('settingBannerText');
      const ctaEl = document.getElementById('settingBannerCta');
      const text = textEl && textEl instanceof HTMLInputElement ? textEl.value : '';
      const cta = ctaEl && ctaEl instanceof HTMLInputElement ? ctaEl.value : '';
      (async () => {
        try {
          await upsertSetting('home_banner_text', String(text || '').trim());
          await upsertSetting('home_banner_cta', String(cta || '').trim());
          if (hint) hint.textContent = 'Settings tersimpan.';
          await refresh();
        } catch (err) {
          if (hint) hint.textContent = err && err.message ? err.message : 'Gagal simpan settings.';
        }
      })();
      return;
    }

    if (t.id === 'settingAdd') {
      const hint = document.getElementById('settingsHint');
      const keyEl = document.getElementById('settingNewKey');
      const valEl = document.getElementById('settingNewValue');
      const key = keyEl && keyEl instanceof HTMLInputElement ? keyEl.value.trim() : '';
      const val = valEl && valEl instanceof HTMLInputElement ? valEl.value : '';
      if (!key) {
        if (hint) hint.textContent = 'Key wajib diisi.';
        return;
      }
      (async () => {
        try {
          await upsertSetting(key, String(val || '').trim());
          if (keyEl) keyEl.value = '';
          if (valEl) valEl.value = '';
          if (hint) hint.textContent = 'Setting ditambahkan.';
          await refresh();
        } catch (err) {
          if (hint) hint.textContent = err && err.message ? err.message : 'Gagal tambah setting.';
        }
      })();
      return;
    }

    const settingDel = t.getAttribute('data-setting-delete');
    if (settingDel) {
      const hint = document.getElementById('settingsHint');
      (async () => {
        try {
          await deleteSetting(String(settingDel));
          if (hint) hint.textContent = 'Setting dihapus.';
          await refresh();
        } catch (err) {
          if (hint) hint.textContent = err && err.message ? err.message : 'Gagal hapus setting.';
        }
      })();
    }
  });

  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    const pid = t.getAttribute('data-product-active');
    if (pid && t instanceof HTMLInputElement) {
      try {
        await updateProductActive(pid, t.checked);
      } catch (err) {
        if (adminHint) adminHint.textContent = err && err.message ? err.message : 'Gagal update produk.';
      }
      return;
    }

    const oid = t.getAttribute('data-order-status');
    if (oid && t instanceof HTMLSelectElement) {
      try {
        await updateOrderStatus(oid, t.value);
      } catch (err) {
        if (adminHint) adminHint.textContent = err && err.message ? err.message : 'Gagal update order.';
      }
      return;
    }

    if (t.id === 'adminProductSelect' && t instanceof HTMLSelectElement) {
      selectedProductId = String(t.value || '');
      refresh().catch(() => {});
      return;
    }

    if (t.id === 'adminImageProduct' && t instanceof HTMLSelectElement) {
      selectedProductId = String(t.value || '');
      renderImagesList().catch(() => {});
      return;
    }

    const shipActive = t.getAttribute('data-ship-active');
    if (shipActive && t instanceof HTMLInputElement) {
      const hint = document.getElementById('shippingHint');
      try {
        await upsertShippingRate({ id: shipActive, is_active: t.checked });
        if (hint) hint.textContent = 'Status ongkir diupdate.';
      } catch (err) {
        if (hint) hint.textContent = err && err.message ? err.message : 'Gagal update ongkir.';
      }
      return;
    }

    const shipCost = t.getAttribute('data-ship-cost');
    if (shipCost && t instanceof HTMLInputElement) {
      const hint = document.getElementById('shippingHint');
      const cost = Number(t.value);
      if (!Number.isFinite(cost)) return;
      try {
        await upsertShippingRate({ id: shipCost, cost: Math.max(0, Math.round(cost)) });
        if (hint) hint.textContent = 'Cost ongkir diupdate.';
      } catch (err) {
        if (hint) hint.textContent = err && err.message ? err.message : 'Gagal update cost.';
      }
      return;
    }

    const settingKey = t.getAttribute('data-setting-value');
    if (settingKey && t instanceof HTMLInputElement) {
      const hint = document.getElementById('settingsHint');
      try {
        await upsertSetting(String(settingKey), String(t.value || '').trim());
        if (hint) hint.textContent = 'Setting diupdate.';
      } catch (err) {
        if (hint) hint.textContent = err && err.message ? err.message : 'Gagal update setting.';
      }
    }
  });

  if (loginButton) {
    loginButton.addEventListener('click', () => {
      setModalOpen(authModal, true);
      if (authEmail) authEmail.focus();
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      await signOut();
    });
  }

  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!authEmail || !authPassword) return;
      try {
        await signInWithEmail(authEmail.value.trim(), authPassword.value);
        setModalOpen(authModal, false);
      } catch (err) {
        if (authHint) authHint.textContent = err && err.message ? err.message : 'Gagal login.';
      }
    });
  }

  onAuthStateChange(async (u) => {
    user = u;
    await refresh();
  });

  await refresh();
}

init().catch((err) => {
  const hint = document.getElementById('adminHint');
  if (hint) hint.textContent = err && err.message ? err.message : 'Gagal memuat admin.';
});
