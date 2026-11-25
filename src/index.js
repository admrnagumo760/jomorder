/**
 * Jom Order - Cloudflare Worker API & Static Assets Handler
 */

let dbReady = false;

// Helper untuk format JSON Response
function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Password',
      ...headers,
    },
  });
}

// Semak dan sediakan pangkalan data D1 (di-cache dengan flag dbReady)
async function ensureDb(db) {
  if (dbReady) return;

  // Cipta jadual-jadual utama jika belum wujud
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '🍽️',
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        category_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        price REAL NOT NULL,
        image_id TEXT DEFAULT NULL,
        emoji TEXT DEFAULT '🍲',
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
        data BLOB NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        queue_number TEXT NOT NULL,
        order_type TEXT NOT NULL, -- 'dine_in' atau 'takeaway'
        customer_name TEXT DEFAULT '',
        table_number TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'new', -- 'new', 'preparing', 'ready', 'completed', 'cancelled'
        total_amount REAL NOT NULL DEFAULT 0.0,
        notes TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        item_id TEXT NOT NULL,
        item_name TEXT NOT NULL,
        item_price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        subtotal REAL NOT NULL
      )
    `),
  ]);

  // Semak jika jadual items kosong untuk muatkan 15 menu contoh
  const countRow = await db.prepare('SELECT COUNT(*) as cnt FROM items').first();
  const itemCount = countRow ? Number(countRow.cnt) : 0;

  if (itemCount === 0) {
    // Masukkan tetapan asas kedai
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('store_name', 'Jom Order Kopitiam & Kafe')`),
      db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('store_banner', 'Selamat Datang! Nikmati hidangan lazat, asli & segar yang dimasak khas untuk anda.')`),
      db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('store_open', 'true')`),
    ]);

    // Masukkan kategori contoh
    await db.batch([
      db.prepare(`INSERT OR REPLACE INTO categories (id, name, icon, sort_order, is_active) VALUES ('cat_makanan', 'Makanan Utama', '🍛', 1, 1)`),
      db.prepare(`INSERT OR REPLACE INTO categories (id, name, icon, sort_order, is_active) VALUES ('cat_mee', 'Mee & Sup', '🍜', 2, 1)`),
      db.prepare(`INSERT OR REPLACE INTO categories (id, name, icon, sort_order, is_active) VALUES ('cat_snek', 'Snek & Sampingan', '🥟', 3, 1)`),
      db.prepare(`INSERT OR REPLACE INTO categories (id, name, icon, sort_order, is_active) VALUES ('cat_minuman', 'Minuman', '🥤', 4, 1)`),
      db.prepare(`INSERT OR REPLACE INTO categories (id, name, icon, sort_order, is_active) VALUES ('cat_dessert', 'Pencuci Mulut', '🍧', 5, 1)`),
    ]);

    // Masukkan 15 menu contoh autentik Malaysia
    const sampleItems = [
      { id: 'item_1', category_id: 'cat_makanan', name: 'Nasi Lemak Ayam Berempah', description: 'Nasi santan wangi dihidang bersama ayam goreng berempah rangup, sambal manis pedas, telur rebus & kacang bilis.', price: 12.90, emoji: '🍗', sort_order: 1 },
      { id: 'item_2', category_id: 'cat_makanan', name: 'Nasi Goreng Kampung Kaw', description: 'Nasi goreng berasap bersama kangkung segar, ikan bilis tumbuk garing dan telur mata cair.', price: 9.50, emoji: '🍳', sort_order: 2 },
      { id: 'item_3', category_id: 'cat_makanan', name: 'Nasi Kandar Ayam Bawang + Bendi', description: 'Nasi putih dengan kuah kari campur banjir pekat, ayam masak bawang empuk & bendi segar.', price: 14.50, emoji: '🍛', sort_order: 3 },
      { id: 'item_4', category_id: 'cat_mee', name: 'Mee Goreng Mamak Special', description: 'Mee kuning digoreng kuali panas dengan cucur udang, tauhu, taugeh segar & perahan limau nipis.', price: 8.50, emoji: '🍝', sort_order: 4 },
      { id: 'item_5', category_id: 'cat_mee', name: 'Char Kuey Teow Kerang Udang', description: 'Kuey teow aroma kuali berasap (wok-hei), isi kerang manis, udang segar dan telur itik berkrim.', price: 10.90, emoji: '🥢', sort_order: 5 },
      { id: 'item_6', category_id: 'cat_mee', name: 'Laksa Utara Telur Rebus', description: 'Mee laksa beras dalam kuah ikan kembung pekat beraroma bunga kantan, daun kesum & cili padi.', price: 9.00, emoji: '🍜', sort_order: 6 },
      { id: 'item_7', category_id: 'cat_mee', name: 'Sup Tulang Daging Lembu + Roti', description: 'Sup herba tulang rusuk empuk beraroma rempah ratus, dihidangkan bersama roti benggali bakar.', price: 15.00, emoji: '🍲', sort_order: 7 },
      { id: 'item_8', category_id: 'cat_snek', name: 'Roti Canai Banjir 2 Keping', description: 'Dua keping roti canai garing lembut dibanjiri kuah dhal & sambal tumis padu.', price: 4.50, emoji: '🫓', sort_order: 8 },
      { id: 'item_9', category_id: 'cat_snek', name: 'Sate Ayam Madu (6 Cucuk)', description: 'Isi ayam perap serai madu dibakar arang wangi, disajikan dengan kuah kacang pekat & nasi impit.', price: 9.00, emoji: '🍢', sort_order: 9 },
      { id: 'item_10', category_id: 'cat_snek', name: 'Pisang Goreng Cheese Coklat', description: 'Pisang nipah goreng rangup disaluti limpahan keju cheddar parut dan sos coklat mewah.', price: 7.00, emoji: '🍌', sort_order: 10 },
      { id: 'item_11', category_id: 'cat_snek', name: 'Karipap Pusing Crispy (3 Biji)', description: 'Kulit berpusing rangup berinti kentang ayam kari wangi pekat.', price: 4.50, emoji: '🥟', sort_order: 11 },
      { id: 'item_12', category_id: 'cat_minuman', name: 'Teh Tarik Buih Melimpah', description: 'Teh susu pekat berkrim ditarik tinggi hingga berbuih pekat mantap.', price: 3.50, emoji: '🧋', sort_order: 12 },
      { id: 'item_13', category_id: 'cat_minuman', name: 'Milo Ais Tabur Kaw', description: 'Minuman coklat malt kegemaran Malaysia dengan limpahan serbuk Milo di atas ais batu.', price: 4.50, emoji: '🥤', sort_order: 13 },
      { id: 'item_14', category_id: 'cat_minuman', name: 'Kopi O Ais Kampung', description: 'Biji kopi panggang tradisional aroma pekat wangi, segar & melegakan tekak.', price: 3.00, emoji: '☕', sort_order: 14 },
      { id: 'item_15', category_id: 'cat_dessert', name: 'Cendol Santan Sawit Special', description: 'Ais parut gebu dengan santan lemak berkrim, gula melaka asli, cendol pandan & kacang merah empuk.', price: 6.50, emoji: '🍧', sort_order: 15 },
    ];

    const itemStatements = sampleItems.map(item =>
      db.prepare(`
        INSERT OR REPLACE INTO items (id, category_id, name, description, price, emoji, sort_order, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).bind(item.id, item.category_id, item.name, item.description, item.price, item.emoji, item.sort_order)
    );

    await db.batch(itemStatements);
  }

  dbReady = true;
}

// Semak ADMIN_PASSWORD & Pengesahan
function verifyAdminAuth(request, env) {
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.trim() === '') {
    return {
      authorized: false,
      status: 503,
      error: 'Kata laluan admin (ADMIN_PASSWORD) belum dikonfigurasikan di Cloudflare Workers. Sila set rahsia menggunakan wrangler secret put ADMIN_PASSWORD.',
    };
  }

  const authHeader = request.headers.get('Authorization') || '';
  const xAdminPass = request.headers.get('X-Admin-Password') || '';

  let providedPassword = '';
  if (authHeader.startsWith('Bearer ')) {
    providedPassword = authHeader.substring(7).trim();
  } else if (xAdminPass) {
    providedPassword = xAdminPass.trim();
  }

  if (!providedPassword || providedPassword !== env.ADMIN_PASSWORD) {
    return {
      authorized: false,
      status: 401,
      error: 'Akses tidak sah. Sila masukkan kata laluan admin yang betul.',
    };
  }

  return { authorized: true };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Password',
        },
      });
    }

    try {
      // 1. API: Ambil Gambar (/api/images/:id)
      if (pathname.startsWith('/api/images/') && method === 'GET') {
        const imageId = pathname.replace('/api/images/', '').trim();
        if (!imageId) return new Response('Not Found', { status: 404 });

        await ensureDb(env.DB);
        const row = await env.DB.prepare('SELECT mime_type, data FROM images WHERE id = ?').bind(imageId).first();
        if (!row || !row.data) {
          return new Response('Gambar tidak dijumpai', { status: 404 });
        }

        // PERATURAN WAJIB D1: Uint8Array.from(row.data || []) supaya tidak broken image
        const uint8 = Uint8Array.from(row.data || []);
        return new Response(uint8, {
          status: 200,
          headers: {
            'Content-Type': row.mime_type || 'image/jpeg',
            'Cache-Control': 'public, max-age=604800, immutable',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // 2. API Kiosk: Init data (/api/kiosk/init)
      if (pathname === '/api/kiosk/init' && method === 'GET') {
        await ensureDb(env.DB);

        // Ambil tetapan kedai
        const settingsRows = await env.DB.prepare('SELECT key, value FROM settings').all();
        const settings = {};
        for (const s of settingsRows.results || []) {
          settings[s.key] = s.value;
        }

        // Ambil kategori aktif
        const categoriesResult = await env.DB.prepare(
          'SELECT id, name, icon, sort_order FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'
        ).all();

        // Ambil menu item yang aktif
        const itemsResult = await env.DB.prepare(
          'SELECT id, category_id, name, description, price, image_id, emoji, sort_order FROM items WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'
        ).all();

        return jsonResponse({
          success: true,
          store_name: settings.store_name || 'Jom Order Kopitiam & Kafe',
          store_banner: settings.store_banner || 'Selamat Datang!',
          store_open: settings.store_open === 'true',
          categories: categoriesResult.results || [],
          items: itemsResult.results || [],
        });
      }

      // 3. API Kiosk: Semak status pesanan (/api/orders/:id)
      if (pathname.startsWith('/api/orders/') && method === 'GET') {
        const orderId = pathname.replace('/api/orders/', '').trim();
        await ensureDb(env.DB);

        const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
        if (!order) {
          return jsonResponse({ error: 'Pesanan tidak dijumpai' }, 404);
        }

        const items = await env.DB.prepare('SELECT * FROM order_items WHERE order_id = ?').bind(orderId).all();

        return jsonResponse({
          success: true,
          order,
          items: items.results || [],
        });
      }

      // 4. API Kiosk: Hantar Pesanan Baharu (/api/orders)
      // PERATURAN WAJIB D1: Kira jumlah harga & semak status kedai dibuka di server, simpan order_items guna db.batch(), nombor giliran daripada orderId
      if (pathname === '/api/orders' && method === 'POST') {
        await ensureDb(env.DB);

        // Semak status kedai dibuka
        const storeOpenRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'store_open'").first();
        const isStoreOpen = storeOpenRow ? storeOpenRow.value === 'true' : true;
        if (!isStoreOpen) {
          return jsonResponse({ error: 'Maaf, kedai sedang ditutup buat sementara waktu. Pesanan baharu tidak dapat diterima.' }, 400);
        }

        const body = await request.json().catch(() => null);
        if (!body || !Array.isArray(body.items) || body.items.length === 0) {
          return jsonResponse({ error: 'Sila pilih sekurang-kurangnya satu menu untuk membuat pesanan.' }, 400);
        }

        const orderType = body.order_type === 'takeaway' ? 'takeaway' : 'dine_in';
        const customerName = (body.customer_name || '').trim().slice(0, 50);
        const tableNumber = (body.table_number || '').trim().slice(0, 20);
        const notes = (body.notes || '').trim().slice(0, 200);

        // Ekstrak item_ids dan tentukan kuantiti
        const requestedItems = body.items.map(it => ({
          id: String(it.item_id || it.id),
          quantity: Math.max(1, Math.min(99, parseInt(it.quantity, 10) || 1)),
        }));

        const itemIds = [...new Set(requestedItems.map(it => it.id))];
        if (itemIds.length === 0) {
          return jsonResponse({ error: 'Menu tidak sah.' }, 400);
        }

        // Ambil harga sebenar & maklumat daripada D1 (server-calculated, JANGAN percaya client total!)
        const placeholders = itemIds.map(() => '?').join(',');
        const dbItemsResult = await env.DB.prepare(`SELECT id, name, price, is_active FROM items WHERE id IN (${placeholders})`).bind(...itemIds).all();

        const dbItemsMap = new Map();
        for (const item of dbItemsResult.results || []) {
          dbItemsMap.set(item.id, item);
        }

        let calculatedTotal = 0;
        const validOrderItems = [];

        for (const reqItem of requestedItems) {
          const dbItem = dbItemsMap.get(reqItem.id);
          if (!dbItem || dbItem.is_active !== 1) {
            return jsonResponse({ error: `Menu "${dbItem ? dbItem.name : reqItem.id}" tidak aktif atau tidak wujud.` }, 400);
          }
          const price = Number(dbItem.price) || 0;
          const subtotal = Math.round(price * reqItem.quantity * 100) / 100;
          calculatedTotal += subtotal;

          validOrderItems.push({
            item_id: dbItem.id,
            name: dbItem.name,
            price,
            quantity: reqItem.quantity,
            subtotal,
          });
        }

        calculatedTotal = Math.round(calculatedTotal * 100) / 100;

        // Cipta rekod pesanan dahulu untuk mendapatkan auto-increment order_id
        const orderInsert = await env.DB.prepare(`
          INSERT INTO orders (queue_number, order_type, customer_name, table_number, status, total_amount, notes, created_at, updated_at)
          VALUES ('TEMP', ?, ?, ?, 'new', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).bind(orderType, customerName, tableNumber, calculatedTotal, notes).run();

        const orderId = orderInsert.meta?.last_row_id;
        if (!orderId) {
          return jsonResponse({ error: 'Gagal menjana rekod pesanan.' }, 500);
        }

        // JANA NOMBOR GILIRAN BERJUJUKAN DARIPADA orderId (contoh: A-001 hingga A-999)
        // Peraturan: "jana nombor giliran daripada orderId (jangan guna nombor rawak)"
        const seqNum = ((orderId - 1) % 999) + 1;
        const queueNumber = 'A-' + String(seqNum).padStart(3, '0');

        // Kemaskini nombor giliran pada rekod orders
        await env.DB.prepare('UPDATE orders SET queue_number = ? WHERE id = ?').bind(queueNumber, orderId).run();

        // PERATURAN WAJIB D1: simpan order_items guna db.batch()
        const orderItemStatements = validOrderItems.map(item =>
          env.DB.prepare(`
            INSERT INTO order_items (order_id, item_id, item_name, item_price, quantity, subtotal)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(orderId, item.item_id, item.name, item.price, item.quantity, item.subtotal)
        );

        await env.DB.batch(orderItemStatements);

        return jsonResponse({
          success: true,
          order_id: orderId,
          queue_number: queueNumber,
          status: 'new',
          order_type: orderType,
          total_amount: calculatedTotal,
          item_count: validOrderItems.reduce((acc, i) => acc + i.quantity, 0),
        }, 201);
      }

      // 5. API Admin: Log masuk & pengesahan (/api/admin/login)
      if (pathname === '/api/admin/login' && method === 'POST') {
        if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.trim() === '') {
          return jsonResponse({
            error: 'Kata laluan admin (ADMIN_PASSWORD) belum dikonfigurasikan di Cloudflare Workers.',
          }, 503);
        }

        const body = await request.json().catch(() => ({}));
        const inputPassword = (body.password || '').trim();

        if (inputPassword !== env.ADMIN_PASSWORD.trim()) {
          return jsonResponse({ error: 'Kata laluan salah. Sila cuba lagi.' }, 401);
        }

        return jsonResponse({
          success: true,
          message: 'Log masuk berjaya.',
          token: env.ADMIN_PASSWORD,
        });
      }

      // SEMUA LALUAN /api/admin/* DI BAWAH INI MEMERLUKAN PENGESAHAN ADMIN
      if (pathname.startsWith('/api/admin/')) {
        const auth = verifyAdminAuth(request, env);
        if (!auth.authorized) {
          return jsonResponse({ error: auth.error }, auth.status);
        }

        await ensureDb(env.DB);

        // a. Dashboard & Senarai Pesanan (/api/admin/orders)
        if (pathname === '/api/admin/orders' && method === 'GET') {
          const statusFilter = url.searchParams.get('status');
          let query = 'SELECT * FROM orders';
          const params = [];

          if (statusFilter && statusFilter !== 'all') {
            query += ' WHERE status = ?';
            params.push(statusFilter);
          }
          query += ' ORDER BY id DESC LIMIT 100';

          const ordersResult = await env.DB.prepare(query).bind(...params).all();
          const orders = ordersResult.results || [];

          // Dapatkan semua item pesanan
          if (orders.length > 0) {
            const orderIds = orders.map(o => o.id);
            const placeholders = orderIds.map(() => '?').join(',');
            const itemsResult = await env.DB.prepare(
              `SELECT * FROM order_items WHERE order_id IN (${placeholders})`
            ).bind(...orderIds).all();

            const itemsMap = {};
            for (const item of itemsResult.results || []) {
              if (!itemsMap[item.order_id]) itemsMap[item.order_id] = [];
              itemsMap[item.order_id].push(item);
            }

            for (const order of orders) {
              order.items = itemsMap[order.id] || [];
            }
          }

          return jsonResponse({ success: true, orders });
        }

        // b. Kemaskini status pesanan (/api/admin/orders/:id/status)
        if (pathname.match(/^\/api\/admin\/orders\/\d+\/status$/) && method === 'PATCH') {
          const orderId = pathname.split('/')[4];
          const body = await request.json().catch(() => ({}));
          const validStatuses = ['new', 'preparing', 'ready', 'completed', 'cancelled'];

          if (!validStatuses.includes(body.status)) {
            return jsonResponse({ error: 'Status tidak sah.' }, 400);
          }

          await env.DB.prepare(
            'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).bind(body.status, orderId).run();

          return jsonResponse({ success: true, message: `Status pesanan #${orderId} telah ditukar kepada ${body.status}.` });
        }

        // c. Ambil Semua Data Menu, Kategori & Tetapan (/api/admin/menu)
        if (pathname === '/api/admin/menu' && method === 'GET') {
          const settingsRows = await env.DB.prepare('SELECT key, value FROM settings').all();
          const settings = {};
          for (const s of settingsRows.results || []) {
            settings[s.key] = s.value;
          }

          const categories = await env.DB.prepare('SELECT * FROM categories ORDER BY sort_order ASC, name ASC').all();
          const items = await env.DB.prepare('SELECT * FROM items ORDER BY sort_order ASC, name ASC').all();

          return jsonResponse({
            success: true,
            settings: {
              store_name: settings.store_name || 'Jom Order Kopitiam & Kafe',
              store_banner: settings.store_banner || '',
              store_open: settings.store_open === 'true',
            },
            categories: categories.results || [],
            items: items.results || [],
          });
        }

        // d. Kemaskini Tetapan Kedai (/api/admin/settings)
        if (pathname === '/api/admin/settings' && method === 'POST') {
          const body = await request.json().catch(() => ({}));

          const statements = [];
          if (body.store_name !== undefined) {
            statements.push(env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('store_name', ?)").bind(String(body.store_name).trim()));
          }
          if (body.store_banner !== undefined) {
            statements.push(env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('store_banner', ?)").bind(String(body.store_banner).trim()));
          }
          if (body.store_open !== undefined) {
            statements.push(env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('store_open', ?)").bind(body.store_open ? 'true' : 'false'));
          }

          if (statements.length > 0) {
            await env.DB.batch(statements);
          }

          return jsonResponse({ success: true, message: 'Tetapan kedai berjaya dikemaskini.' });
        }

        // e. Tukar Harga Cepat (/api/admin/items/:id/price)
        if (pathname.match(/^\/api\/admin\/items\/[^/]+\/price$/) && method === 'PATCH') {
          const itemId = pathname.split('/')[4];
          const body = await request.json().catch(() => ({}));
          const price = parseFloat(body.price);

          if (isNaN(price) || price < 0) {
            return jsonResponse({ error: 'Harga mestilah angka positif yang sah.' }, 400);
          }

          await env.DB.prepare('UPDATE items SET price = ? WHERE id = ?').bind(price, itemId).run();
          return jsonResponse({ success: true, message: 'Harga menu berjaya dikemaskini.', price });
        }

        // f. Aktif / Nyahaktif Item (/api/admin/items/:id/toggle)
        if (pathname.match(/^\/api\/admin\/items\/[^/]+\/toggle$/) && method === 'PATCH') {
          const itemId = pathname.split('/')[4];
          const body = await request.json().catch(() => ({}));
          const isActive = body.is_active ? 1 : 0;

          await env.DB.prepare('UPDATE items SET is_active = ? WHERE id = ?').bind(isActive, itemId).run();
          return jsonResponse({ success: true, is_active: isActive });
        }

        // g. Salin Menu Item (/api/admin/items/:id/duplicate)
        if (pathname.match(/^\/api\/admin\/items\/[^/]+\/duplicate$/) && method === 'POST') {
          const sourceId = pathname.split('/')[4];
          const src = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(sourceId).first();
          if (!src) return jsonResponse({ error: 'Item sumber tidak ditemui.' }, 404);

          const newId = 'item_' + Date.now();
          const newName = `${src.name} (Salinan)`;

          await env.DB.prepare(`
            INSERT INTO items (id, category_id, name, description, price, image_id, emoji, is_active, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
          `).bind(newId, src.category_id, newName, src.description, src.price, src.image_id, src.emoji, src.sort_order + 1).run();

          return jsonResponse({ success: true, id: newId, message: 'Item berjaya disalin.' });
        }

        // h. Tambah Item Menu (/api/admin/items)
        if (pathname === '/api/admin/items' && method === 'POST') {
          const body = await request.json().catch(() => ({}));
          if (!body.name || !body.category_id || body.price === undefined) {
            return jsonResponse({ error: 'Nama, kategori dan harga wajib diisi.' }, 400);
          }

          const id = body.id || 'item_' + Date.now();
          const price = parseFloat(body.price) || 0;
          const sortOrder = parseInt(body.sort_order, 10) || 0;
          const isActive = body.is_active === false || body.is_active === 0 ? 0 : 1;

          await env.DB.prepare(`
            INSERT INTO items (id, category_id, name, description, price, image_id, emoji, is_active, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            id,
            body.category_id,
            String(body.name).trim(),
            String(body.description || '').trim(),
            price,
            body.image_id || null,
            body.emoji || '🍽️',
            isActive,
            sortOrder
          ).run();

          return jsonResponse({ success: true, id, message: 'Menu baharu berjaya ditambah.' }, 201);
        }

        // i. Kemaskini Penuh Item Menu (/api/admin/items/:id)
        if (pathname.match(/^\/api\/admin\/items\/[^/]+$/) && method === 'PUT') {
          const id = pathname.replace('/api/admin/items/', '').trim();
          const body = await request.json().catch(() => ({}));

          if (!body.name || !body.category_id || body.price === undefined) {
            return jsonResponse({ error: 'Nama, kategori dan harga wajib diisi.' }, 400);
          }

          const price = parseFloat(body.price) || 0;
          const sortOrder = parseInt(body.sort_order, 10) || 0;
          const isActive = body.is_active === false || body.is_active === 0 ? 0 : 1;

          await env.DB.prepare(`
            UPDATE items SET
              category_id = ?,
              name = ?,
              description = ?,
              price = ?,
              image_id = ?,
              emoji = ?,
              is_active = ?,
              sort_order = ?
            WHERE id = ?
          `).bind(
            body.category_id,
            String(body.name).trim(),
            String(body.description || '').trim(),
            price,
            body.image_id || null,
            body.emoji || '🍽️',
            isActive,
            sortOrder,
            id
          ).run();

          return jsonResponse({ success: true, message: 'Item menu berjaya dikemaskini.' });
        }

        // j. Padam Item Menu (/api/admin/items/:id)
        if (pathname.match(/^\/api\/admin\/items\/[^/]+$/) && method === 'DELETE') {
          const id = pathname.replace('/api/admin/items/', '').trim();
          await env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
          return jsonResponse({ success: true, message: 'Item menu berjaya dipadam.' });
        }

        // k. Tambah Kategori (/api/admin/categories)
        if (pathname === '/api/admin/categories' && method === 'POST') {
          const body = await request.json().catch(() => ({}));
          if (!body.name) {
            return jsonResponse({ error: 'Nama kategori wajib diisi.' }, 400);
          }

          const id = body.id || 'cat_' + Date.now();
          const sortOrder = parseInt(body.sort_order, 10) || 0;
          const isActive = body.is_active === false || body.is_active === 0 ? 0 : 1;

          await env.DB.prepare(`
            INSERT INTO categories (id, name, icon, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?)
          `).bind(id, String(body.name).trim(), body.icon || '📁', sortOrder, isActive).run();

          return jsonResponse({ success: true, id, message: 'Kategori baharu berjaya ditambah.' }, 201);
        }

        // l. Kemaskini Kategori (/api/admin/categories/:id)
        if (pathname.match(/^\/api\/admin\/categories\/[^/]+$/) && method === 'PUT') {
          const id = pathname.replace('/api/admin/categories/', '').trim();
          const body = await request.json().catch(() => ({}));

          if (!body.name) {
            return jsonResponse({ error: 'Nama kategori wajib diisi.' }, 400);
          }

          const sortOrder = parseInt(body.sort_order, 10) || 0;
          const isActive = body.is_active === false || body.is_active === 0 ? 0 : 1;

          await env.DB.prepare(`
            UPDATE categories SET name = ?, icon = ?, sort_order = ?, is_active = ? WHERE id = ?
          `).bind(String(body.name).trim(), body.icon || '📁', sortOrder, isActive, id).run();

          return jsonResponse({ success: true, message: 'Kategori berjaya dikemaskini.' });
        }

        // m. Aktif / Nyahaktif Kategori (/api/admin/categories/:id/toggle)
        if (pathname.match(/^\/api\/admin\/categories\/[^/]+\/toggle$/) && method === 'PATCH') {
          const id = pathname.split('/')[4];
          const body = await request.json().catch(() => ({}));
          const isActive = body.is_active ? 1 : 0;

          await env.DB.prepare('UPDATE categories SET is_active = ? WHERE id = ?').bind(isActive, id).run();
          return jsonResponse({ success: true, is_active: isActive });
        }

        // n. Padam Kategori (/api/admin/categories/:id)
        // PERATURAN WAJIB D1: "sekat padam kategori dengan 409 jika masih ada item"
        if (pathname.match(/^\/api\/admin\/categories\/[^/]+$/) && method === 'DELETE') {
          const id = pathname.replace('/api/admin/categories/', '').trim();

          const countRow = await env.DB.prepare('SELECT COUNT(*) as cnt FROM items WHERE category_id = ?').bind(id).first();
          const itemCount = countRow ? Number(countRow.cnt) : 0;

          if (itemCount > 0) {
            return jsonResponse({
              error: `Kategori tidak boleh dipadam kerana masih mempunyai ${itemCount} item menu yang terikat dengannya. Sila padam atau pindahkan item tersebut dahulu.`,
            }, 409);
          }

          await env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
          return jsonResponse({ success: true, message: 'Kategori berjaya dipadam.' });
        }

        // o. Muat Naik Gambar (/api/admin/images)
        // PERATURAN WAJIB D1: "disimpan ke D1 sebagai ArrayBuffer (bytes.buffer)"
        if (pathname === '/api/admin/images' && method === 'POST') {
          const contentType = request.headers.get('Content-Type') || 'image/jpeg';
          const arrayBuffer = await request.arrayBuffer();

          if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            return jsonResponse({ error: 'Data fail gambar kosong.' }, 400);
          }

          // Saiz maksimum 95 KB
          if (arrayBuffer.byteLength > 98000) {
            return jsonResponse({ error: 'Saiz gambar melebihi had (maksimum 95 KB dibenarkan).' }, 400);
          }

          const imageId = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
          const bytes = new Uint8Array(arrayBuffer);

          // Disimpan ke D1 sebagai ArrayBuffer (bytes.buffer)
          await env.DB.prepare('INSERT INTO images (id, mime_type, data) VALUES (?, ?, ?)').bind(
            imageId,
            contentType.split(';')[0].trim(),
            bytes.buffer
          ).run();

          return jsonResponse({
            success: true,
            id: imageId,
            url: `/api/images/${imageId}`,
            size: arrayBuffer.byteLength,
          }, 201);
        }
      }

      // 6. Laluan Fail Statik Fallback melalui Cloudflare Workers Assets
      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }

      return new Response('Not Found', { status: 404 });
    } catch (err) {
      console.error('Worker Error:', err);
      return jsonResponse({
        error: 'Ralat pelayan dalaman: ' + (err.message || String(err)),
      }, 500);
    }
  },
};
