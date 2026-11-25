# 📌 NOTA KEMAJUAN & PANDUAN MENYAMBUNG PROJEK: JOM ORDER

**Tarikh Disimpan:** 25 November 2026  
**Repositori GitHub:** [https://github.com/admrnagumo760/jomorder](https://github.com/admrnagumo760/jomorder)  
**Cawangan Utama:** `main` (Semua kod terkini sudah selamat di-push ke GitHub)

---

## 1. Status Terkini Projek (100% Siap Dibangunkan & Disimpan)

| Komponen | Fail Terlibat | Status |
|---|---|---|
| **Skrin Kiosk (Self-Service)** | `public/index.html`<br>`public/kiosk.js` | ✅ **Siap**. Paparan menu, kategori, *fallback emoji*, pilihan Makan Sini/Bungkus, troli dinamik, nombor giliran berjujukan (`A-001`), dan penjejakan status masa nyata beserta audio chime. |
| **Panel Admin CMS** | `public/admin.html`<br>`public/admin.js` | ✅ **Siap**. Pengesahan `ADMIN_PASSWORD` (503 jika belum diset), papan dapur langsung auto-refresh 5 saat, tukar harga cepat, suis aktif/nyahaktif, sekatan padam kategori 409 jika ada item, dan tetapan buka/tutup kedai. |
| **Mampatan Gambar Sisi Klien** | `public/admin.js`<br>`src/index.js` | ✅ **Siap**. Dimampatkan dengan `<canvas>` max 480px, latar belakang putih untuk PNG lutsinar, saiz terjamin `< 95 KB`, disimpan ke D1 sebagai `ArrayBuffer` (`bytes.buffer`), dan dibaca dengan `Uint8Array.from()`. |
| **Cloudflare Worker & D1 API** | `src/index.js` | ✅ **Siap**. Auto-setup 6 jadual D1 + 15 menu autentik contoh dengan cache `dbReady`. Pengiraan harga dan semakan status buka kedai di peringkat server menggunakan `db.batch()`. |
| **Penggayaan UI Moden** | `public/styles.css` | ✅ **Siap**. Reka bentuk mesra skrin sentuh (*touch-friendly*), responsif untuk tablet, kiosk, dan telefon. |
| **Konfigurasi D1 & Deploy** | `wrangler.toml`<br>`package.json`<br>`.github/workflows/deploy.yml` | ✅ **Siap**. D1 binding `DB`, database `jom-order-db` (`95a4e179-57c7-402e-a46b-ffcacef422b7`). CI/CD GitHub Actions telah dikemaskini. |

---

## 2. Perkara Perlu Dilakukan Apabila Mahu Menyambung Nanti

Hanya ada **satu langkah mudah** yang tinggal untuk menghidupkan laman ini secara langsung di Cloudflare:

### Masukkan 2 Kunci Rahsia di GitHub:
Buka pautan ini:  
👉 [https://github.com/admrnagumo760/jomorder/settings/secrets/actions](https://github.com/admrnagumo760/jomorder/settings/secrets/actions)

Tekan **New repository secret** dan tambah:
1. `CLOUDFLARE_API_TOKEN` : Dapatkan token API dari Cloudflare Dashboard (kebenaran: Workers & D1).
2. `CLOUDFLARE_ACCOUNT_ID` : ID akaun Cloudflare anda (ada pada sidebar Cloudflare Dashboard).

### Tetapkan Kata Laluan Admin:
Di Cloudflare Workers Dashboard (atau melalui arahan `npx wrangler secret put ADMIN_PASSWORD`), masukkan kata laluan pilihan anda (cth: `Kopitiam2026!`).

---

## 3. Arahan Pantas Jika Buka Semula

Bila-bila masa anda ingin menyambung semula dengan saya atau di terminal, anda hanya perlu sebut:
> *"Sambung projek jom-order"*
Semua fail selamat berada di komputer anda dalam folder:  
`C:\Users\moham\Documents\P.LAMAN MAYA\jom-order`
dan salinan sandaran terkini berada di GitHub anda.
