import { supabase } from './supabaseClient.js';
import { getUser, onAuthStateChange, signInWithEmail, signOut, signUpWithEmail } from './store.js';

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

function formatCurrency(value) {
  const n = Number(value);
  if (Number.isFinite(n)) {
    return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
  }
  return '0';
}

function formatDate(value) {
  try {
    const d = new Date(value);
    return d.toLocaleString('id-ID', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(value || '');
  }
}

function setModalOpen(modal, open) {
  if (!modal) return;
  modal.classList.toggle('show', open);
  modal.setAttribute('aria-hidden', open ? 'false' : 'true');
}

async function renderOrders(user) {
  const listEl = document.getElementById('ordersList');
  if (!listEl) return;

  if (!user) {
    listEl.innerHTML = `
      <div class="loading-container">
        <div class="loading-text">Silakan login untuk melihat riwayat order.</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <div class="loading-text">Memuat riwayat order...</div>
    </div>
  `;

  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, status, total_amount, shipping_cost, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Gagal memuat order:', error);
    listEl.innerHTML = `
      <div class="loading-container">
        <div class="loading-text">Gagal memuat riwayat order.</div>
      </div>
    `;
    toast('error', 'Gagal memuat', error.message || 'Silakan coba lagi.');
    return;
  }

  const orders = Array.isArray(data) ? data : [];
  if (!orders.length) {
    listEl.innerHTML = `
      <div class="loading-container">
        <div class="loading-text">Belum ada order.</div>
      </div>
    `;
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'orders-list';
  orders.forEach((o) => {
    const total = Number(o.total_amount || 0) + Number(o.shipping_cost || 0);
    const card = document.createElement('div');
    card.className = 'order-card';
    card.innerHTML = `
      <div class="order-card__top">
        <div>
          <div class="order-card__number">${o.order_number || o.id}</div>
          <div class="order-card__date">${formatDate(o.created_at)}</div>
        </div>
        <span class="order-card__status">${String(o.status || 'pending')}</span>
      </div>
      <div class="order-card__meta">
        <div class="order-card__row"><span>Subtotal</span><span>${formatCurrency(o.total_amount)}</span></div>
        <div class="order-card__row"><span>Ongkir</span><span>${formatCurrency(o.shipping_cost)}</span></div>
        <div class="order-card__row order-card__row--total"><span>Total</span><span>${formatCurrency(total)}</span></div>
      </div>
    `;
    wrap.appendChild(card);
  });

  listEl.textContent = '';
  listEl.appendChild(wrap);
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

function setupAuthUI() {
  const authModal = document.getElementById('authModal');
  const authForm = document.getElementById('authForm');
  const authTitle = document.getElementById('authTitle');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');
  const authSubmit = document.getElementById('authSubmit');
  const authToggle = document.getElementById('authToggle');
  const authHint = document.getElementById('authHint');

  const loginButton = document.getElementById('loginButton');
  const logoutButton = document.getElementById('logoutButton');

  let authMode = 'login';

  const setAuthMode = (mode) => {
    authMode = mode;
    if (authTitle) authTitle.textContent = mode === 'signup' ? 'Daftar' : 'Login';
    if (authSubmit) authSubmit.textContent = mode === 'signup' ? 'Daftar' : 'Login';
    if (authToggle) {
      authToggle.textContent = mode === 'signup' ? 'Sudah punya akun? Login' : 'Belum punya akun? Daftar';
      authToggle.dataset.mode = mode === 'signup' ? 'login' : 'signup';
    }
    if (authHint) authHint.textContent = '';
  };

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const closeTarget = t.getAttribute('data-close');
    if (closeTarget === 'auth') {
      setModalOpen(authModal, false);
    }
    const toggleId = t.getAttribute('data-toggle-password');
    if (toggleId) {
      const input = document.getElementById(toggleId);
      if (input && input instanceof HTMLInputElement) {
        const nextType = input.type === 'password' ? 'text' : 'password';
        input.type = nextType;
      }
    }
  });

  if (loginButton) {
    loginButton.addEventListener('click', () => {
      setAuthMode('login');
      setModalOpen(authModal, true);
      if (authEmail) authEmail.focus();
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      await signOut();
      toast('success', 'Logout berhasil', '');
    });
  }

  if (authToggle) {
    authToggle.addEventListener('click', () => {
      const next = authToggle.dataset.mode === 'signup' ? 'signup' : 'login';
      setAuthMode(next);
    });
  }

  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!authEmail || !authPassword) return;
      try {
        const email = authEmail.value.trim();
        const password = authPassword.value;
        if (authMode === 'signup') {
          await signUpWithEmail(email, password);
          toast('success', 'Akun berhasil dibuat', 'Silakan login untuk melihat order.');
        } else {
          await signInWithEmail(email, password);
          setModalOpen(authModal, false);
          toast('success', 'Login berhasil', '');
        }
      } catch (err) {
        if (authHint) authHint.textContent = err && err.message ? err.message : 'Gagal autentikasi.';
        toast('error', 'Gagal autentikasi', err && err.message ? err.message : 'Silakan coba lagi.');
      }
    });
  }

  return { loginButton, logoutButton };
}

setupFooterYear();
setupBackToTop();
const { loginButton, logoutButton } = setupAuthUI();

const userLabel = document.getElementById('userLabel');
const header = document.querySelector('.site-header');
const onScrollCompact = () => {
  if (!header) return;
  header.classList.toggle('is-compact', window.scrollY > 12);
};
window.addEventListener('scroll', onScrollCompact, { passive: true });
onScrollCompact();

(async () => {
  const user = await getUser();
  if (loginButton) loginButton.style.display = user ? 'none' : '';
  if (logoutButton) logoutButton.style.display = user ? '' : 'none';
  if (userLabel) userLabel.textContent = user && user.email ? `Hi, ${user.email}` : '';
  await renderOrders(user);
})();

onAuthStateChange(async (u) => {
  if (loginButton) loginButton.style.display = u ? 'none' : '';
  if (logoutButton) logoutButton.style.display = u ? '' : 'none';
  if (userLabel) userLabel.textContent = u && u.email ? `Hi, ${u.email}` : '';
  await renderOrders(u);
});
