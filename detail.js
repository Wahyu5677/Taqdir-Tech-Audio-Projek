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

function setOrCreateMeta(nameOrProp, content, isProperty = false) {
    const selector = isProperty ? `meta[property="${nameOrProp}"]` : `meta[name="${nameOrProp}"]`;
    let el = document.head.querySelector(selector);
    if (!el) {
        el = document.createElement('meta');
        if (isProperty) {
            el.setAttribute('property', nameOrProp);
        } else {
            el.setAttribute('name', nameOrProp);
        }
        document.head.appendChild(el);
    }
    el.setAttribute('content', String(content || ''));
    return el;
}

function setCanonical(url) {
    let el = document.head.querySelector('link[rel="canonical"]');
    if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', 'canonical');
        document.head.appendChild(el);
    }
    el.setAttribute('href', String(url || ''));
    return el;
}

function setJsonLd(id, obj) {
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement('script');
        el.type = 'application/ld+json';
        el.id = id;
        document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(obj || {}, null, 0);
    return el;
}

function pickProductHighlights(item) {
    const out = [];
    const push = (label, value) => {
        const v = String(value || '').trim();
        if (!v || v === '-') return;
        out.push({ label, value: v });
    };
    push('Latency', item && item.latency);
    push('Baterai', item && item.battery);
    push('Bobot', item && item.weight);
    push('Warna', item && item.color);

    const badge = String(item && item.badge ? item.badge : '').toLowerCase();
    if (badge.includes('anc')) out.push({ label: 'Fitur', value: 'ANC / Noise Cancelling' });
    if (badge.includes('gaming') || badge.includes('latency')) out.push({ label: 'Use Case', value: 'Gaming Friendly' });
    if (badge.includes('bass')) out.push({ label: 'Sound', value: 'Bass Boost' });

    return out.slice(0, 5);
}

function safeText(value) {
    const v = String(value ?? '').trim();
    return v ? v : '-';
}

function getDetail() {
    const productDetail = document.getElementById("productDetail");
    if (!productDetail) {
        return;
    }
    
    // Show enhanced loading
    productDetail.innerHTML = `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <div class="loading-text">Loading Product Details...</div>
        </div>
    `;
    
    const params = new URLSearchParams(location.search);
    const productSlug = params.get("id");

    if(!productSlug) {
        productDetail.innerHTML = `
            <div class="loading-container">
                <div class="loading-text">ID Tidak Ditemukan!</div>
            </div>
        `;
        return;
    }

    (async () => {
        const { data: item, error } = await supabase
            .from('products')
            .select('id, slug, title, subtitle, detail_description, badge, price, color, battery, weight, latency, track_stock, stock_qty, is_active, product_images(image_url, sort_order)')
            .eq('slug', productSlug)
            .or('is_active.is.null,is_active.eq.true')
            .maybeSingle();

        if (error) {
            throw error;
        }

        if(!item) {
            productDetail.innerHTML = `
                <div class="loading-container">
                    <div class="loading-text">Produk Tidak Ditemukan!</div>
                </div>
            `;
            return;
        }

        const images = Array.isArray(item.product_images) ? item.product_images.slice() : [];
        images.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const imageUrls = images
            .map((x) => (x && x.image_url ? String(x.image_url) : ''))
            .filter(Boolean);
        const hero = imageUrls[0] ? String(imageUrls[0]) : '';

        const formatPrice = (value) => {
            const n = Number(value);
            if (Number.isFinite(n)) {
                return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
            }
            return String(value || '');
        };

        const badgeText = item && item.badge ? String(item.badge).trim() : '';
        const badgeHtml = badgeText ? `<span class="product-badge detail-badge">${badgeText}</span>` : '';
        const wishActive = getWishlist().includes(String(item.id));
        const wishLabel = wishActive ? 'Hapus dari wishlist' : 'Tambah ke wishlist';
        const wishChar = wishActive ? '♥' : '♡';

        const badgeLower = badgeText.toLowerCase();
        const priceNumber = Number(item.price) || 0;
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

        const abs = new URL(window.location.href);
        const canonical = abs.toString();
        const titleText = `${String(item.title || 'Produk')} || Taqdir Tech Audio`;
        const descText = String(item.subtitle || item.detail_description || 'Earphone pilihan untuk musik & gaming.').slice(0, 170);
        document.title = titleText;
        setCanonical(canonical);
        setOrCreateMeta('description', descText, false);
        setOrCreateMeta('og:title', String(item.title || 'Taqdir Tech Audio'), true);
        setOrCreateMeta('og:description', descText, true);
        setOrCreateMeta('og:type', 'product', true);
        if (hero) setOrCreateMeta('og:image', hero, true);
        setOrCreateMeta('og:url', canonical, true);

        setJsonLd('jsonld-product', {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: String(item.title || ''),
            description: descText,
            image: imageUrls.length ? imageUrls : (hero ? [hero] : undefined),
            brand: { '@type': 'Brand', name: 'Taqdir Tech Audio' },
            offers: {
                '@type': 'Offer',
                priceCurrency: 'IDR',
                price: Number(priceNumber || 0),
                availability: (Boolean(item && item.track_stock) && Number(item && item.stock_qty) <= 0)
                    ? 'https://schema.org/OutOfStock'
                    : 'https://schema.org/InStock',
                url: canonical,
            },
        });

        const track = Boolean(item && item.track_stock);
        const qtyNumber = Number(item && item.stock_qty);
        const stockQty = Number.isFinite(qtyNumber) ? Math.max(0, Math.floor(qtyNumber)) : 0;
        const outOfStock = track && stockQty <= 0;
        const stockHtml = track
            ? (outOfStock
                ? `<span class="stock-pill stock-pill--out">Habis</span>`
                : stockQty <= 5
                    ? `<span class="stock-pill stock-pill--low">Menipis (${stockQty})</span>`
                    : `<span class="stock-pill">Stok ${stockQty}</span>`)
            : `<span class="stock-pill">Ready</span>`;

        const highlights = pickProductHighlights(item);
        const highlightsHtml = highlights.length ? `
          <div class="detail-highlights" aria-label="Highlight produk">
            ${highlights
                .map((h) => {
                    return `
                      <div class="detail-highlight">
                        <div class="detail-highlight__label">${String(h.label)}</div>
                        <div class="detail-highlight__value">${String(h.value)}</div>
                      </div>
                    `;
                })
                .join('')}
          </div>
        ` : '';

        const trustHtml = `
          <div class="detail-trust" aria-label="Info layanan">
            <div class="detail-trust__item">
              <div class="detail-trust__title">Estimasi kirim</div>
              <div class="detail-trust__desc">1–3 hari (Jawa) · 3–7 hari (luar Jawa)</div>
            </div>
            <div class="detail-trust__item">
              <div class="detail-trust__title">Garansi & retur</div>
              <div class="detail-trust__desc">Klaim/retur via WhatsApp (syarat berlaku)</div>
            </div>
            <div class="detail-trust__item">
              <div class="detail-trust__title">Pembayaran</div>
              <div class="detail-trust__desc">Transfer bank · Konfirmasi via WhatsApp</div>
            </div>
          </div>
        `;

        const galleryThumbs = imageUrls.length > 1
            ? `
              <div class="detail-thumbs" role="list" aria-label="Thumbnail gambar">
                ${imageUrls
                    .slice(0, 8)
                    .map((url, idx) => {
                        const active = idx === 0 ? ' is-active' : '';
                        return `
                          <button class="detail-thumb${active}" type="button" data-gallery-thumb="${idx}" aria-label="Lihat gambar ${idx + 1}" style="background-image:url('${url}')"></button>
                        `;
                    })
                    .join('')}
              </div>
            `
            : '';

        const galleryHtml = `
          <div class="detail-gallery" aria-label="Galeri produk">
            <button class="detail-gallery__main" type="button" data-gallery-open="true" aria-label="Perbesar gambar" style="${hero ? `background-image:url('${hero}')` : ''}">
              <span class="detail-gallery__hint">Klik untuk zoom</span>
            </button>
            ${galleryThumbs}
          </div>
        `;

        productDetail.innerHTML = `
            <div class="detail-card" data-accent="${item.id}">
                ${galleryHtml}
                <div class="detail-body">
                    <a href="index.html" class="back">&#8592; Kembali</a>
                    <div class="detail-meta">
                      ${badgeHtml}
                      <button class="wishlist-btn detail-wishlist" type="button" data-wishlist-toggle="${item.id}" aria-pressed="${wishActive ? 'true' : 'false'}" aria-label="${wishLabel}">${wishChar}</button>
                    </div>
                    <h1>${item.title}</h1>
                    <p class="detail-subtitle">${safeText(item.subtitle) === '-' ? '' : safeText(item.subtitle)}</p>
                    <div class="detail-price">${priceHtml}</div>
                    <div class="detail-stock" aria-label="Stok produk">${stockHtml}</div>
                    ${highlightsHtml}
                    <div id="detailBody"></div>
                    <div class="qty-selector" aria-label="Pilih jumlah pembelian">
                        <button class="qty-selector__btn" type="button" id="qtyMinus" aria-label="Kurangi jumlah">-</button>
                        <input class="qty-selector__input" id="qtyInput" type="number" inputmode="numeric" min="1" max="${track ? Math.max(1, Math.min(99, stockQty)) : 99}" value="1" aria-label="Jumlah" ${outOfStock ? 'disabled' : ''} />
                        <button class="qty-selector__btn" type="button" id="qtyPlus" aria-label="Tambah jumlah">+</button>
                    </div>
                    <button class="catalog-controls__clear detail-cta" type="button" id="addToCartDetail" data-product-id="${item.id}" ${outOfStock ? 'disabled' : ''}>${outOfStock ? 'Stok Habis' : 'Tambah ke Cart'}</button>
                    ${trustHtml}
                    <div class="detail-stats">
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
                            <span class="label">Harga</span>
                            <span class="value">${formatPrice(item.price)}</span>
                        </div>
                    </div>
                    <div class="detail-related" id="relatedProducts" aria-label="Produk serupa">
                      <div class="detail-related__head">
                        <h2 class="detail-related__title">Produk Serupa</h2>
                        <p class="detail-related__subtitle">Alternatif lain yang mungkin kamu suka.</p>
                      </div>
                      <div class="detail-related__grid" id="relatedGrid"></div>
                    </div>
                </div>
            </div>
            <div class="modal" id="zoomModal" aria-hidden="true">
              <div class="modal__backdrop" data-close="zoom"></div>
              <div class="modal__panel" role="dialog" aria-label="Zoom gambar">
                <div class="modal__header">
                  <h3 class="modal__title">Preview</h3>
                  <button class="modal__close" type="button" data-close="zoom">×</button>
                </div>
                <div class="modal__body">
                  <div class="detail-zoom" id="zoomBody"></div>
                </div>
              </div>
            </div>
        `;

        const detailBody = document.getElementById("detailBody");
        const paragraphs = (item.detail_description || "").split(/\n+/);
        paragraphs.forEach((text, index) => {
            const trimmed = text.trim();
            if (!trimmed) {
                return;
            }
            const p = document.createElement("p");
            p.textContent = trimmed;
            p.style.animationDelay = `${index * 0.1}s`;
            p.style.opacity = "0";
            p.style.transform = "translateY(20px)";
            p.style.animation = "slideUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards";
            detailBody.appendChild(p);
        })

        const setMainImage = (url) => {
            const main = productDetail.querySelector('[data-gallery-open]');
            if (main && main instanceof HTMLElement) {
                main.style.backgroundImage = url ? `url('${url}')` : '';
                main.setAttribute('data-main-url', url ? String(url) : '');
            }
        };

        setMainImage(hero);

        const cta = document.getElementById('addToCartDetail');
        if (cta && cta instanceof HTMLButtonElement) {
            cta.setAttribute('data-track-stock', track ? 'true' : 'false');
            cta.setAttribute('data-stock-qty', String(stockQty));
        }

        try {
            productDetail.setAttribute('data-gallery-images', JSON.stringify(imageUrls));
        } catch {
            productDetail.removeAttribute('data-gallery-images');
        }

        const relatedGrid = document.getElementById('relatedGrid');
        if (relatedGrid) {
            relatedGrid.innerHTML = `
              <div class="loading-container">
                <div class="loading-spinner"></div>
                <div class="loading-text">Memuat produk serupa...</div>
              </div>
            `;
        }

        const loadRelated = async () => {
            if (!relatedGrid) return;
            try {
                const { data, error: relErr } = await supabase
                    .from('products')
                    .select('id, slug, title, subtitle, badge, price, is_active, product_images(image_url, sort_order)')
                    .neq('id', item.id)
                    .or('is_active.is.null,is_active.eq.true')
                    .limit(6);
                if (relErr) throw relErr;

                const rel = Array.isArray(data) ? data : [];
                if (!rel.length) {
                    relatedGrid.textContent = '';
                    return;
                }

                const formatPriceShort = (value) => {
                    const n = Number(value);
                    if (Number.isFinite(n)) {
                        return n.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
                    }
                    return String(value || '');
                };

                relatedGrid.textContent = '';
                rel.forEach((p) => {
                    const card = document.createElement('a');
                    card.className = 'related-card';
                    card.href = `detail.html?id=${encodeURIComponent(String(p.slug || ''))}`;
                    const imgs = Array.isArray(p.product_images) ? p.product_images.slice() : [];
                    imgs.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
                    const thumb = imgs[0] && imgs[0].image_url ? String(imgs[0].image_url) : '';
                    if (thumb) card.style.backgroundImage = `url('${thumb}')`;
                    card.innerHTML = `
                      <div class="related-card__body">
                        <div class="related-card__title">${String(p.title || '')}</div>
                        <div class="related-card__subtitle">${String(p.subtitle || '')}</div>
                        <div class="related-card__price">${formatPriceShort(p.price)}</div>
                      </div>
                    `;
                    relatedGrid.appendChild(card);
                });
            } catch (err) {
                console.error('Gagal memuat related products:', err);
                relatedGrid.textContent = '';
            }
        };

        loadRelated();
    })().catch((err) => {
        console.error('Gagal memuat detail produk dari Supabase:', err);
        productDetail.innerHTML = `
            <div class="loading-container">
                <div class="loading-text">Gagal memuat data produk. Cek koneksi internet atau coba lagi nanti.</div>
            </div>
        `;
    });
}

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

    let user = null;
    let authMode = 'login';
    let currentShippingCost = 0;
    let authCooldownInterval = null;

    const setModalOpen = (modal, open) => {
        if (!modal) return;
        modal.classList.toggle('show', open);
        modal.setAttribute('aria-hidden', open ? 'false' : 'true');
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

    const header = document.querySelector('.site-header');
    const onScrollCompact = () => {
        if (!header) return;
        header.classList.toggle('is-compact', window.scrollY > 12);
    };
    window.addEventListener('scroll', onScrollCompact, { passive: true });
    onScrollCompact();

    onAuthStateChange(async (u) => {
        user = u;
        updateAuthButtons();
        await syncAdminLink(user);
        await renderCart();
        const userLabel = document.getElementById('userLabel');
        if (userLabel) {
            userLabel.textContent = user && user.email ? `Hi, ${user.email}` : '';
        }
    });

    refreshUser().then(() => syncAdminLink(user));

    document.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t instanceof HTMLElement)) return;
        const close = t.getAttribute('data-close');
        if (close === 'auth') setModalOpen(authModal, false);
        if (close === 'cart') setModalOpen(cartModal, false);
        if (close === 'zoom') {
            const zoomModal = document.getElementById('zoomModal');
            setModalOpen(zoomModal, false);
        }

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
    });

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
                } else {
                    await signInWithEmail(email, password);
                    setModalOpen(authModal, false);
                }
            } catch (err) {
                const status = err && typeof err.status === 'number' ? err.status : null;
                if (status === 429) {
                    const msg = String(err && err.message ? err.message : '');
                    const m = msg.match(/after\s+(\d+)\s*seconds?/i);
                    const seconds = m ? Number(m[1]) : 30;
                    startAuthCooldown(seconds);
                    return;
                }
                if (authHint) authHint.textContent = err && err.message ? err.message : 'Gagal autentikasi.';
            }
        });
    }

    if (cartButton) {
        cartButton.addEventListener('click', async () => {
            if (!user) {
                setAuthMode('login');
                setModalOpen(authModal, true);
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

    document.addEventListener('click', async (e) => {
        const t = e.target;
        if (!(t instanceof HTMLElement)) return;

        const thumb = t.getAttribute('data-gallery-thumb');
        if (thumb !== null) {
            e.preventDefault();
            e.stopPropagation();
            const wrap = document.getElementById('productDetail');
            if (!wrap) return;
            let urls = [];
            try {
                const raw = wrap.getAttribute('data-gallery-images');
                urls = raw ? JSON.parse(raw) : [];
            } catch {
                urls = [];
            }
            const idx = Math.max(0, Math.min(urls.length - 1, Number(thumb) || 0));
            const url = urls[idx] ? String(urls[idx]) : '';
            const main = wrap.querySelector('[data-gallery-open]');
            if (main && main instanceof HTMLElement) {
                main.style.backgroundImage = url ? `url('${url}')` : '';
                main.setAttribute('data-main-url', url ? String(url) : '');
            }
            const thumbs = wrap.querySelectorAll('.detail-thumb');
            thumbs.forEach((b) => {
                if (!(b instanceof HTMLElement)) return;
                const bIdx = b.getAttribute('data-gallery-thumb');
                b.classList.toggle('is-active', bIdx === String(idx));
            });
            return;
        }

        const open = t.closest('[data-gallery-open]');
        if (open) {
            e.preventDefault();
            const wrap = document.getElementById('productDetail');
            const mainUrl = open instanceof HTMLElement ? String(open.getAttribute('data-main-url') || '') : '';
            if (!mainUrl) return;
            const zoomModal = document.getElementById('zoomModal');
            const zoomBody = document.getElementById('zoomBody');
            if (zoomBody) {
                zoomBody.innerHTML = `<img class="detail-zoom__img" src="${mainUrl}" alt="Preview" loading="eager" />`;
            }
            setModalOpen(zoomModal, true);
            return;
        }

        const wishToggle = t.getAttribute('data-wishlist-toggle');
        if (wishToggle) {
            e.preventDefault();
            e.stopPropagation();
            const res = toggleWishlist(wishToggle);
            t.textContent = res.active ? '♥' : '♡';
            t.setAttribute('aria-pressed', res.active ? 'true' : 'false');
            t.setAttribute('aria-label', res.active ? 'Hapus dari wishlist' : 'Tambah ke wishlist');
            toast('success', res.active ? 'Masuk wishlist' : 'Dihapus dari wishlist', '');
            return;
        }

        if (t.id === 'qtyMinus' || t.id === 'qtyPlus') {
            const input = document.getElementById('qtyInput');
            if (!(input instanceof HTMLInputElement)) return;
            const current = Number(input.value);
            const safeCurrent = Number.isFinite(current) ? current : 1;
            const delta = t.id === 'qtyPlus' ? 1 : -1;
            const minAttr = Number(input.getAttribute('min'));
            const maxAttr = Number(input.getAttribute('max'));
            const min = Number.isFinite(minAttr) ? minAttr : 1;
            const max = Number.isFinite(maxAttr) ? maxAttr : 99;
            const next = Math.min(max, Math.max(min, safeCurrent + delta));
            input.value = String(next);
            return;
        }

        if (t.id !== 'addToCartDetail') return;

        const trackStock = t.getAttribute('data-track-stock') === 'true';
        const stockQty = Math.max(0, Math.floor(Number(t.getAttribute('data-stock-qty') || 0)));
        if (trackStock && stockQty <= 0) {
            toast('error', 'Stok habis', 'Produk ini sedang kosong.');
            return;
        }

        const productId = t.getAttribute('data-product-id');
        if (!productId) return;

        if (!user) {
            setAuthMode('login');
            setModalOpen(authModal, true);
            toast('info', 'Login dulu', 'Untuk menambah ke cart, silakan login.');
            return;
        }

        try {
            const input = document.getElementById('qtyInput');
            const rawQty = input && input instanceof HTMLInputElement ? Number(input.value) : 1;
            let qty = Math.min(99, Math.max(1, Number.isFinite(rawQty) ? rawQty : 1));
            if (trackStock) {
                qty = Math.min(qty, Math.max(1, stockQty));
            }
            await addToCart(user.id, productId, qty);
            await renderCart();
            setModalOpen(cartModal, true);
            toast('success', 'Masuk ke cart', `Jumlah: ${qty}`);
        } catch (err) {
            console.error('Add to cart gagal (detail):', err);
            if (cartHint) cartHint.textContent = (err && err.message) ? err.message : 'Gagal menambah ke cart.';
            toast('error', 'Gagal menambah cart', err && err.message ? err.message : 'Silakan coba lagi.');
        }
    });

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
                console.error('Checkout gagal (detail):', err);
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

}

getDetail();

document.addEventListener('DOMContentLoaded', function () {
    initCommerceUI();

    const backToTop = document.getElementById('backToTop');

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
});