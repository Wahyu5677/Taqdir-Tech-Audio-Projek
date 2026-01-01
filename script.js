// Enhanced scroll animations and parallax
import { supabase } from './supabaseClient.js';
import {
    addToCart,
    checkout,
    getShippingCities,
    getShippingCost,
    getShippingProvinces,
    getCartItems,
    getUser,
    onAuthStateChange,
    removeCartItem,
    signInWithEmail,
    signOut,
    signUpWithEmail,
} from './store.js';
class ScrollEffects {
    constructor() {
        this.scrollProgress = document.getElementById('scrollProgress');
        this.particles = document.getElementById('particles');
        this.parallaxElements = document.querySelectorAll('.parallax-element');
        this.init();
    }

    init() {
        this.createParticles();
        this.updateScrollProgress();
        this.setupEventListeners();
        this.observeElements();
    }

    createParticles() {
        if (!this.particles) return;
        this.particles.textContent = '';
        
        const particleCount = 15;
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 20 + 's';
            particle.style.animationDuration = (15 + Math.random() * 10) + 's';
            this.particles.appendChild(particle);
        }
    }

    updateScrollProgress() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollPercent = (scrollTop / scrollHeight) * 100;
        
        if (this.scrollProgress) {
            this.scrollProgress.style.width = scrollPercent + '%';
        }
    }

    setupEventListeners() {
        window.addEventListener('scroll', () => {
            this.updateScrollProgress();
            this.updateParallax();
        }, { passive: true });

        window.addEventListener('resize', () => {
            this.updateScrollProgress();
        });
    }

    updateParallax() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const speed = 0.5;
        
        this.parallaxElements.forEach(element => {
            const rect = element.getBoundingClientRect();
            const elementTop = rect.top + scrollTop;
            const yPos = -(scrollTop - elementTop) * speed;
            
            if (Math.abs(yPos) < 500) {
                element.style.transform = `translateY(${yPos}px)`;
            }
        });
    }

    observeElements() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });

        document.querySelectorAll('.fade-in, .slide-in-left, .slide-in-right, .scale-in').forEach(el => {
            observer.observe(el);
        });
    }
}

let scrollEffectsInstance;

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
        if (role === 'admin') {
            link.style.display = '';
        }
    } catch (err) {
        console.warn('Gagal cek role admin:', err);
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

function getCompare() {
    try {
        const raw = localStorage.getItem('compare');
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

function setCompare(list) {
    try {
        localStorage.setItem('compare', JSON.stringify(Array.isArray(list) ? list : []));
    } catch {
        // ignore
    }
}

function toggleCompare(id) {
    const key = String(id || '');
    if (!key) return { active: false, list: getCompare() };
    const list = getCompare();
    const idx = list.indexOf(key);
    if (idx >= 0) {
        list.splice(idx, 1);
        setCompare(list);
        return { active: false, list };
    }
    if (list.length >= 3) {
        return { active: false, list, full: true };
    }
    list.push(key);
    setCompare(list);
    return { active: true, list };
}

function getData() {
    const productList = document.getElementById("productList");
    if (productList) {
        // Show skeleton loading
        productList.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <div class="loading-text">Loading Audio Collection...</div>
            </div>
        `;
    }

    const searchInput = document.getElementById('searchInput');
    const headerSearch = document.getElementById('headerSearch');
    const colorFilter = document.getElementById('colorFilter');
    const sortSelect = document.getElementById('sortSelect');
    const clearFilters = document.getElementById('clearFilters');

    (async () => {
        const { data: items, error } = await supabase
            .from('products')
            .select('id, slug, title, subtitle, description, badge, price, color, battery, weight, latency, track_stock, stock_qty, is_active, product_images(image_url, sort_order)')
            .or('is_active.is.null,is_active.eq.true');

        if (error) {
            throw error;
        }

        if (!productList) {
            return;
        }

        const originalItems = Array.isArray(items) ? items.slice() : [];
        let visibleCards = [];
        let revealHandlersBound = false;

        const reveal = () => {
            for (const card of visibleCards) {
                const {top, bottom} = card.getBoundingClientRect();

                if (top < window.innerHeight * 0.85 && bottom > window.innerHeight * 0.15) {
                    card.classList.add("show");
                    card.classList.add("visible");
                }
            }
        };

        const parsePrice = (value) => {
            if (value === null || value === undefined || value === '') return Number.NaN;
            const num = String(value).replace(/[^0-9.]/g, '');
            return Number(num);
        };

        const formatPrice = (value) => {
            const n = Number(value);
            if (Number.isFinite(n)) {
                return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
            }
            return String(value || '');
        };

        const normalize = (value) => String(value || '').trim().toLowerCase();

        const populateColorOptions = () => {
            if (!colorFilter) return;
            const colors = Array.from(new Set(originalItems.map((it) => (it && it.color ? String(it.color).trim() : '')).filter(Boolean)));
            colors.sort((a, b) => a.localeCompare(b));
            const keepFirst = colorFilter.querySelector('option[value=""]');
            colorFilter.textContent = '';
            if (keepFirst) {
                colorFilter.appendChild(keepFirst);
            } else {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'Semua';
                colorFilter.appendChild(opt);
            }
            colors.forEach((c) => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                colorFilter.appendChild(opt);
            });
        };

        const applyFilters = () => {
            const q = normalize(searchInput ? searchInput.value : '');
            let selectedColor = colorFilter ? String(colorFilter.value || '').trim() : '';
            if (normalize(selectedColor) === 'semua') selectedColor = '';
            const sortMode = sortSelect ? String(sortSelect.value || 'featured') : 'featured';
            const usecaseEl = document.querySelector('.usecase-chip.is-active');
            const usecase = usecaseEl ? String(usecaseEl.getAttribute('data-usecase') || 'all') : 'all';

            let list = originalItems.slice();

            if (q) {
                list = list.filter((it) => {
                    const hay = `${normalize(it.title)} ${normalize(it.subtitle)} ${normalize(it.description)} ${normalize(it.badge)} ${normalize(it.color)}`;
                    return hay.includes(q);
                });
            }

            if (usecase && usecase !== 'all') {
                const map = {
                    gaming: ['gaming', 'latency', 'low latency'],
                    musik: ['musik', 'music', 'audio', 'detail', 'vocal'],
                    bass: ['bass', 'deep bass', 'sub bass'],
                    anc: ['anc', 'noise cancel', 'noise cancelling', 'cancel'],
                    budget: ['budget', 'murah', 'hemat'],
                };
                if (usecase === 'budget') {
                    const priced = list
                        .map((it) => ({ it, p: parsePrice(it && it.price) }))
                        .filter((x) => Number.isFinite(x.p));

                    if (priced.length > 0) {
                        const prices = priced.map((x) => x.p).sort((a, b) => a - b);
                        const idx = Math.max(0, Math.min(prices.length - 1, Math.ceil(prices.length * 0.35) - 1));
                        const threshold = prices[idx];
                        const cheapByPrice = priced.filter((x) => x.p <= threshold).map((x) => x.it);

                        if (cheapByPrice.length > 0) {
                            list = cheapByPrice;
                        } else {
                            list = priced.map((x) => x.it);
                        }
                    } else {
                        const keys = map.budget;
                        list = list.filter((it) => {
                            const hay = `${normalize(it.title)} ${normalize(it.subtitle)} ${normalize(it.description)} ${normalize(it.badge)} ${normalize(it.color)}`;
                            return keys.some((k) => hay.includes(normalize(k)));
                        });
                    }
                } else {
                    const keys = map[usecase] || [usecase];
                    list = list.filter((it) => {
                        const hay = `${normalize(it.title)} ${normalize(it.subtitle)} ${normalize(it.description)} ${normalize(it.badge)} ${normalize(it.color)}`;
                        return keys.some((k) => hay.includes(normalize(k)));
                    });
                }
            }

            if (selectedColor) {
                const sel = normalize(selectedColor);
                list = list.filter((it) => normalize(it.color) === sel);
            }

            if (sortMode === 'titleAsc') {
                list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
            } else if (sortMode === 'priceAsc') {
                list.sort((a, b) => (parsePrice(a.price) || 0) - (parsePrice(b.price) || 0));
            } else if (sortMode === 'priceDesc') {
                list.sort((a, b) => (parsePrice(b.price) || 0) - (parsePrice(a.price) || 0));
            }

            return list;
        };

        const renderItems = (list) => {
            productList.textContent = '';

            if (!Array.isArray(list) || list.length === 0) {
                productList.innerHTML = `
                    <div class="loading-container">
                        <div class="loading-text">Produk tidak ditemukan.</div>
                    </div>
                `;
                return;
            }

            const nextCards = [];

            list.forEach((item, index) => {
                const card = document.createElement("div");
                const productUrl = `detail.html?id=${encodeURIComponent(item.slug)}`;
                const images = Array.isArray(item.product_images) ? item.product_images.slice() : [];
                images.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
                const thumb = images[0] && images[0].image_url ? String(images[0].image_url) : '';

                card.className = "product fade-in";
                if (thumb) {
                    card.style.backgroundImage = `url(${thumb})`;
                }
                card.style.animationDelay = `${index * 0.1}s`;

                const badgeText = item && item.badge ? String(item.badge).trim() : '';
                const badgeHtml = badgeText ? `<span class="product-badge">${badgeText}</span>` : '';
                const wishlist = getWishlist();
                const wishActive = wishlist.includes(String(item.id));
                const wishLabel = wishActive ? 'Hapus dari wishlist' : 'Tambah ke wishlist';
                const wishChar = wishActive ? '♥' : '♡';

                const compareList = getCompare();
                const compareActive = compareList.includes(String(item.id));

                const badgeLower = badgeText.toLowerCase();
                const priceNumber = parsePrice(item.price) || 0;
                let promoPct = 0;
                const m = badgeLower.match(/(\d{1,2})\s*%/);
                if (m) promoPct = Math.min(80, Math.max(5, Number(m[1]) || 0));
                if (!promoPct && (badgeLower.includes('promo') || badgeLower.includes('diskon') || badgeLower.includes('sale'))) {
                    promoPct = 15;
                }
                const oldPrice = promoPct ? Math.round(priceNumber / (1 - promoPct / 100)) : 0;
                const priceHtml = promoPct ? `
                  <div class="price-stack">
                    <div class="price-now">${formatPrice(priceNumber)}</div>
                    <div class="price-old">${formatPrice(oldPrice)}</div>
                    <div class="discount-pill">-${promoPct}%</div>
                  </div>
                ` : `<div class="price-now">${formatPrice(item.price)}</div>`;

                const safeText = (value) => {
                    const v = String(value ?? '').trim();
                    return v ? v : '-';
                };

                const track = Boolean(item && item.track_stock);
                const qty = Number(item && item.stock_qty);
                const safeQty = Number.isFinite(qty) ? Math.max(0, Math.floor(qty)) : 0;
                const stockHtml = track
                    ? (safeQty <= 0
                        ? `<span class="stock-pill stock-pill--out">Habis</span>`
                        : safeQty <= 5
                            ? `<span class="stock-pill stock-pill--low">Menipis (${safeQty})</span>`
                            : `<span class="stock-pill">Stok ${safeQty}</span>`)
                    : `<span class="stock-pill">Ready</span>`;

                card.innerHTML = `
                    ${badgeHtml}
                    <button class="wishlist-btn" type="button" data-wishlist-toggle="${item.id}" aria-pressed="${wishActive ? 'true' : 'false'}" aria-label="${wishLabel}">${wishChar}</button>
                    <button class="compare-toggle" type="button" data-compare-toggle="${item.id}" aria-pressed="${compareActive ? 'true' : 'false'}" aria-label="Bandingkan produk">Compare</button>
                    <a class="product-content" href="${productUrl}">

                      <h1 class="title">${item.title}</h1>
                      <p class="subtitle">${safeText(item.subtitle) === '-' ? '' : safeText(item.subtitle)}</p>

                      <div class="product-stats">

                        <div class="stat">
                            <span class="label">Warna</span>
                            <span class="value">${safeText(item.color)}</span>
                        </div>

                        <div class="stat">
                            <span class="label">Baterai</span>
                            <span class="value">${safeText(item.battery)}</span>
                        </div>

                        <div class="stat">
                            <span class="label">Bobot</span>
                            <span class="value">${safeText(item.weight)}</span>
                        </div>

                        <div class="stat">
                            <span class="label">Latency</span>
                            <span class="value">${safeText(item.latency)}</span>
                        </div>

                        <div class="stat">
                            <span class="label">Stok</span>
                            <span class="value">${stockHtml}</span>
                        </div>

                        <div class="stat">
                            <span class="label">Harga</span>
                            <span class="value">${priceHtml}</span>
                        </div>

                      </div>
                    </a>
                `;

                const content = card.querySelector(".product-content");
                if (content) {
                    content.href = productUrl;
                }

                productList.appendChild(card);
                nextCards.push(card);
            });

            visibleCards = nextCards;

            if (!revealHandlersBound) {
                window.addEventListener("scroll", reveal, {passive: true});
                window.addEventListener("resize", reveal);
                revealHandlersBound = true;
            }

            setTimeout(() => {
                reveal();
                if (!scrollEffectsInstance) {
                    scrollEffectsInstance = new ScrollEffects();
                }
            }, 300);
        };

        if (productList) {
            productList.addEventListener('click', (e) => {
                const t = e.target;
                if (!(t instanceof HTMLElement)) return;
                const id = t.getAttribute('data-wishlist-toggle');
                if (!id) return;
                e.preventDefault();
                e.stopPropagation();
                const res = toggleWishlist(id);
                const nextChar = res.active ? '♥' : '♡';
                t.textContent = nextChar;
                t.setAttribute('aria-pressed', res.active ? 'true' : 'false');
                t.setAttribute('aria-label', res.active ? 'Hapus dari wishlist' : 'Tambah ke wishlist');
                toast('success', res.active ? 'Masuk wishlist' : 'Dihapus dari wishlist', '');
            }, { capture: true });

            productList.addEventListener('click', (e) => {
                const t = e.target;
                if (!(t instanceof HTMLElement)) return;
                const id = t.getAttribute('data-compare-toggle');
                if (!id) return;
                e.preventDefault();
                e.stopPropagation();
                const res = toggleCompare(id);
                if (res.full) {
                    toast('error', 'Maksimal 3', 'Compare maksimal 3 produk.');
                    return;
                }
                t.setAttribute('aria-pressed', res.active ? 'true' : 'false');
                updateCompareUI(originalItems);
            }, { capture: true });
        }

        const usecaseWrap = document.querySelector('.usecase');
        if (usecaseWrap) {
            usecaseWrap.addEventListener('click', (e) => {
                const t = e.target;
                if (!(t instanceof HTMLElement)) return;
                if (!t.classList.contains('usecase-chip')) return;
                const chips = usecaseWrap.querySelectorAll('.usecase-chip');
                chips.forEach((c) => c.classList.remove('is-active'));
                t.classList.add('is-active');
                update();
            });
        }

        populateColorOptions();
        renderItems(applyFilters());

        const update = () => renderItems(applyFilters());

        if (headerSearch && searchInput) {
            let t;
            headerSearch.addEventListener('input', () => {
                window.clearTimeout(t);
                t = window.setTimeout(() => {
                    searchInput.value = headerSearch.value;
                    update();
                }, 120);
            });

            searchInput.addEventListener('input', () => {
                headerSearch.value = searchInput.value;
            });
        }

        if (searchInput) {
            let t;
            searchInput.addEventListener('input', () => {
                window.clearTimeout(t);
                t = window.setTimeout(update, 120);
            });
        }

        if (colorFilter) {
            colorFilter.addEventListener('change', update);
        }

        if (sortSelect) {
            sortSelect.addEventListener('change', update);
        }

        if (clearFilters) {
            clearFilters.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (colorFilter) colorFilter.value = '';
                if (sortSelect) sortSelect.value = 'featured';
                const activeChip = document.querySelector('.usecase-chip.is-active');
                const allChip = document.querySelector('.usecase-chip[data-usecase="all"]');
                if (activeChip) activeChip.classList.remove('is-active');
                if (allChip) allChip.classList.add('is-active');
                update();
            });
        }

        const compareBar = document.getElementById('compareBar');
        const compareOpen = document.getElementById('compareOpen');
        const compareClear = document.getElementById('compareClear');
        const compareModal = document.getElementById('compareModal');
        const compareTable = document.getElementById('compareTable');
        const compareHint = document.getElementById('compareHint');

        const setModalOpen = (modal, open) => {
            if (!modal) return;
            modal.classList.toggle('show', open);
            modal.setAttribute('aria-hidden', open ? 'false' : 'true');
        };

        const updateCompareUI = (items) => {
            const list = getCompare();
            const countEl = document.getElementById('compareCount');
            const pillsEl = document.getElementById('compareItems');
            if (countEl) countEl.textContent = String(list.length);
            if (pillsEl) {
                const map = new Map((items || []).map((x) => [String(x.id), x]));
                pillsEl.textContent = '';
                list.forEach((id) => {
                    const it = map.get(String(id));
                    const pill = document.createElement('div');
                    pill.className = 'compare-pill';
                    pill.textContent = it && it.title ? String(it.title) : String(id);
                    pillsEl.appendChild(pill);
                });
            }
            if (compareBar) {
                compareBar.classList.toggle('show', list.length > 0);
                compareBar.setAttribute('aria-hidden', list.length > 0 ? 'false' : 'true');
            }
        };

        const renderCompareTable = () => {
            const list = getCompare();
            if (!compareTable) return;
            const map = new Map((originalItems || []).map((x) => [String(x.id), x]));
            const selected = list.map((id) => map.get(String(id))).filter(Boolean);
            if (selected.length < 2) {
                compareTable.textContent = '';
                if (compareHint) compareHint.textContent = 'Pilih minimal 2 produk untuk dibandingkan.';
                return;
            }
            if (compareHint) compareHint.textContent = '';
            const rows = [
                ['Nama', (it) => it.title || '-'],
                ['Harga', (it) => formatPrice(it.price)],
                ['Warna', (it) => it.color || '-'],
                ['Baterai', (it) => it.battery || '-'],
                ['Bobot', (it) => it.weight || '-'],
                ['Latency', (it) => it.latency || '-'],
                ['Badge', (it) => it.badge || '-'],
            ];
            const thead = `<thead><tr><th>Spesifikasi</th>${selected.map((it) => `<th>${String(it.title || '-')}</th>`).join('')}</tr></thead>`;
            const tbody = `<tbody>${rows.map(([label, fn]) => `<tr><th>${label}</th>${selected.map((it) => `<td>${String(fn(it))}</td>`).join('')}</tr>`).join('')}</tbody>`;
            compareTable.innerHTML = `<table class="compare-table">${thead}${tbody}</table>`;
        };

        updateCompareUI(originalItems);

        if (compareOpen) {
            compareOpen.addEventListener('click', () => {
                renderCompareTable();
                setModalOpen(compareModal, true);
            });
        }

        if (compareClear) {
            compareClear.addEventListener('click', () => {
                setCompare([]);
                updateCompareUI(originalItems);
                const btns = document.querySelectorAll('[data-compare-toggle]');
                btns.forEach((b) => b.setAttribute('aria-pressed', 'false'));
                toast('success', 'Compare direset', '');
            });
        }

        document.addEventListener('click', (e) => {
            const t = e.target;
            if (!(t instanceof HTMLElement)) return;
            const close = t.getAttribute('data-close');
            if (close === 'compare') {
                setModalOpen(compareModal, false);
            }
        });

        window.updateCompareUI = updateCompareUI;
    })().catch((err) => {
        console.error('Gagal memuat produk dari Supabase:', err);
        if (productList) {
            productList.innerHTML = `
                <div class="loading-container">
                    <div class="loading-text">Gagal memuat data produk. Cek koneksi internet atau coba lagi nanti.</div>
                </div>
            `;
        }
    });
}

getData()

function initCommerceUI() {
    const loginButton = document.getElementById('loginButton');
    const logoutButton = document.getElementById('logoutButton');
    const cartButton = document.getElementById('cartButton');
    const cartCount = document.getElementById('cartCount');

    const authModal = document.getElementById('authModal');
    const cartModal = document.getElementById('cartModal');
    const authForm = document.getElementById('authForm');
    const authTitle = document.getElementById('authTitle');
    const authEmail = document.getElementById('authEmail');
    const authPassword = document.getElementById('authPassword');
    const authSubmit = document.getElementById('authSubmit');
    const authToggle = document.getElementById('authToggle');
    const authHint = document.getElementById('authHint');

    const cartItemsEl = document.getElementById('cartItems');
    const cartTotalEl = document.getElementById('cartTotal');
    const shippingCostEl = document.getElementById('shippingCost');
    const grandTotalEl = document.getElementById('grandTotal');
    const checkoutButton = document.getElementById('checkoutButton');
    const cartHint = document.getElementById('cartHint');

    const shipRecipient = document.getElementById('shipRecipient');
    const shipPhone = document.getElementById('shipPhone');
    const shipProvince = document.getElementById('shipProvince');
    const shipCity = document.getElementById('shipCity');
    const shipStreet = document.getElementById('shipStreet');

    const productList = document.getElementById('productList');

    let user = null;
    let authMode = 'login';
    let currentShippingCost = 0;
    let authCooldownInterval = null;

    const setModalOpen = (modal, open) => {
        if (!modal) return;
        modal.classList.toggle('show', open);
        modal.setAttribute('aria-hidden', open ? 'false' : 'true');
    };

    const startAuthCooldown = (seconds) => {
        const sec = Math.max(1, Number(seconds) || 30);
        if (authSubmit) authSubmit.disabled = true;
        if (authToggle) authToggle.disabled = true;
        if (authCooldownInterval) {
            clearInterval(authCooldownInterval);
            authCooldownInterval = null;
        }
        const start = Date.now();
        const durationMs = sec * 1000;
        const tick = () => {
            const remainMs = Math.max(0, durationMs - (Date.now() - start));
            const remainSec = Math.ceil(remainMs / 1000);
            if (authHint) authHint.textContent = `Terlalu banyak percobaan. Coba lagi dalam ${remainSec} detik.`;
            if (remainMs <= 0) {
                if (authCooldownInterval) clearInterval(authCooldownInterval);
                authCooldownInterval = null;
                if (authSubmit) authSubmit.disabled = false;
                if (authToggle) authToggle.disabled = false;
                if (authHint) authHint.textContent = '';
            }
        };
        tick();
        authCooldownInterval = setInterval(tick, 250);
    };

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

    const updateAuthButtons = () => {
        if (loginButton) loginButton.style.display = user ? 'none' : '';
        if (logoutButton) logoutButton.style.display = user ? '' : 'none';
    };

    const formatCurrency = (n) => {
        const v = Number(n || 0);
        return v.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
    };

    const updateTotals = (subtotal) => {
        const ship = Number(currentShippingCost || 0);
        if (shippingCostEl) shippingCostEl.textContent = formatCurrency(ship);
        if (grandTotalEl) grandTotalEl.textContent = formatCurrency(Number(subtotal || 0) + ship);
    };

    const loadProvinces = async () => {
        if (!shipProvince) return;
        try {
            const provinces = await getShippingProvinces();
            shipProvince.textContent = '';
            const opt0 = document.createElement('option');
            opt0.value = '';
            opt0.textContent = 'Pilih provinsi';
            shipProvince.appendChild(opt0);
            provinces.forEach((p) => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.textContent = p;
                shipProvince.appendChild(opt);
            });
        } catch (err) {
            console.error('Gagal memuat provinsi:', err);
        }
    };

    const loadCities = async (province) => {
        if (!shipCity) return;
        shipCity.textContent = '';
        const opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = 'Pilih kota';
        shipCity.appendChild(opt0);
        shipCity.disabled = true;
        if (!province) return;
        try {
            const cities = await getShippingCities(province);
            cities.forEach((c) => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                shipCity.appendChild(opt);
            });
            shipCity.disabled = false;
        } catch (err) {
            console.error('Gagal memuat kota:', err);
        }
    };

    const recomputeShipping = async () => {
        const province = shipProvince ? String(shipProvince.value || '').trim() : '';
        const city = shipCity ? String(shipCity.value || '').trim() : '';
        if (!province || !city) {
            currentShippingCost = 0;
            const subtotal = cartTotalEl ? Number(String(cartTotalEl.textContent || '').replace(/[^0-9]/g, '')) : 0;
            updateTotals(subtotal);
            return;
        }
        try {
            currentShippingCost = await getShippingCost(province, city);
        } catch (err) {
            console.error('Gagal hitung ongkir:', err);
            currentShippingCost = 0;
        }
        const { totalAmount } = user ? await getCartItems(user.id) : { totalAmount: 0 };
        updateTotals(totalAmount);
    };

    const renderCart = async () => {
        if (!cartItemsEl || !cartTotalEl) return;
        if (!user) {
            cartItemsEl.innerHTML = '<div class="modal__hint">Silakan login untuk melihat cart.</div>';
            cartTotalEl.textContent = '0';
            if (cartHint) cartHint.textContent = '';
            if (cartCount) cartCount.textContent = '0';
            updateTotals(0);
            if (checkoutButton) {
                checkoutButton.disabled = true;
                checkoutButton.textContent = 'Checkout';
            }
            return;
        }

        const { items, totalQty, totalAmount } = await getCartItems(user.id);
        if (cartCount) cartCount.textContent = String(totalQty);
        cartTotalEl.textContent = totalAmount.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
        updateTotals(totalAmount);

        if (!items.length) {
            cartItemsEl.innerHTML = '<div class="modal__hint">Cart kamu masih kosong.</div>';
            if (checkoutButton) {
                checkoutButton.disabled = true;
                checkoutButton.textContent = 'Checkout';
            }
            return;
        }

        if (checkoutButton) {
            checkoutButton.disabled = false;
            checkoutButton.textContent = 'Checkout';
        }

        cartItemsEl.innerHTML = items.map((it) => {
            const title = it.product?.title || 'Produk';
            const qty = it.qty || 0;
            const subtotal = (Number(it.unit_price || 0) * Number(qty || 0));
            const price = subtotal.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
            return `
                <div class="cart-item">
                  <div>
                    <p class="cart-item__title">${title}</p>
                    <p class="cart-item__meta">Qty: ${qty} · Subtotal: ${price}</p>
                  </div>
                  <button class="cart-item__remove" type="button" data-remove-cart-item="${it.id}">Hapus</button>
                </div>
            `;
        }).join('');
    };

    const refreshUser = async () => {
        user = await getUser();
        updateAuthButtons();
        await renderCart();
    };

    document.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t instanceof HTMLElement)) return;
        const close = t.getAttribute('data-close');
        if (close === 'auth') setModalOpen(authModal, false);
        if (close === 'cart') setModalOpen(cartModal, false);

        const toggleTarget = t.getAttribute('data-toggle-password');
        if (toggleTarget) {
            const input = document.getElementById(toggleTarget);
            if (input && input instanceof HTMLInputElement) {
                const nextType = input.type === 'password' ? 'text' : 'password';
                input.type = nextType;
                t.setAttribute('aria-label', nextType === 'password' ? 'Tampilkan password' : 'Sembunyikan password');
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
                    if (authHint) authHint.textContent = 'Akun dibuat. Jika email verification aktif, cek email kamu.';
                    toast('success', 'Akun berhasil dibuat', 'Silakan login untuk mulai belanja.');
                } else {
                    await signInWithEmail(email, password);
                    setModalOpen(authModal, false);
                    toast('success', 'Login berhasil', 'Selamat datang kembali.');
                }
            } catch (err) {
                const status = err && typeof err.status === 'number' ? err.status : null;
                if (status === 429) {
                    const msg = String(err && err.message ? err.message : '');
                    const m = msg.match(/after\s+(\d+)\s*seconds?/i);
                    const seconds = m ? Number(m[1]) : 30;
                    startAuthCooldown(seconds);
                    toast('error', 'Terlalu banyak percobaan', `Coba lagi dalam ${seconds} detik.`);
                    return;
                }
                if (authHint) authHint.textContent = err && err.message ? err.message : 'Gagal autentikasi.';
                toast('error', 'Gagal autentikasi', err && err.message ? err.message : 'Silakan coba lagi.');
            }
        });
    }

    if (cartButton) {
        cartButton.addEventListener('click', async () => {
            if (!user) {
                setAuthMode('login');
                setModalOpen(authModal, true);
                toast('info', 'Login dulu', 'Untuk membuka cart, silakan login.');
                return;
            }
            if (shipProvince) {
                await loadProvinces();
            }
            await renderCart();
            setModalOpen(cartModal, true);
        });
    }

    if (shipProvince) {
        shipProvince.addEventListener('change', async () => {
            const province = String(shipProvince.value || '').trim();
            await loadCities(province);
            await recomputeShipping();
        });
    }

    if (shipCity) {
        shipCity.addEventListener('change', async () => {
            await recomputeShipping();
        });
    }

    if (cartItemsEl) {
        cartItemsEl.addEventListener('click', async (e) => {
            const t = e.target;
            if (!(t instanceof HTMLElement)) return;
            const cartItemId = t.getAttribute('data-remove-cart-item');
            if (!cartItemId || !user) return;
            await removeCartItem(user.id, cartItemId);
            await renderCart();
        });
    }

    if (checkoutButton) {
        checkoutButton.addEventListener('click', async () => {
            if (!user) return;
            if (checkoutButton.disabled) return;
            const prevText = checkoutButton.textContent;
            checkoutButton.disabled = true;
            checkoutButton.textContent = 'Processing...';
            try {
                const snapshot = await getCartItems(user.id);

                const recipient = shipRecipient ? String(shipRecipient.value || '').trim() : '';
                const phone = shipPhone ? String(shipPhone.value || '').trim() : '';
                const province = shipProvince ? String(shipProvince.value || '').trim() : '';
                const city = shipCity ? String(shipCity.value || '').trim() : '';
                const street = shipStreet ? String(shipStreet.value || '').trim() : '';

                if (!recipient || !phone || !province || !city || !street) {
                    if (cartHint) cartHint.textContent = 'Lengkapi data pengiriman (nama, no HP, provinsi, kota, alamat).';
                    toast('error', 'Alamat belum lengkap', 'Lengkapi data pengiriman dulu.');
                    checkoutButton.disabled = false;
                    checkoutButton.textContent = prevText;
                    return;
                }

                const orderNumber = `ORD-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-6)}`;
                const res = await checkout(user.id, {
                    recipient_name: recipient,
                    phone,
                    province,
                    city,
                    street,
                    order_number: orderNumber,
                });
                if (res.ok) {
                    if (cartHint) cartHint.textContent = `Order dibuat: ${res.order.id}`;
                    toast('success', 'Checkout berhasil', 'WhatsApp akan terbuka untuk konfirmasi.');

                    const lines = (snapshot.items || []).map((it) => {
                        const title = it.product?.title || 'Produk';
                        const qty = Number(it.qty || 0);
                        const subtotal = (Number(it.unit_price || 0) * qty);
                        const subtotalText = subtotal.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
                        return `- ${title} x${qty} = ${subtotalText}`;
                    });

                    const subtotalText = Number(snapshot.totalAmount || 0).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
                    const shippingText = formatCurrency(currentShippingCost);
                    const grandText = formatCurrency(Number(snapshot.totalAmount || 0) + Number(currentShippingCost || 0));
                    const msg = [
                        'Halo, saya mau checkout pesanan.',
                        `Order: ${orderNumber}`,
                        `Order ID: ${res.order.id}`,
                        '',
                        'Item:',
                        ...lines,
                        '',
                        `Subtotal: ${subtotalText}`,
                        `Ongkir: ${shippingText}`,
                        `Total Akhir: ${grandText}`,
                        '',
                        'Alamat Pengiriman:',
                        `${recipient} (${phone})`,
                        `${street}`,
                        `${city}, ${province}`,
                        '',
                        'Mohon info cara pembayaran (transfer). Terima kasih.',
                    ].join('\n');

                    const waUrl = `https://wa.me/6287777212901?text=${encodeURIComponent(msg)}`;
                    window.open(waUrl, '_blank', 'noopener,noreferrer');
                } else {
                    if (cartHint) cartHint.textContent = 'Cart masih kosong.';
                    toast('error', 'Cart kosong', 'Tambahkan produk dulu.');
                }
                await renderCart();
            } catch (err) {
                console.error('Checkout gagal (index):', err);
                if (cartHint) cartHint.textContent = (err && err.message) ? err.message : 'Checkout gagal.';
                toast('error', 'Checkout gagal', err && err.message ? err.message : 'Silakan coba lagi.');
            } finally {
                if (checkoutButton) {
                    checkoutButton.disabled = false;
                    checkoutButton.textContent = prevText;
                }
            }
        });
    }

    onAuthStateChange(async (u) => {
        user = u;
        updateAuthButtons();
        const userLabel = document.getElementById('userLabel');
        if (userLabel) {
            userLabel.textContent = user && user.email ? `Hi, ${user.email}` : '';
        }
        await syncAdminLink(user);
        await renderCart();
    });

    const header = document.querySelector('.site-header');
    const onScrollCompact = () => {
        if (!header) return;
        header.classList.toggle('is-compact', window.scrollY > 12);
    };
    window.addEventListener('scroll', onScrollCompact, { passive: true });
    onScrollCompact();

    refreshUser();
}

// Chat Widget Functionality
document.addEventListener('DOMContentLoaded', function() {
    initCommerceUI();
    const chatButton = document.getElementById('chatButton');
    const chatPopup = document.getElementById('chatPopup');
    const chatClose = document.getElementById('chatClose');
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');
    const chatMessages = document.getElementById('chatMessages');
    const backToTop = document.getElementById('backToTop');
    const filterToggle = document.getElementById('filterToggle');
    const headerFilters = document.getElementById('headerFilters');
    const searchInput = document.getElementById('searchInput');

    // Back to top button
    if (backToTop) {
        const updateBackToTop = () => {
            if (window.scrollY > 500) {
                backToTop.classList.add('show');
            } else {
                backToTop.classList.remove('show');
            }
        };

        updateBackToTop();
        window.addEventListener('scroll', updateBackToTop, { passive: true });

        backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Smooth scroll for internal anchor links
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
        a.addEventListener('click', (e) => {
            const href = a.getAttribute('href');
            if (!href || href === '#') {
                return;
            }
            const target = document.querySelector(href);
            if (!target) {
                return;
            }
            e.preventDefault();
            const header = document.querySelector('.site-header');
            const headerOffset = header ? header.offsetHeight + 10 : 0;
            const top = target.getBoundingClientRect().top + window.pageYOffset - headerOffset;
            window.scrollTo({ top, behavior: 'smooth' });
        });
    });

    // Header filter dropdown
    if (filterToggle && headerFilters) {
        const closeFilters = () => {
            headerFilters.classList.remove('show');
            headerFilters.setAttribute('aria-hidden', 'true');
            filterToggle.setAttribute('aria-expanded', 'false');
        };

        const openFilters = () => {
            headerFilters.classList.add('show');
            headerFilters.setAttribute('aria-hidden', 'false');
            filterToggle.setAttribute('aria-expanded', 'true');
            if (searchInput) {
                setTimeout(() => searchInput.focus(), 0);
            }
        };

        filterToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (headerFilters.classList.contains('show')) {
                closeFilters();
            } else {
                openFilters();
            }
        });

        document.addEventListener('click', (e) => {
            if (!headerFilters.classList.contains('show')) return;
            const target = e.target;
            if (target instanceof Node && (headerFilters.contains(target) || filterToggle.contains(target))) {
                return;
            }
            closeFilters();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeFilters();
            }
        });
    }
    
    // Toggle chat popup
    if (chatButton && chatPopup) {
        chatButton.addEventListener('click', function() {
            chatPopup.classList.toggle('show');
            
            // Remove badge when opened
            const badge = chatButton.querySelector('.chat-badge');
            if (badge) {
                badge.style.display = 'none';
            }
            
            // Focus input when opened
            if (chatPopup.classList.contains('show') && chatInput) {
                setTimeout(() => chatInput.focus(), 300);
            }
        });
    }
    
    // Close chat popup
    if (chatClose && chatPopup) {
        chatClose.addEventListener('click', function() {
            chatPopup.classList.remove('show');
        });
    }
    
    // Handle chat form submission
    if (chatForm && chatInput && chatMessages) {
        chatForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const message = chatInput.value.trim();
            if (!message) return;
            
            // Add user message
            addMessage(message, 'user');
            
            // Clear input
            chatInput.value = '';
            
            // Simulate bot response with keyword detection
            setTimeout(() => {
                const response = generateBotResponse(message);
                addMessage(response, 'bot');
            }, 1000 + Math.random() * 1000);
        });
    }
    
    // Smart Bot Response Generator
    function generateBotResponse(userMessage) {
        const message = userMessage.toLowerCase();
        
        // Product-related keywords
        if (message.includes('headphone') || message.includes('earphone') || message.includes('earbud')) {
            const responses = [
                "Kami punya berbagai macam headphone dan earbud premium! Ada yang lagi cari? Earbud ANC atau headphone over-ear?",
                "Nice choice! Kami ada koleksi headphone dan earbud dengan teknologi terbaru. Budget sekitar berapa yang Anda cari?",
                "Untuk headphone, saya rekomendasikan Arc Eclipse atau Pulse Mono. Untuk earbud, coba lihat Neon Pulse atau Noir Pulse. Ada yang tertarik?"
            ];
            return responses[Math.floor(Math.random() * responses.length)];
        }
        
        // Price-related keywords
        if (message.includes('harga') || message.includes('price') || message.includes('berapa') || message.includes('cost')) {
            const responses = [
                "Harga produk kami bervariasi dari $159-$289. Ada produk tertentu yang mau ditanyakan harganya?",
                "Tergantung modelnya! Earbud mulai $159, headphone mulai $189. Mau tau harga produk spesifik?",
                "Budget Anda berapa? Saya bisa bantu rekomendasikan produk yang sesuai. Kami ada di semua range harga!"
            ];
            return responses[Math.floor(Math.random() * responses.length)];
        }
        
        // Quality/Sound keywords
        if (message.includes('kualitas') || message.includes('sound') || message.includes('bass') || message.includes('audio')) {
            const responses = [
                "Sound quality produk kami top banget! Semua produk punya driver premium dan tuning khusus. Suka bass yang powerful atau vokal yang jernih?",
                "Audio adalah passion kami! Produk kami punya signature sound yang berbeda-beda. Ada yang bass-heavy, ada yang balanced. Preferensi Anda?",
                "Kualitas audio kami jempolan! Dengan driver dynamic dan chamber akustik khusus. Mau tahu tentang teknologi ANC atau sound signature?"
            ];
            return responses[Math.floor(Math.random() * responses.length)];
        }
        
        // Battery-related keywords
        if (message.includes('baterai') || message.includes('battery') || message.includes('daya')) {
            const responses = [
                "Battery life produk kami sangat baik! Earbud bisa 8 jam per charge, case bisa 40+ jam. Cukup untuk seharian penuh!",
                "Daya tahan baterai kami unggul! Headphone bisa 60+ jam, earbud 8 jam dengan case 40 jam. Ada yang butuh battery life ekstra?",
                "Semua produk punya fast charging dan battery life yang luar biasa. Mau tahu tentang wireless charging juga?"
            ];
            return responses[Math.floor(Math.random() * responses.length)];
        }
        
        // Greeting keywords
        if (message.includes('halo') || message.includes('hi') || message.includes('hello') || message.includes('hai')) {
            const responses = [
                "Halo! Selamat datang di Taqdir Tech Audio. Ada yang bisa saya bantu hari ini?",
                "Hi there! Looking for the perfect audio gear? Saya siap bantu!",
                "Halo! Teman audio yang baik! Ada produk tertentu yang lagi Anda cari?"
            ];
            return responses[Math.floor(Math.random() * responses.length)];
        }
        
        // Thanks keywords
        if (message.includes('terima kasih') || message.includes('thanks') || message.includes('thank')) {
            const responses = [
                "Sama-sama! Senang bisa bantu. Ada lagi yang mau ditanyakan?",
                "You're welcome! Kalau ada pertanyaan lain, jangan ragu ya!",
                "Sama-sama! Happy shopping audio gear ya!"
            ];
            return responses[Math.floor(Math.random() * responses.length)];
        }
        
        // Recommendation keywords
        if (message.includes('rekomendasi') || message.includes('recommend') || message.includes('saran')) {
            const responses = [
                "Saya bisa kasih rekomendasi! Untuk daily use, saya sarankan Feather Air. Untuk gaming, coba Neon Pulse. Budget dan preferensi Anda seperti apa?",
                "Bisa banget! Berdasarkan kebutuhan Anda, apa yang paling penting? Battery life, sound quality, atau ANC?",
                "Tentu! Beri tahu saya budget dan kebutuhan Anda, saya akan rekomendasikan yang paling cocok!"
            ];
            return responses[Math.floor(Math.random() * responses.length)];
        }
        
        // Purchase/Order keywords
        if (message.includes('beli') || message.includes('buy') || message.includes('order') || message.includes('pesan')) {
            const responses = [
                "Untuk pembelian, Anda bisa langsung klik produk yang diinginkan atau hubungi tim kami. Ada produk yang mau dipesan?",
                "Ready stock! Anda bisa langsung checkout atau saya bantu prosesnya. Mau beli yang mana?",
                "Bisa banget! Klik produk yang Anda suka atau saya bantu carikan yang best untuk Anda. Ada yang mau dipesan sekarang?"
            ];
            return responses[Math.floor(Math.random() * responses.length)];
        }
        
        // Help/Support keywords
        if (message.includes('bantu') || message.includes('help') || message.includes('support')) {
            const responses = [
                "Tentu saya bantu! Ada masalah dengan produk atau butuh rekomendasi?",
                "I'm here to help! Ada pertanyaan tentang produk atau teknologi audio?",
                "Siap bantu! Butuh info spesifikasi, komparasi, atau rekomendasi?"
            ];
            return responses[Math.floor(Math.random() * responses.length)];
        }
        
        // Default responses
        const defaultResponses = [
            "Hmm, interesting! Bisa jelaskan lebih detail tentang yang Anda cari?",
            "Saya paham. Mau tahu tentang produk spesifik atau butuh rekomendasi umum?",
            "Baik! Ada produk tertentu dari Taqdir Tech Audio yang ingin Anda tahu lebih lanjut?",
            "Saya bantu ya! Coba sebutkan kata kunci: headphone, earbud, harga, atau rekomendasi.",
            "Nice! Apa Anda lagi cari audio gear untuk gaming, daily use, atau profesional?"
        ];
        
        return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
    }
    
    // Function to add message to chat
    function addMessage(text, sender) {
        if (!chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const now = new Date();
        const timeString = now.toLocaleTimeString('id-ID', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        messageDiv.innerHTML = `
            <div class="message-content">
                <p>${text}</p>
            </div>
            <div class="message-time">${timeString}</div>
        `;
        
        chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Add animation
        messageDiv.style.opacity = '0';
        messageDiv.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            messageDiv.style.transition = 'all 0.3s ease';
            messageDiv.style.opacity = '1';
            messageDiv.style.transform = 'translateY(0)';
        }, 10);
    }
    
    // Close chat when clicking outside
    document.addEventListener('click', function(e) {
        if (chatPopup && chatPopup.classList.contains('show')) {
            if (!chatPopup.contains(e.target) && !chatButton.contains(e.target)) {
                chatPopup.classList.remove('show');
            }
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + K to open chat
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            if (chatButton) {
                chatButton.click();
            }
        }
        
        // Escape to close chat
        if (e.key === 'Escape' && chatPopup && chatPopup.classList.contains('show')) {
            chatPopup.classList.remove('show');
        }
    });
});