/**
 * Jom Order - Admin CMS Logic
 */

let adminState = {
  token: sessionStorage.getItem('jom_admin_token') || '',
  categories: [],
  items: [],
  orders: [],
  settings: {
    store_name: 'Jom Order',
    store_banner: '',
    store_open: true,
  },
  ordersPollTimer: null,
};

// Inisialisasi
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();

  if (adminState.token) {
    showAdminDashboard();
  } else {
    showLoginScreen();
  }
});

// Setup Semua Event Listener
function setupEventListeners() {
  // Borang Log Masuk
  document.getElementById('loginForm').addEventListener('submit', handleLogin);

  // Butang Log Keluar
  document.getElementById('btnLogout').addEventListener('click', handleLogout);

  // Tab Navigasi
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPanel = document.getElementById(btn.dataset.tab);
      if (targetPanel) targetPanel.classList.add('active');

      if (btn.dataset.tab === 'tab-orders') {
        loadOrders();
      } else if (btn.dataset.tab === 'tab-menu') {
        loadMenuCatalog();
      } else if (btn.dataset.tab === 'tab-categories') {
        loadCategories();
      } else if (btn.dataset.tab === 'tab-settings') {
        loadSettingsForm();
      }
    });
  });

  // Butang Muat Semula Pesanan & Penapis
  document.getElementById('btnRefreshOrders').addEventListener('click', loadOrders);
  document.getElementById('orderStatusFilter').addEventListener('change', loadOrders);

  // Carian & Tapis Menu
  document.getElementById('menuSearchInput').addEventListener('input', renderMenuTable);
  document.getElementById('menuCategoryFilter').addEventListener('change', renderMenuTable);

  // Modal Tambah Menu
  document.getElementById('btnOpenAddItemModal').addEventListener('click', () => openItemModal());
  document.getElementById('btnCancelItemModal').addEventListener('click', closeItemModal);
  document.getElementById('itemForm').addEventListener('submit', handleSaveItem);

  // Input Muat Naik Gambar dengan Mampatan Sisi Klien (<canvas> max 480px, latar putih, < 95 KB)
  document.getElementById('itemFormFileInput').addEventListener('change', handleImageUploadInput);

  // Modal Tambah Kategori
  document.getElementById('btnOpenAddCategoryModal').addEventListener('click', () => openCategoryModal());
  document.getElementById('btnCancelCategoryModal').addEventListener('click', closeCategoryModal);
  document.getElementById('categoryForm').addEventListener('submit', handleSaveCategory);

  // Borang Tetapan Kedai
  document.getElementById('storeSettingsForm').addEventListener('submit', handleSaveSettings);
  document.getElementById('settingStoreOpen').addEventListener('change', e => {
    document.getElementById('storeOpenLabelText').textContent = e.target.checked
      ? 'Kedai dibuka untuk menerima pesanan dari skrin kiosk.'
      : 'Kedai ditutup. Kiosk tidak akan membenarkan pesanan baharu dibuat.';
  });
}

// Paparkan Skrin Log Masuk
function showLoginScreen() {
  document.getElementById('loginScreen').style.display = 'block';
  document.getElementById('adminMainContent').style.display = 'none';
  if (adminState.ordersPollTimer) {
    clearInterval(adminState.ordersPollTimer);
    adminState.ordersPollTimer = null;
  }
}

// Paparkan Papan Pemuka Admin
function showAdminDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminMainContent').style.display = 'flex';

  loadAllInitialData();

  // Mulakan polling pesanan setiap 5 saat
  if (adminState.ordersPollTimer) clearInterval(adminState.ordersPollTimer);
  adminState.ordersPollTimer = setInterval(loadOrders, 5000);
}

// Log Masuk
async function handleLogin(e) {
  e.preventDefault();
  const passwordInput = document.getElementById('adminPasswordInput');
  const alertBox = document.getElementById('loginAlertBox');
  const password = passwordInput.value.trim();

  alertBox.style.display = 'none';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    const data = await res.json();

    if (res.status === 503) {
      alertBox.style.display = 'block';
      alertBox.style.background = '#fef2f2';
      alertBox.style.border = '1px solid #f87171';
      alertBox.style.color = '#991b1b';
      alertBox.innerHTML = `<strong>Ralat Konfigurasi (503):</strong><br>${escapeHtml(data.error || 'ADMIN_PASSWORD belum diset pada Cloudflare Workers.')}<br><br><small>Jalankan arahan terminal: <code>npx wrangler secret put ADMIN_PASSWORD</code></small>`;
      return;
    }

    if (!res.ok || !data.success) {
      alertBox.style.display = 'block';
      alertBox.style.background = '#fef2f2';
      alertBox.style.border = '1px solid #f87171';
      alertBox.style.color = '#991b1b';
      alertBox.textContent = data.error || 'Kata laluan salah.';
      return;
    }

    // Simpan token
    adminState.token = data.token || password;
    sessionStorage.setItem('jom_admin_token', adminState.token);
    showToast('Log masuk berjaya!', 'success');
    showAdminDashboard();
  } catch (err) {
    console.error('Error logging in:', err);
    alertBox.style.display = 'block';
    alertBox.style.background = '#fef2f2';
    alertBox.style.border = '1px solid #f87171';
    alertBox.style.color = '#991b1b';
    alertBox.textContent = 'Gagal menghubungi pelayan. Sila cuba sebentar lagi.';
  }
}

// Log Keluar
function handleLogout() {
  if (confirm('Adakah anda pasti ingin log keluar dari CMS?')) {
    adminState.token = '';
    sessionStorage.removeItem('jom_admin_token');
    showLoginScreen();
  }
}

// Helper Fetch dengan Auth Header
async function fetchAdmin(endpoint, options = {}) {
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${adminState.token}`,
  };

  const res = await fetch(endpoint, { ...options, headers });

  if (res.status === 401) {
    showToast('Sesi tamat atau kata laluan tidak sah.', 'error');
    adminState.token = '';
    sessionStorage.removeItem('jom_admin_token');
    showLoginScreen();
    throw new Error('Unauthorized');
  }

  return res;
}

// Muat Turun Semua Data Asas
async function loadAllInitialData() {
  await Promise.all([loadMenuCatalog(), loadOrders()]);
}

// ==========================================
// 1. BAHAGIAN PESANAN DAPUR (KITCHEN ORDERS)
// ==========================================
async function loadOrders() {
  try {
    const statusFilter = document.getElementById('orderStatusFilter').value;
    const res = await fetchAdmin(`/api/admin/orders?status=${encodeURIComponent(statusFilter)}`);
    const data = await res.json();

    if (data.success) {
      adminState.orders = data.orders || [];
      renderKitchenOrders();
    }
  } catch (err) {
    // Ralat senyap semasa polling
  }
}

function renderKitchenOrders() {
  const grid = document.getElementById('kitchenOrdersGrid');
  grid.innerHTML = '';

  if (adminState.orders.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: #64748b;">
        <div style="font-size: 3rem; margin-bottom: 0.5rem;">🍳</div>
        <p><strong>Tiada pesanan aktif dalam senarai buat masa ini.</strong></p>
      </div>
    `;
    return;
  }

  adminState.orders.forEach(order => {
    const card = document.createElement('div');
    card.className = `kitchen-card status-${order.status}`;

    const orderTime = new Date(order.created_at).toLocaleTimeString('ms-MY', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const isDineIn = order.order_type === 'dine_in';
    const typeLabel = isDineIn
      ? `🍽️ Makan Sini ${order.table_number ? '(' + escapeHtml(order.table_number) + ')' : ''}`
      : '🛍️ Bungkus';

    let itemsHtml = '';
    (order.items || []).forEach(it => {
      itemsHtml += `
        <div class="kitchen-item-row">
          <div><span class="qty">${it.quantity}x</span> ${escapeHtml(it.item_name)}</div>
          <div style="color: #64748b; font-size: 0.85rem;">RM ${parseFloat(it.subtotal).toFixed(2)}</div>
        </div>
      `;
    });

    // Butang Tindakan Mengikut Status Semasa
    let actionsHtml = '';
    if (order.status === 'new') {
      actionsHtml = `
        <button type="button" class="action-btn-sm" style="background: #e0f2fe; color: #0369a1; border-color: #bae6fd; flex: 1; justify-content: center;" onclick="updateOrderStatus(${order.id}, 'preparing')">
          🍳 Masak (Disediakan)
        </button>
        <button type="button" class="action-btn-sm action-btn-danger" onclick="updateOrderStatus(${order.id}, 'cancelled')">
          ❌ Batal
        </button>
      `;
    } else if (order.status === 'preparing') {
      actionsHtml = `
        <button type="button" class="action-btn-sm" style="background: #dcfce7; color: #15803d; border-color: #86efac; flex: 1; justify-content: center;" onclick="updateOrderStatus(${order.id}, 'ready')">
          🔔 Sedia Diambil
        </button>
        <button type="button" class="action-btn-sm action-btn-danger" onclick="updateOrderStatus(${order.id}, 'cancelled')">
          ❌ Batal
        </button>
      `;
    } else if (order.status === 'ready') {
      actionsHtml = `
        <button type="button" class="action-btn-sm" style="background: #f1f5f9; color: #334155; flex: 1; justify-content: center;" onclick="updateOrderStatus(${order.id}, 'completed')">
          ✅ Selesai Dihantar
        </button>
      `;
    } else {
      actionsHtml = `
        <span style="font-size: 0.8rem; color: #94a3b8; padding: 0.3rem;">Status: ${order.status.toUpperCase()}</span>
      `;
    }

    card.innerHTML = `
      <div class="kitchen-card-header">
        <div>
          <span class="kitchen-queue-badge">${escapeHtml(order.queue_number)}</span>
          <div class="kitchen-meta">${typeLabel} • ${orderTime}</div>
        </div>
        <div>
          <span class="badge-status badge-${order.status}">${formatStatusLabel(order.status)}</span>
        </div>
      </div>

      <div class="kitchen-items-list">
        ${order.customer_name ? `<div style="font-size: 0.8rem; color: #475569; margin-bottom: 0.4rem;">Pelanggan: <strong>${escapeHtml(order.customer_name)}</strong></div>` : ''}
        ${order.notes ? `<div style="font-size: 0.8rem; color: #b45309; background: #fffbeb; padding: 0.35rem 0.5rem; border-radius: 4px; margin-bottom: 0.5rem;">📝 <em>${escapeHtml(order.notes)}</em></div>` : ''}
        ${itemsHtml}
        <div style="display: flex; justify-content: space-between; font-weight: 800; margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid #e2e8f0;">
          <span>Jumlah:</span>
          <span>RM ${parseFloat(order.total_amount).toFixed(2)}</span>
        </div>
      </div>

      <div class="kitchen-card-actions">
        ${actionsHtml}
      </div>
    `;

    grid.appendChild(card);
  });
}

function formatStatusLabel(status) {
  switch (status) {
    case 'new': return 'Baru';
    case 'preparing': return 'Sedang Dimasak';
    case 'ready': return 'Sedia Diambil';
    case 'completed': return 'Selesai';
    case 'cancelled': return 'Batal';
    default: return status;
  }
}

// Kemaskini Status Pesanan
window.updateOrderStatus = async function(orderId, newStatus) {
  try {
    const res = await fetchAdmin(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`Pesanan #${orderId} ditukar kepada ${formatStatusLabel(newStatus)}.`, 'success');
      loadOrders();
    } else {
      showToast(data.error || 'Gagal mengemaskini status.', 'error');
    }
  } catch (err) {
    showToast('Ralat sambungan pelayan.', 'error');
  }
};

// ==========================================
// 2. BAHAGIAN PENGURUSAN MENU (MENU CATALOG)
// ==========================================
async function loadMenuCatalog() {
  try {
    const res = await fetchAdmin('/api/admin/menu');
    const data = await res.json();

    if (data.success) {
      adminState.categories = data.categories || [];
      adminState.items = data.items || [];
      adminState.settings = data.settings || adminState.settings;

      document.getElementById('adminNavStoreTitle').textContent = adminState.settings.store_name || 'Jom Order CMS';

      populateCategoryDropdowns();
      renderMenuTable();
      renderCategoryTable();
    }
  } catch (err) {
    console.error('Error loading menu catalog:', err);
  }
}

function populateCategoryDropdowns() {
  const filterSelect = document.getElementById('menuCategoryFilter');
  const formSelect = document.getElementById('itemFormCategory');

  filterSelect.innerHTML = '<option value="all">Semua Kategori</option>';
  formSelect.innerHTML = '';

  adminState.categories.forEach(cat => {
    const optFilter = document.createElement('option');
    optFilter.value = cat.id;
    optFilter.textContent = `${cat.icon || '📁'} ${cat.name}`;
    filterSelect.appendChild(optFilter);

    const optForm = document.createElement('option');
    optForm.value = cat.id;
    optForm.textContent = `${cat.icon || '📁'} ${cat.name}`;
    formSelect.appendChild(optForm);
  });
}

function renderMenuTable() {
  const tbody = document.getElementById('menuTableBody');
  const search = document.getElementById('menuSearchInput').value.toLowerCase().trim();
  const catFilter = document.getElementById('menuCategoryFilter').value;

  tbody.innerHTML = '';

  const filtered = adminState.items.filter(item => {
    const matchesCat = catFilter === 'all' || item.category_id === catFilter;
    const matchesSearch = !search || item.name.toLowerCase().includes(search) || (item.description && item.description.toLowerCase().includes(search));
    return matchesCat && matchesSearch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2.5rem; color: #64748b;">
          Tiada menu sepadan dijumpai.
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(item => {
    const cat = adminState.categories.find(c => c.id === item.category_id);
    const catName = cat ? `${cat.icon || ''} ${cat.name}` : '-';

    const tr = document.createElement('tr');

    // Thumbnail
    let photoCell = '';
    if (item.image_id) {
      photoCell = `<img src="/api/images/${encodeURIComponent(item.image_id)}" style="width: 44px; height: 44px; border-radius: 6px; object-fit: cover;" onerror="this.onerror=null; this.parentElement.innerHTML='${item.emoji || '🍲'}';" />`;
    } else {
      photoCell = `<div style="font-size: 1.8rem; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: #fff7ed; border-radius: 6px;">${item.emoji || '🍲'}</div>`;
    }

    tr.innerHTML = `
      <td>${photoCell}</td>
      <td>
        <strong>${escapeHtml(item.name)}</strong>
        <div style="font-size: 0.75rem; color: #64748b; max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${escapeHtml(item.description || '-')}
        </div>
      </td>
      <td><span style="font-size: 0.85rem; background: #f1f5f9; padding: 0.2rem 0.5rem; border-radius: 4px;">${catName}</span></td>
      <td>
        <!-- TUKAR HARGA CEPAT (INLINE QUICK CHANGE) -->
        <div style="display: flex; align-items: center; gap: 0.35rem;">
          <span style="font-weight: 700; font-size: 0.85rem;">RM</span>
          <input
            type="number"
            step="0.10"
            min="0"
            class="quick-price-input"
            value="${parseFloat(item.price).toFixed(2)}"
            data-item-id="${item.id}"
            title="Tukar harga terus & tekan Enter atau klik di luar"
          />
        </div>
      </td>
      <td style="text-align: center;">
        <!-- SUIS AKTIF / NYAHAKTIF PANTAS -->
        <label class="switch">
          <input type="checkbox" ${item.is_active ? 'checked' : ''} onchange="toggleItemActive('${item.id}', this.checked)">
          <span class="slider"></span>
        </label>
      </td>
      <td style="text-align: right;">
        <div style="display: inline-flex; gap: 0.35rem;">
          <button type="button" class="action-btn-sm" onclick="openItemModal('${item.id}')" title="Edit Menu">✏️ Edit</button>
          <button type="button" class="action-btn-sm" onclick="duplicateItem('${item.id}')" title="Salin Menu">📋 Salin</button>
          <button type="button" class="action-btn-sm action-btn-danger" onclick="deleteItem('${item.id}')" title="Padam Menu">🗑️</button>
        </div>
      </td>
    `;

    // Pasang listener tukar harga cepat
    const priceInput = tr.querySelector('.quick-price-input');
    priceInput.addEventListener('change', () => handleQuickPriceChange(item.id, priceInput.value));
    priceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        priceInput.blur();
      }
    });

    tbody.appendChild(tr);
  });
}

// Tukar Harga Cepat
async function handleQuickPriceChange(itemId, newPrice) {
  const price = parseFloat(newPrice);
  if (isNaN(price) || price < 0) {
    showToast('Harga tidak sah.', 'error');
    loadMenuCatalog();
    return;
  }

  try {
    const res = await fetchAdmin(`/api/admin/items/${itemId}/price`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Harga berjaya dikemaskini!', 'success');
      // Kemaskini dalam state tempatan
      const it = adminState.items.find(i => i.id === itemId);
      if (it) it.price = price;
    } else {
      showToast(data.error || 'Gagal menukar harga.', 'error');
      loadMenuCatalog();
    }
  } catch (err) {
    showToast('Ralat sambungan pelayan.', 'error');
    loadMenuCatalog();
  }
}

// Suis Aktif / Nyahaktif Item Pantas
window.toggleItemActive = async function(itemId, isActive) {
  try {
    const res = await fetchAdmin(`/api/admin/items/${itemId}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: isActive }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(isActive ? 'Menu diaktifkan.' : 'Menu dinyahaktifkan.', 'success');
      const it = adminState.items.find(i => i.id === itemId);
      if (it) it.is_active = isActive ? 1 : 0;
    } else {
      showToast(data.error || 'Gagal menukar status menu.', 'error');
      loadMenuCatalog();
    }
  } catch (err) {
    showToast('Ralat sambungan pelayan.', 'error');
    loadMenuCatalog();
  }
};

// Salin Menu Item
window.duplicateItem = async function(itemId) {
  try {
    const res = await fetchAdmin(`/api/admin/items/${itemId}/duplicate`, {
      method: 'POST',
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Item menu berjaya disalin!', 'success');
      await loadMenuCatalog();
    } else {
      showToast(data.error || 'Gagal menyalin item.', 'error');
    }
  } catch (err) {
    showToast('Ralat sambungan pelayan.', 'error');
  }
};

// Padam Menu Item
window.deleteItem = async function(itemId) {
  const item = adminState.items.find(i => i.id === itemId);
  const name = item ? item.name : 'ini';

  if (!confirm(`Adakah anda pasti ingin memadam menu "${name}"?`)) return;

  try {
    const res = await fetchAdmin(`/api/admin/items/${itemId}`, {
      method: 'DELETE',
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Menu berjaya dipadam!', 'success');
      await loadMenuCatalog();
    } else {
      showToast(data.error || 'Gagal memadam menu.', 'error');
    }
  } catch (err) {
    showToast('Ralat sambungan pelayan.', 'error');
  }
};

// Buka Modal Tambah/Edit Item
window.openItemModal = function(itemId = null) {
  const modal = document.getElementById('itemModal');
  const title = document.getElementById('itemModalTitle');
  const formId = document.getElementById('itemFormId');
  const formName = document.getElementById('itemFormName');
  const formCat = document.getElementById('itemFormCategory');
  const formPrice = document.getElementById('itemFormPrice');
  const formDesc = document.getElementById('itemFormDesc');
  const formEmoji = document.getElementById('itemFormEmoji');
  const formSort = document.getElementById('itemFormSort');
  const formImageId = document.getElementById('itemFormImageId');
  const formIsActive = document.getElementById('itemFormIsActive');
  const fileInput = document.getElementById('itemFormFileInput');
  const imgPreview = document.getElementById('itemImgPreview');
  const imgPlaceholder = document.getElementById('itemImgPlaceholder');
  const uploadStatus = document.getElementById('itemImgUploadStatus');

  fileInput.value = '';
  uploadStatus.textContent = 'Belum ada gambar baru dipilih.';

  if (itemId) {
    const item = adminState.items.find(i => i.id === itemId);
    if (!item) return;

    title.textContent = 'Edit Menu Makanan';
    formId.value = item.id;
    formName.value = item.name;
    formCat.value = item.category_id;
    formPrice.value = item.price;
    formDesc.value = item.description || '';
    formEmoji.value = item.emoji || '🍽️';
    formSort.value = item.sort_order || 0;
    formImageId.value = item.image_id || '';
    formIsActive.checked = item.is_active === 1;

    if (item.image_id) {
      imgPreview.src = `/api/images/${encodeURIComponent(item.image_id)}`;
      imgPreview.style.display = 'block';
      imgPlaceholder.style.display = 'none';
      uploadStatus.textContent = 'Gambar sedia ada disimpan.';
    } else {
      imgPreview.style.display = 'none';
      imgPlaceholder.style.display = 'block';
    }
  } else {
    title.textContent = 'Tambah Menu Baharu';
    formId.value = '';
    formName.value = '';
    formPrice.value = '';
    formDesc.value = '';
    formEmoji.value = '🍲';
    formSort.value = 0;
    formImageId.value = '';
    formIsActive.checked = true;
    imgPreview.style.display = 'none';
    imgPlaceholder.style.display = 'block';
  }

  modal.classList.add('open');
};

function closeItemModal() {
  document.getElementById('itemModal').classList.remove('open');
}

// Simpan Item Menu (Tambah / Edit)
async function handleSaveItem(e) {
  e.preventDefault();
  const id = document.getElementById('itemFormId').value;
  const name = document.getElementById('itemFormName').value.trim();
  const category_id = document.getElementById('itemFormCategory').value;
  const price = parseFloat(document.getElementById('itemFormPrice').value);
  const description = document.getElementById('itemFormDesc').value.trim();
  const emoji = document.getElementById('itemFormEmoji').value.trim() || '🍽️';
  const sort_order = parseInt(document.getElementById('itemFormSort').value, 10) || 0;
  const image_id = document.getElementById('itemFormImageId').value || null;
  const is_active = document.getElementById('itemFormIsActive').checked ? 1 : 0;

  const payload = {
    name,
    category_id,
    price,
    description,
    emoji,
    sort_order,
    image_id,
    is_active,
  };

  try {
    let res;
    if (id) {
      res = await fetchAdmin(`/api/admin/items/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetchAdmin('/api/admin/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Item menu berjaya disimpan!', 'success');
      closeItemModal();
      await loadMenuCatalog();
    } else {
      showToast(data.error || 'Gagal menyimpan menu.', 'error');
    }
  } catch (err) {
    showToast('Ralat sambungan pelayan.', 'error');
  }
}

// =========================================================================
// 3. MAMPATAN GAMBAR SISI KLIEN (<canvas> max 480px, latar putih, < 95 KB)
// PERATURAN WAJIB D1 & KESELAMATAN #3
// =========================================================================
async function handleImageUploadInput(e) {
  const file = e.target.files[0];
  if (!file) return;

  const uploadStatus = document.getElementById('itemImgUploadStatus');
  const imgPreview = document.getElementById('itemImgPreview');
  const imgPlaceholder = document.getElementById('itemImgPlaceholder');
  const hiddenImageId = document.getElementById('itemFormImageId');

  uploadStatus.innerHTML = '⏳ <em>Memampatkan gambar (&lt; 95 KB)...</em>';

  try {
    // 1. Muatkan fail ke dalam elemen Image
    const img = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = ev.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // 2. Skalakan saiz ke maksima 480px sambil mengekalkan nisbah aspek
    const maxDimension = 480;
    let targetWidth = img.width;
    let targetHeight = img.height;

    if (targetWidth > maxDimension || targetHeight > maxDimension) {
      if (targetWidth > targetHeight) {
        targetHeight = Math.round((targetHeight * maxDimension) / targetWidth);
        targetWidth = maxDimension;
      } else {
        targetWidth = Math.round((targetWidth * maxDimension) / targetHeight);
        targetHeight = maxDimension;
      }
    }

    // 3. Lukis ke dalam <canvas> dengan latar putih untuk PNG lutsinar
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    // LATAR BELAKANG PUTIH (Peraturan D1: elak latar jadi hitam untuk PNG)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    // 4. Mampatkan kepada image/jpeg memastikan saiz akhir < 95 KB (97,280 bytes)
    let quality = 0.82;
    let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));

    while (blob.size > 95000 && quality > 0.3) {
      quality -= 0.1;
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    }

    const sizeInKb = (blob.size / 1024).toFixed(1);

    // 5. Tukar kepada ArrayBuffer dan hantar ke server D1
    const arrayBuffer = await blob.arrayBuffer();

    const uploadRes = await fetchAdmin('/api/admin/images', {
      method: 'POST',
      headers: {
        'Content-Type': 'image/jpeg',
      },
      body: arrayBuffer,
    });

    const uploadData = await uploadRes.json();

    if (uploadRes.ok && uploadData.success) {
      hiddenImageId.value = uploadData.id;
      imgPreview.src = `/api/images/${uploadData.id}`;
      imgPreview.style.display = 'block';
      imgPlaceholder.style.display = 'none';
      uploadStatus.innerHTML = `<span style="color: #16a34a; font-weight: bold;">✅ Berjaya dimampatkan (${sizeInKb} KB &lt; 95 KB)!</span>`;
      showToast(`Gambar dimampatkan & disimpan (${sizeInKb} KB).`, 'success');
    } else {
      uploadStatus.innerHTML = `<span style="color: #dc2626;">❌ ${uploadData.error || 'Gagal muat naik.'}</span>`;
      showToast(uploadData.error || 'Gagal memuat naik gambar.', 'error');
    }
  } catch (err) {
    console.error('Image compression error:', err);
    uploadStatus.innerHTML = '<span style="color: #dc2626;">❌ Ralat semasa memproses fail gambar.</span>';
    showToast('Ralat memproses gambar.', 'error');
  }
}

// ==========================================
// 4. BAHAGIAN PENGURUSAN KATEGORI
// ==========================================
async function loadCategories() {
  await loadMenuCatalog();
}

function renderCategoryTable() {
  const tbody = document.getElementById('categoryTableBody');
  tbody.innerHTML = '';

  if (adminState.categories.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem;">Tiada kategori.</td></tr>`;
    return;
  }

  adminState.categories.forEach(cat => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size: 1.5rem;">${cat.icon || '📁'}</td>
      <td><strong>${escapeHtml(cat.name)}</strong></td>
      <td>${cat.sort_order || 0}</td>
      <td style="text-align: center;">
        <label class="switch">
          <input type="checkbox" ${cat.is_active ? 'checked' : ''} onchange="toggleCategoryActive('${cat.id}', this.checked)">
          <span class="slider"></span>
        </label>
      </td>
      <td style="text-align: right;">
        <div style="display: inline-flex; gap: 0.35rem;">
          <button type="button" class="action-btn-sm" onclick="openCategoryModal('${cat.id}')">✏️ Edit</button>
          <button type="button" class="action-btn-sm action-btn-danger" onclick="deleteCategory('${cat.id}')">🗑️ Padam</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.toggleCategoryActive = async function(catId, isActive) {
  try {
    const res = await fetchAdmin(`/api/admin/categories/${catId}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: isActive }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Status kategori dikemaskini.', 'success');
      const cat = adminState.categories.find(c => c.id === catId);
      if (cat) cat.is_active = isActive ? 1 : 0;
    } else {
      showToast(data.error || 'Gagal mengemaskini kategori.', 'error');
      loadMenuCatalog();
    }
  } catch (err) {
    showToast('Ralat sambungan pelayan.', 'error');
  }
};

window.openCategoryModal = function(catId = null) {
  const modal = document.getElementById('categoryModal');
  const title = document.getElementById('categoryModalTitle');
  const formId = document.getElementById('categoryFormId');
  const formName = document.getElementById('categoryFormName');
  const formIcon = document.getElementById('categoryFormIcon');
  const formSort = document.getElementById('categoryFormSort');
  const formIsActive = document.getElementById('categoryFormIsActive');

  if (catId) {
    const cat = adminState.categories.find(c => c.id === catId);
    if (!cat) return;
    title.textContent = 'Edit Kategori';
    formId.value = cat.id;
    formName.value = cat.name;
    formIcon.value = cat.icon || '📁';
    formSort.value = cat.sort_order || 0;
    formIsActive.checked = cat.is_active === 1;
  } else {
    title.textContent = 'Tambah Kategori Baharu';
    formId.value = '';
    formName.value = '';
    formIcon.value = '🍽️';
    formSort.value = adminState.categories.length + 1;
    formIsActive.checked = true;
  }

  modal.classList.add('open');
};

function closeCategoryModal() {
  document.getElementById('categoryModal').classList.remove('open');
}

async function handleSaveCategory(e) {
  e.preventDefault();
  const id = document.getElementById('categoryFormId').value;
  const name = document.getElementById('categoryFormName').value.trim();
  const icon = document.getElementById('categoryFormIcon').value.trim() || '📁';
  const sort_order = parseInt(document.getElementById('categoryFormSort').value, 10) || 0;
  const is_active = document.getElementById('categoryFormIsActive').checked ? 1 : 0;

  const payload = { name, icon, sort_order, is_active };

  try {
    let res;
    if (id) {
      res = await fetchAdmin(`/api/admin/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetchAdmin('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Kategori berjaya disimpan!', 'success');
      closeCategoryModal();
      await loadMenuCatalog();
    } else {
      showToast(data.error || 'Gagal menyimpan kategori.', 'error');
    }
  } catch (err) {
    showToast('Ralat sambungan pelayan.', 'error');
  }
}

// PADAM KATEGORI - Menangani SEKATAN 409 jika masih ada item
window.deleteCategory = async function(catId) {
  const cat = adminState.categories.find(c => c.id === catId);
  const catName = cat ? cat.name : 'ini';

  if (!confirm(`Adakah anda pasti ingin memadam kategori "${catName}"?`)) return;

  try {
    const res = await fetchAdmin(`/api/admin/categories/${catId}`, {
      method: 'DELETE',
    });

    const data = await res.json();

    // PERATURAN WAJIB D1: "sekat padam kategori dengan 409 jika masih ada item"
    if (res.status === 409) {
      alert(`⚠️ TINDAKAN DISEKAT (409 Conflict):\n\n${data.error || 'Kategori tidak boleh dipadam kerana masih ada menu terikat.'}`);
      return;
    }

    if (res.ok && data.success) {
      showToast('Kategori berjaya dipadam!', 'success');
      await loadMenuCatalog();
    } else {
      showToast(data.error || 'Gagal memadam kategori.', 'error');
    }
  } catch (err) {
    showToast('Ralat sambungan pelayan.', 'error');
  }
};

// ==========================================
// 5. BAHAGIAN TETAPAN KEDAI
// ==========================================
function loadSettingsForm() {
  document.getElementById('settingStoreName').value = adminState.settings.store_name || '';
  document.getElementById('settingStoreBanner').value = adminState.settings.store_banner || '';
  const isOpen = adminState.settings.store_open !== false;
  document.getElementById('settingStoreOpen').checked = isOpen;
  document.getElementById('storeOpenLabelText').textContent = isOpen
    ? 'Kedai dibuka untuk menerima pesanan dari skrin kiosk.'
    : 'Kedai ditutup. Kiosk tidak akan membenarkan pesanan baharu dibuat.';
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const store_name = document.getElementById('settingStoreName').value.trim();
  const store_banner = document.getElementById('settingStoreBanner').value.trim();
  const store_open = document.getElementById('settingStoreOpen').checked;

  try {
    const res = await fetchAdmin('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_name, store_banner, store_open }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Tetapan kedai berjaya dikemaskini!', 'success');
      adminState.settings.store_name = store_name;
      adminState.settings.store_banner = store_banner;
      adminState.settings.store_open = store_open;
      document.getElementById('adminNavStoreTitle').textContent = store_name;
    } else {
      showToast(data.error || 'Gagal menyimpan tetapan.', 'error');
    }
  } catch (err) {
    showToast('Ralat sambungan pelayan.', 'error');
  }
}

// Utility Notifikasi Toast & Escape HTML
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
