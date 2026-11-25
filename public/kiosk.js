/**
 * Jom Order - Kiosk Client Logic
 */

let kioskState = {
  storeName: 'Jom Order',
  storeBanner: '',
  isStoreOpen: true,
  categories: [],
  items: [],
  selectedCategory: 'all',
  cart: [], // { item, quantity }
  orderType: 'dine_in', // 'dine_in' atau 'takeaway'
  activeOrderId: null,
  pollTimer: null,
};

// Main Inisialisasi
document.addEventListener('DOMContentLoaded', () => {
  initKiosk();
  setupEventListeners();
});

// Ambil data permulaan dari server
async function initKiosk() {
  try {
    const res = await fetch('/api/kiosk/init');
    const data = await res.json();

    if (!data.success) {
      showToast('Gagal memuatkan maklumat kedai', 'error');
      return;
    }

    kioskState.storeName = data.store_name || 'Jom Order';
    kioskState.storeBanner = data.store_banner || '';
    kioskState.isStoreOpen = data.store_open !== false;
    kioskState.categories = data.categories || [];
    kioskState.items = data.items || [];

    // Kemaskini UI Header & Banner
    document.getElementById('storeNameText').textContent = kioskState.storeName;
    const bannerEl = document.getElementById('announcementBanner');
    const bannerTextEl = document.getElementById('bannerText');
    if (kioskState.storeBanner && kioskState.storeBanner.trim()) {
      bannerTextEl.textContent = kioskState.storeBanner;
      bannerEl.style.display = 'flex';
    } else {
      bannerEl.style.display = 'none';
    }

    // Status Buka/Tutup Kedai
    const statusBadge = document.getElementById('storeStatusBadge');
    const statusLabel = document.getElementById('storeStatusLabel');
    if (kioskState.isStoreOpen) {
      statusBadge.className = 'store-status-badge status-open';
      statusLabel.textContent = 'Dibuka';
    } else {
      statusBadge.className = 'store-status-badge status-closed';
      statusLabel.textContent = 'Ditutup';
      showToast('Perhatian: Kedai sedang ditutup buat masa ini.', 'error');
    }

    renderCategories();
    renderMenuGrid();
    updateCartUI();
  } catch (err) {
    console.error('Error init kiosk:', err);
    showToast('Ralat sambungan pelayan.', 'error');
  }
}

// Pasang Event Listeners
function setupEventListeners() {
  // Pilihan Makan Sini / Bungkus
  const btnDineIn = document.getElementById('btnDineIn');
  const btnTakeaway = document.getElementById('btnTakeaway');
  const tableRow = document.getElementById('tableRow');

  btnDineIn.addEventListener('click', () => {
    kioskState.orderType = 'dine_in';
    btnDineIn.classList.add('active');
    btnTakeaway.classList.remove('active');
    tableRow.style.display = 'block';
  });

  btnTakeaway.addEventListener('click', () => {
    kioskState.orderType = 'takeaway';
    btnTakeaway.classList.add('active');
    btnDineIn.classList.remove('active');
    tableRow.style.display = 'none';
  });

  // Kosongkan Troli
  document.getElementById('btnClearCart').addEventListener('click', () => {
    if (kioskState.cart.length === 0) return;
    if (confirm('Kosongkan semua pesanan dalam troli?')) {
      kioskState.cart = [];
      updateCartUI();
    }
  });

  // Hantar Pesanan
  document.getElementById('btnSubmitOrder').addEventListener('click', submitOrder);

  // Buat Pesanan Baharu
  document.getElementById('btnNewOrder').addEventListener('click', () => {
    closeSuccessModal();
    kioskState.cart = [];
    document.getElementById('inputCustName').value = '';
    document.getElementById('inputTableNo').value = '';
    document.getElementById('inputNotes').value = '';
    updateCartUI();
  });
}

// Papar Kategori
function renderCategories() {
  const bar = document.getElementById('categoryBar');
  bar.innerHTML = `
    <button class="cat-btn ${kioskState.selectedCategory === 'all' ? 'active' : ''}" data-cat-id="all">
      <span>✨</span> Semua Menu
    </button>
  `;

  kioskState.categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `cat-btn ${kioskState.selectedCategory === cat.id ? 'active' : ''}`;
    btn.dataset.catId = cat.id;
    btn.innerHTML = `<span>${cat.icon || '📁'}</span> ${escapeHtml(cat.name)}`;
    bar.appendChild(btn);
  });

  // Klik Kategori
  bar.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      bar.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      kioskState.selectedCategory = btn.dataset.catId;
      renderMenuGrid();
    });
  });
}

// Papar Kad Menu
function renderMenuGrid() {
  const grid = document.getElementById('menuGrid');
  grid.innerHTML = '';

  const filteredItems = kioskState.items.filter(item => {
    if (kioskState.selectedCategory === 'all') return true;
    return item.category_id === kioskState.selectedCategory;
  });

  if (filteredItems.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #64748b;">
        <p style="font-size: 2.5rem; margin-bottom: 0.5rem;">🍽️</p>
        <p><strong>Tiada menu dalam kategori ini buat masa ini.</strong></p>
      </div>
    `;
    return;
  }

  filteredItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'menu-card';

    // Bahagian Gambar / Emoji Fallback
    let mediaHtml = '';
    if (item.image_id) {
      mediaHtml = `
        <div class="menu-media">
          <img
            src="/api/images/${encodeURIComponent(item.image_id)}"
            alt="${escapeHtml(item.name)}"
            class="menu-img"
            loading="lazy"
            onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'menu-fallback-emoji\\'>${item.emoji || '🍲'}</div>';"
          />
        </div>
      `;
    } else {
      mediaHtml = `
        <div class="menu-media">
          <div class="menu-fallback-emoji">${item.emoji || '🍲'}</div>
        </div>
      `;
    }

    card.innerHTML = `
      ${mediaHtml}
      <div class="menu-details">
        <h3 class="menu-title">${escapeHtml(item.name)}</h3>
        <p class="menu-desc">${escapeHtml(item.description || '')}</p>
        <div class="menu-footer">
          <div class="menu-price"><small>RM</small>${parseFloat(item.price).toFixed(2)}</div>
          <button type="button" class="btn-add-item" data-item-id="${item.id}">
            <span>+</span> Tambah
          </button>
        </div>
      </div>
    `;

    // Klik butang Tambah
    card.querySelector('.btn-add-item').addEventListener('click', () => {
      addToCart(item);
    });

    grid.appendChild(card);
  });
}

// Operasi Troli
function addToCart(item) {
  if (!kioskState.isStoreOpen) {
    showToast('Maaf, kedai sedang ditutup. Tidak dapat membuat pesanan.', 'error');
    return;
  }

  const existing = kioskState.cart.find(c => c.item.id === item.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    kioskState.cart.push({ item, quantity: 1 });
  }

  updateCartUI();
  showToast(`Ditambah: ${item.name}`, 'success');
}

function updateCartQty(itemId, delta) {
  const index = kioskState.cart.findIndex(c => c.item.id === itemId);
  if (index === -1) return;

  kioskState.cart[index].quantity += delta;
  if (kioskState.cart[index].quantity <= 0) {
    kioskState.cart.splice(index, 1);
  }

  updateCartUI();
}

function updateCartUI() {
  const list = document.getElementById('cartItemsList');
  const badge = document.getElementById('cartBadgeCount');
  const totalQtyEl = document.getElementById('summaryTotalQty');
  const totalPriceEl = document.getElementById('summaryTotalPrice');
  const submitBtn = document.getElementById('btnSubmitOrder');

  let totalQty = 0;
  let totalPrice = 0;

  if (kioskState.cart.length === 0) {
    list.innerHTML = `
      <div class="cart-empty-state">
        <div class="cart-empty-icon">🍽️</div>
        <p><strong>Troli anda masih kosong</strong></p>
        <p style="font-size: 0.85rem; margin-top: 0.35rem;">Tekan menu di sebelah kiri untuk menambah ke troli.</p>
      </div>
    `;
    badge.textContent = '0';
    totalQtyEl.textContent = '0';
    totalPriceEl.textContent = 'RM 0.00';
    submitBtn.disabled = true;
    return;
  }

  list.innerHTML = '';
  kioskState.cart.forEach(entry => {
    const itemSubtotal = entry.item.price * entry.quantity;
    totalQty += entry.quantity;
    totalPrice += itemSubtotal;

    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHtml(entry.item.name)}</div>
        <div class="cart-item-unit-price">RM ${parseFloat(entry.item.price).toFixed(2)} / unit</div>
      </div>
      <div class="cart-item-controls">
        <button type="button" class="btn-qty btn-minus" data-id="${entry.item.id}">-</button>
        <span class="cart-item-qty">${entry.quantity}</span>
        <button type="button" class="btn-qty btn-plus" data-id="${entry.item.id}">+</button>
      </div>
      <div class="cart-item-total">RM ${itemSubtotal.toFixed(2)}</div>
    `;

    row.querySelector('.btn-minus').addEventListener('click', () => updateCartQty(entry.item.id, -1));
    row.querySelector('.btn-plus').addEventListener('click', () => updateCartQty(entry.item.id, 1));

    list.appendChild(row);
  });

  badge.textContent = totalQty;
  totalQtyEl.textContent = totalQty;
  totalPriceEl.textContent = `RM ${totalPrice.toFixed(2)}`;

  // Butang hantar hanya aktif jika kedai buka & ada item
  submitBtn.disabled = !kioskState.isStoreOpen || totalQty === 0;
}

// Hantar Pesanan
async function submitOrder() {
  if (kioskState.cart.length === 0) return;
  if (!kioskState.isStoreOpen) {
    showToast('Maaf, kedai sedang ditutup.', 'error');
    return;
  }

  const submitBtn = document.getElementById('btnSubmitOrder');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span>⏳ Menghantar Pesanan...</span>';

  const orderType = kioskState.orderType;
  const customerName = document.getElementById('inputCustName').value.trim();
  const tableNumber = document.getElementById('inputTableNo').value.trim();
  const notes = document.getElementById('inputNotes').value.trim();

  const payload = {
    order_type: orderType,
    customer_name: customerName,
    table_number: orderType === 'dine_in' ? tableNumber : '',
    notes,
    items: kioskState.cart.map(c => ({
      item_id: c.item.id,
      quantity: c.quantity,
    })),
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(data.error || 'Gagal menghantar pesanan.', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>✅ Hantar Pesanan</span>';
      return;
    }

    // Bunyikan notifikasi kejayaan
    playSuccessChime();

    // Paparkan modal nombor giliran
    openSuccessModal(data);
  } catch (err) {
    console.error('Error submitting order:', err);
    showToast('Ralat rangkaian semasa menghantar pesanan.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>✅ Hantar Pesanan</span>';
  }
}

// Papar Modal Kejayaan & Mulakan Live Tracking
function openSuccessModal(orderData) {
  kioskState.activeOrderId = orderData.order_id;

  document.getElementById('modalQueueNumber').textContent = orderData.queue_number;
  document.getElementById('modalOrderTypeLabel').textContent =
    orderData.order_type === 'takeaway' ? '🛍️ Bungkus (Takeaway)' : '🍽️ Makan Sini (Dine In)';

  updateLiveStatusUI(orderData.status || 'new');

  // Ringkasan item yang dipesan
  const summaryEl = document.getElementById('modalOrderItemsSummary');
  summaryEl.innerHTML = `<strong>Pesanan #${orderData.order_id} (Jumlah: RM ${parseFloat(orderData.total_amount).toFixed(2)}):</strong><br>`;
  kioskState.cart.forEach(c => {
    summaryEl.innerHTML += `• ${c.quantity}x ${escapeHtml(c.item.name)} (RM ${(c.item.price * c.quantity).toFixed(2)})<br>`;
  });

  const modal = document.getElementById('orderSuccessModal');
  modal.classList.add('open');

  // Mulakan polling live status setiap 3.5 saat
  if (kioskState.pollTimer) clearInterval(kioskState.pollTimer);
  kioskState.pollTimer = setInterval(() => {
    pollOrderStatus(orderData.order_id);
  }, 3500);
}

// Tutup Modal Kejayaan
function closeSuccessModal() {
  if (kioskState.pollTimer) {
    clearInterval(kioskState.pollTimer);
    kioskState.pollTimer = null;
  }
  const modal = document.getElementById('orderSuccessModal');
  modal.classList.remove('open');
}

// Semak status pesanan langsung (Polling)
async function pollOrderStatus(orderId) {
  try {
    const res = await fetch(`/api/orders/${orderId}`);
    if (!res.ok) return;

    const data = await res.json();
    if (data.success && data.order) {
      updateLiveStatusUI(data.order.status);
    }
  } catch (e) {
    // Abaikan ralat sementara polling
  }
}

// Kemaskini Lencana Status Pesanan
function updateLiveStatusUI(status) {
  const badge = document.getElementById('modalLiveStatusBadge');
  const text = document.getElementById('modalLiveStatusText');

  badge.className = `order-live-status-pill status-${status}`;

  switch (status) {
    case 'new':
      text.textContent = 'Pesanan Diterima di Dapur';
      break;
    case 'preparing':
      text.textContent = '🍳 Sedang Dimasak / Disediakan';
      break;
    case 'ready':
      text.textContent = '🔔 Sedia Diambil di Kaunter!';
      break;
    case 'completed':
      text.textContent = '✨ Pesanan Selesai. Selamat Menjamu Selera!';
      break;
    case 'cancelled':
      text.textContent = '❌ Pesanan Dibatalkan';
      break;
    default:
      text.textContent = status;
  }
}

// Web Audio API Ding / Chime Bunyi Kejayaan
function playSuccessChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const playTone = (freq, start, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0.2, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };

    // Nada melodi sedap (C5 -> E5 -> G5)
    playTone(523.25, 0, 0.2);
    playTone(659.25, 0.15, 0.2);
    playTone(783.99, 0.3, 0.45);
  } catch (e) {
    // Audio tidak disokong atau dihalang browser
  }
}

// Notifikasi Toast
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : ''}`;
  toast.textContent = message;

  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

// Escape HTML Utility
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
