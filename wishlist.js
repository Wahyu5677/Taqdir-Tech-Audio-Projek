import { supabase } from './supabaseClient.js';

function ensureToastContainer() {
  let container = document.querySelector('.toast-container');
  if (container) return container;
  container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

function toast(type, title, desc, durationMs = 2800) {
  const container = ensureToastContainer();
  const el = document.createElement('div');
  const safeType = type === 'success' || type === 'error' ? type : 'info';
  const icon = safeType === 'success' ? '✓' : safeType === 'error' ? '!' : 'i';
  el.className = `toast toast--${safeType}`;
  el.innerHTML = `
        <div class="toast__icon" aria-hidden="true">${icon}</div>
        <div class="toast__body">
            <div class="toast__title">${String(title || '')}</div>
            ${desc ? `<div class="toast__desc">${String(desc)}</div>` : ''}
        </div>
        <button class="toast__close" type="button" aria-label="Tutup">×</button>
    `;
  container.appendChild(el);
  const close = () => {
    el.classList.add('toast--leaving');
    window.setTimeout(() => el.remove(), 170);
  };
  const closeBtn = el.querySelector('.toast__close');
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (durationMs > 0) window.setTimeout(close, durationMs);
}

async function syncAdminLink(user) {
  const link = document.getElementById('adminLink');
  if (!link) return;
  link.style.display = 'none';
  if (!user) return;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    const role = data && data.role ? String(data.role).trim().toLowerCase() : '';
    if (role === 'admin') link.style.display = '';
  } catch {
    link.style.display = 'none';
  }
}

function getWishlist() {
  try {
    const raw = localStorage.getItem('wishlist');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function setWishlist(list) {
  try {
    localStorage.setItem('wishlist', JSON.stringify(Array.isArray(list) ? list : []));
  } catch {
    // ignore
  }
}

function toggleWishlist(id) {
  const key = String(id || '');
  if (!key) return { active: false };
  const list = getWishlist();
  const idx = list.indexOf(key);
  let active = false;
  if (idx >= 0) {
    list.splice(idx, 1);
    active = false;
  } else {
    list.push(key);
    active = true;
  }
  setWishlist(list);
  return { active };
}

function formatPrice(value) {
  const n = Number(value);
  if (Number.isFinite(n)) {
    return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
  }
  return String(value || '');
}

function safeText(value) {
  const v = String(value ?? '').trim();
  return v ? v : '-';
}

async function loadWishlist() {
  const listEl = document.getElementById('wishlistList');
  if (!listEl) return;

  const ids = getWishlist();
  if (!ids.length) {
    listEl.innerHTML = `
      <div class="loading-container">
        <div class="loading-text">Wishlist kamu masih kosong.</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <div class="loading-text">Memuat wishlist...</div>
    </div>
  `;

  const { data, error } = await supabase
    .from('products')
    .select('id, slug, title, subtitle, badge, price, color, battery, weight, latency, is_active, product_images(image_url, sort_order)')
    .in('id', ids)
    .or('is_active.is.null,is_active.eq.true');

  if (error) {
    console.error('Gagal memuat wishlist:', error);
    listEl.innerHTML = `
      <div class="loading-container">
        <div class="loading-text">Gagal memuat wishlist.</div>
      </div>
    `;
    toast('error', 'Gagal memuat', error.message || 'Silakan coba lagi.');
    return;
  }

  const items = Array.isArray(data) ? data.slice() : [];
  const order = new Map(ids.map((id, idx) => [String(id), idx]));
  items.sort((a, b) => (order.get(String(a.id)) ?? 9999) - (order.get(String(b.id)) ?? 9999));

  listEl.textContent = '';
  items.forEach((item) => {
    const card = document.createElement('div');
    const productUrl = `detail.html?id=${encodeURIComponent(item.slug)}`;
    const images = Array.isArray(item.product_images) ? item.product_images.slice() : [];
    images.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const thumb = images[0] && images[0].image_url ? String(images[0].image_url) : '';
    card.className = 'product show';
    if (thumb) card.style.backgroundImage = `url(${thumb})`;

    const badgeText = item && item.badge ? String(item.badge).trim() : '';
    const badgeHtml = badgeText ? `<span class="product-badge">${badgeText}</span>` : '';

    const wishActive = getWishlist().includes(String(item.id));
    const wishChar = wishActive ? '♥' : '♡';
    const wishLabel = wishActive ? 'Hapus dari wishlist' : 'Tambah ke wishlist';

    card.innerHTML = `
      ${badgeHtml}
      <button class="wishlist-btn" type="button" data-wishlist-toggle="${item.id}" aria-pressed="${wishActive ? 'true' : 'false'}" aria-label="${wishLabel}">${wishChar}</button>
      <a class="product-content" href="${productUrl}">
        <h1 class="title">${item.title}</h1>
        <p class="subtitle">${safeText(item.subtitle) === '-' ? '' : safeText(item.subtitle)}</p>
        <div class="product-stats">
          <div class="stat"><span class="label">Harga</span><span class="value">${formatPrice(item.price)}</span></div>
          <div class="stat"><span class="label">Warna</span><span class="value">${safeText(item.color)}</span></div>
          <div class="stat"><span class="label">Baterai</span><span class="value">${safeText(item.battery)}</span></div>
          <div class="stat"><span class="label">Latency</span><span class="value">${safeText(item.latency)}</span></div>
        </div>
      </a>
    `;

    listEl.appendChild(card);
  });
}

function setupWishlistToggle() {
  const listEl = document.getElementById('wishlistList');
  if (!listEl) return;

  listEl.addEventListener('click', async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const id = t.getAttribute('data-wishlist-toggle');
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();

    const res = toggleWishlist(id);
    t.textContent = res.active ? '♥' : '♡';
    t.setAttribute('aria-pressed', res.active ? 'true' : 'false');
    t.setAttribute('aria-label', res.active ? 'Hapus dari wishlist' : 'Tambah ke wishlist');
    toast('success', res.active ? 'Masuk wishlist' : 'Dihapus dari wishlist', '');

    if (!res.active) {
      await loadWishlist();
    }
  });
}

function setupBackToTop() {
  const btn = document.getElementById('backToTop');
  if (!btn) return;
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

function setupFooterYear() {
  const el = document.getElementById('footerYear');
  if (el) el.textContent = String(new Date().getFullYear());
}

setupFooterYear();
setupBackToTop();
setupWishlistToggle();
loadWishlist();

const header = document.querySelector('.site-header');
const onScrollCompact = () => {
  if (!header) return;
  header.classList.toggle('is-compact', window.scrollY > 12);
};
window.addEventListener('scroll', onScrollCompact, { passive: true });
onScrollCompact();

const userLabel = document.getElementById('userLabel');
if (userLabel) {
  supabase.auth.getUser().then(({ data }) => {
    const u = data && data.user ? data.user : null;
    userLabel.textContent = u && u.email ? `Hi, ${u.email}` : '';
  }).catch(() => {
    userLabel.textContent = '';
  });
}
