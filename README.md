# Dashboard Kas dan Saldo (Zahir Online / ZahirERP)

Web Node/Express dengan alur yang sama seperti Zahir Insight (spectrum-1221/zahir-report):
**Masuk** (server, email, password) → **Pilih Perusahaan** → **Dashboard** (grafik garis kas per bulan,
pie dan bar dana per kategori, kotak Saldo Tunai/Rekening/Total, kotak saldo per kategori).

Token dan slug berasal dari login akun Zahir, jadi tidak ada `.env` token lagi.
Password dienkripsi RSA-OAEP di browser sebelum dikirim ke server lokal; sesi disimpan di sessionStorage (hilang saat tab ditutup).

## Menjalankan
```
npm install
npm run demo     # login apa saja diterima, data contoh -> http://127.0.0.1:3000
npm start        # pakai server Zahir sungguhan
```
Opsional (env): `PORT`, `HOST`, `ZAHIR_INSECURE_TLS=1` (server on-premise self-signed),
`ZAHIR_ALLOWED_HOSTS`, `LOGIN_RSA_PRIVATE_KEY` (wajib di Vercel agar enkripsi password jalan).

## Yang WAJIB disesuaikan di `config.js`
1. `SQL_MUTASI`: nama tabel/kolom di sana adalah tebakan. Kolom hasil harus: `tanggal, kode, nama, dimensi, nilai`
   (nilai = debit - kredit). Untuk melihat tabel/kolom asli, setelah login buka di console browser:
   `fetch('/api/skema?cari=jurnal',{headers:{'x-zahir-base':st.dataBase,'x-zahir-token':st.token,'x-zahir-slug':st.slug}}).then(r=>r.json()).then(console.table)`
2. `KATEGORI`: pola regex nama akun / dimensi untuk 6 kategori dana. Saldo yang tidak cocok muncul sebagai "Belum terkategori".
3. `TUNAI_REGEX`: akun yang dianggap tunai (sisanya rekening).

## Catatan
- Data dibaca lewat endpoint zsql (`/api/v2/zsql`) memakai Bearer token + header Slug dari perusahaan yang dipilih.
- Highcharts dipasang lokal (npm), tidak butuh CDN.
- Bulan yang belum terjadi di tahun berjalan tidak digambar di grafik garis.
