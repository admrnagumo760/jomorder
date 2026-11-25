# Jom Order 🍲
**Sistem Skrin Tempahan Makanan Layan Diri (Self-Service Kiosk) & Panel Admin CMS**

Dibina khusus untuk kelajuan maksimum, kos rendah (Serverless Edge) dan pengalaman pengguna yang lancar menggunakan:
- **Cloudflare Workers** (Edge Backend API & Static Assets Handler)
- **Cloudflare D1** (Serverless SQL Database berasaskan SQLite)
- **HTML5 / Modern CSS / Vanilla JavaScript** (Tiada framework berat, ultra pantas)

---

## 🌟 Ciri-Ciri Utama

### 1. Skrin Kiosk Pelanggan (`/` atau `/index.html`)
- **Pilihan Kategori Dinamik**: Paparan tab kategori dengan ikon emoji yang kemas.
- **Kad Menu Makanan**: Gambar lazat dengan sistem automatik *fallback emoji* (mengelakkan ikon gambar rosak).
- **Pengurusan Troli Pantas**: Tambah, kurangkan kuantiti, kosongkan troli, dan kiraan langsung subtotal.
- **Pilihan Jamuan**: *Makan Sini (Dine In)* berserta nombor meja, atau *Bungkus (Takeaway)*.
- **Nombor Giliran Berjujukan**: Nombor giliran dijana berdasar ID pesanan (cth: `A-001`), bukan rawak.
- **Penjejakan Status Pesanan Langsung**: Paparan modal dengan auto-polling status dapur (`Baru` ➔ `Sedang Dimasak` ➔ `Sedia Diambil` ➔ `Selesai`) berserta nada melodi audio (*chime*).

### 2. Panel Admin CMS & Dapur (`/admin.html`)
- **Pengesahan Keselamatan**: Dilindungi dengan `ADMIN_PASSWORD` (mengembalikan status `503` jika belum diset dalam Cloudflare).
- **Pesanan Dapur Masa Nyata**: Papan pemuka dapur berstatus auto-refresh setiap 5 saat untuk kemas kini pantas.
- **Katalog Menu Lengkap**:
  - Tambah, sunting, salin (*duplicate*), dan padam menu makanan.
  - **Tukar Harga Cepat (*Quick Price Change*)**: Tukar harga terus pada jadual tanpa perlu buka modal.
  - **Suis Aktif / Nyahaktif Segera**: Buka atau tutup ketersediaan menu dalam satu klik.
- **Mampatan Gambar Sisi Klien (<canvas>)**:
  - Dimampatkan automatik kepada saiz maksimum 480px.
  - Latar belakang putih untuk fail PNG lutsinar (mengelakkan latar belakang hitam).
  - Saiz akhir terjamin di bawah 95 KB dan disimpan ke D1 sebagai `ArrayBuffer` (`bytes.buffer`).
- **Pengurusan Kategori**:
  - Tambah, edit, susun, dan aktifkan kategori.
  - **Sekatan Keselamatan 409 Conflict**: Kategori tidak boleh dipadam jika masih mempunyai menu aktif yang terikat dengannya.
- **Tetapan Kedai**: Ubah nama kedai, banner pengumuman kiosk, dan suis Buka/Tutup operasi kedai secara langsung.

---

## 🗄️ Konfigurasi Cloudflare D1 & Worker

Konfigurasi di dalam `wrangler.toml`:
```toml
name = "jom-order"
main = "src/index.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "./public"
binding = "ASSETS"

[[d1_databases]]
binding = "DB"
database_name = "jom-order-db"
database_id = "95a4e179-57c7-402e-a46b-ffcacef422b7"
```

---

## 🚀 Panduan Pelaksanaan & Deploy

### 1. Set Kata Laluan Admin (`ADMIN_PASSWORD`)
Jalankan arahan berikut di terminal komputer anda untuk menetapkan kata laluan CMS:
```bash
npx wrangler secret put ADMIN_PASSWORD
```
Masukkan kata laluan pilihan anda (cth: `RahsiaKopitiam2026`).

### 2. Auto-Deploy GitHub Actions ke Cloudflare
Projek ini telah dilengkapi dengan `.github/workflows/deploy.yml`. 

Untuk mengaktifkan auto-deploy setiap kali anda `git push` ke cawangan `main`:
1. Pergi ke repositori GitHub anda ➔ **Settings** ➔ **Secrets and variables** ➔ **Actions**.
2. Tambah dua rahsia (*Repository Secrets*):
   - `CLOUDFLARE_API_TOKEN`: Token API Cloudflare anda (dengan kebenaran Cloudflare Workers & D1).
   - `CLOUDFLARE_ACCOUNT_ID`: ID Akaun Cloudflare anda (boleh didapati di dashboard Cloudflare).

Setiap kali anda melakukan perubahan kod dan push ke GitHub, GitHub Actions akan menjalankan `npm ci` dan `npx wrangler deploy` secara automatik.

### 3. Pembangunan Tempatan (Local Development)
Untuk menguji di komputer anda sendiri:
```bash
npm install
npm run dev
```
Buka penyemak imbas anda di:
- Skrin Kiosk: `http://localhost:8787/`
- Panel Admin: `http://localhost:8787/admin.html`
