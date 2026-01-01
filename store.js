import { supabase } from './supabaseClient.js';

function normalizeEmail(input) {
  return String(input ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .replace(/[＠]/g, '@')
    .replace(/[．。｡]/g, '.')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[“”„‟]/g, '')
    .replace(/[‘’‚‛]/g, '')
    .toLowerCase();
}

export async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

export async function signUpWithEmail(email, password) {
  const normalizedEmail = normalizeEmail(email);
  if (typeof window !== 'undefined' && window.__DEBUG_AUTH) {
    console.log('[auth] signUp email:', JSON.stringify(normalizedEmail));
  }
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmail(email, password) {
  const normalizedEmail = normalizeEmail(email);
  if (typeof window !== 'undefined' && window.__DEBUG_AUTH) {
    console.log('[auth] signIn email:', JSON.stringify(normalizedEmail));
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
}

async function getActiveCart(userId) {
  const { data, error } = await supabase
    .from('carts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function ensureActiveCart(userId) {
  const existing = await getActiveCart(userId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from('carts')
    .insert({ user_id: userId, status: 'active' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function getCartItems(userId) {
  const cart = await ensureActiveCart(userId);

  const { data, error } = await supabase
    .from('cart_items')
    .select('id, qty, unit_price, product:products(id, slug, title, subtitle)')
    .eq('cart_id', cart.id);

  if (error) throw error;

  const items = Array.isArray(data) ? data : [];
  const totalQty = items.reduce((sum, it) => sum + (it.qty || 0), 0);
  const totalAmount = items.reduce((sum, it) => sum + (Number(it.unit_price || 0) * Number(it.qty || 0)), 0);

  return { cart, items, totalQty, totalAmount };
}

export async function addToCart(userId, productId, qty = 1) {
  const cart = await ensureActiveCart(userId);

  const { data: existing, error: existingError } = await supabase
    .from('cart_items')
    .select('id, qty')
    .eq('cart_id', cart.id)
    .eq('product_id', productId)
    .maybeSingle();

  if (existingError) throw existingError;

  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id, price, title, track_stock, stock_qty')
    .eq('id', productId)
    .single();

  if (productError) throw productError;

  const unitPrice = Number(product.price || 0);

  const trackStock = Boolean(product && product.track_stock);
  const stockNum = Number(product && product.stock_qty);
  const stockQty = Number.isFinite(stockNum) ? Math.max(0, Math.floor(stockNum)) : 0;
  const requestedQty = Number.isFinite(Number(qty)) ? Math.max(1, Math.floor(Number(qty))) : 1;
  const existingQty = existing && Number.isFinite(Number(existing.qty)) ? Math.max(0, Math.floor(Number(existing.qty))) : 0;

  if (trackStock) {
    if (stockQty <= 0) {
      throw new Error('Stok habis.');
    }
    if (existingQty + requestedQty > stockQty) {
      throw new Error(`Stok tidak cukup. Sisa stok: ${stockQty}.`);
    }
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('cart_items')
      .update({ qty: (existing.qty || 0) + requestedQty, unit_price: unitPrice })
      .eq('id', existing.id);

    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await supabase
      .from('cart_items')
      .insert({ cart_id: cart.id, product_id: productId, qty: requestedQty, unit_price: unitPrice });

    if (insertError) throw insertError;
  }

  return getCartItems(userId);
}

export async function removeCartItem(userId, cartItemId) {
  await ensureActiveCart(userId);
  const { error } = await supabase.from('cart_items').delete().eq('id', cartItemId);
  if (error) throw error;
  return getCartItems(userId);
}

export async function getShippingProvinces() {
  const { data, error } = await supabase
    .from('shipping_rates')
    .select('province')
    .eq('is_active', true)
    .order('province', { ascending: true });

  if (error) throw error;
  const provinces = Array.from(new Set((Array.isArray(data) ? data : []).map((r) => String(r.province || '').trim()).filter(Boolean)));
  provinces.sort((a, b) => a.localeCompare(b));
  return provinces;
}

export async function getShippingCities(province) {
  const p = String(province || '').trim();
  if (!p) return [];

  const { data, error } = await supabase
    .from('shipping_rates')
    .select('city')
    .eq('is_active', true)
    .eq('province', p)
    .order('city', { ascending: true });

  if (error) throw error;
  const cities = Array.from(new Set((Array.isArray(data) ? data : []).map((r) => String(r.city || '').trim()).filter(Boolean)));
  cities.sort((a, b) => a.localeCompare(b));
  return cities;
}

export async function getShippingCost(province, city) {
  const p = String(province || '').trim();
  const c = String(city || '').trim();
  if (!p || !c) return 0;

  const { data, error } = await supabase
    .from('shipping_rates')
    .select('cost')
    .eq('is_active', true)
    .eq('province', p)
    .eq('city', c)
    .maybeSingle();

  if (error) throw error;
  const cost = Number(data?.cost || 0);
  return Number.isFinite(cost) ? cost : 0;
}

export async function checkout(userId, shipping = null) {
  const { cart, items, totalAmount } = await getCartItems(userId);

  if (!items.length) {
    return { ok: false, reason: 'empty_cart' };
  }

  const province = shipping && shipping.province ? String(shipping.province).trim() : '';
  const city = shipping && shipping.city ? String(shipping.city).trim() : '';
  const recipient = shipping && shipping.recipient_name ? String(shipping.recipient_name).trim() : '';
  const phone = shipping && shipping.phone ? String(shipping.phone).trim() : '';
  const street = shipping && shipping.street ? String(shipping.street).trim() : '';

  const shippingCost = await getShippingCost(province, city);
  const grandTotal = Number(totalAmount || 0) + Number(shippingCost || 0);

  const orderNumber = shipping && shipping.order_number ? String(shipping.order_number) : null;
  const computedOrderNumber = orderNumber || null;
  const shippingAddress = [recipient, phone, street, city, province].filter(Boolean).join(' | ');

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: userId,
      status: 'pending',
      order_number: computedOrderNumber,
      subtotal_amount: totalAmount,
      shipping_cost: shippingCost,
      total_amount: grandTotal,
      shipping_province: province || null,
      shipping_city: city || null,
      shipping_address: shippingAddress || null,
    })
    .select('*')
    .single();

  if (orderError) throw orderError;

  const orderItems = items.map((it) => ({
    order_id: order.id,
    product_id: it.product.id,
    qty: it.qty,
    unit_price: it.unit_price,
  }));

  const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
  if (itemsError) throw itemsError;

  const { error: cartUpdateError } = await supabase
    .from('carts')
    .update({ status: 'converted' })
    .eq('id', cart.id);

  if (cartUpdateError) throw cartUpdateError;

  const { error: clearError } = await supabase.from('cart_items').delete().eq('cart_id', cart.id);
  if (clearError) throw clearError;

  await ensureActiveCart(userId);

  return { ok: true, order };
}
