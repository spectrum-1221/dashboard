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

## Yang perlu disesuaikan di `config.js`
Query memakai tabel bawaan Zahir Online yang sama dengan Zahir Insight (`g_jurnal`, `jurnalvc`, `kiraan`, `subklas`, `klas`, `dept`, `job`),
hanya jurnal berstatus `approved`.
1. `FILTER_AKUN`: akun mana yang dihitung sebagai Kas/Bank. Bawaan: klasifikasi 1 (aset) yang nama akun/sub-klasifikasinya memuat
   kas, bank, atau petty. Kalau ada akun yang tidak terambil, ubah, mis. `k.code IN ('1-1100','1-1200')`.
2. `KATEGORI`: pola regex nama akun / dimensi (departemen dan proyek) untuk 6 kategori dana. Saldo yang tidak cocok muncul sebagai "Belum terkategori".
3. `TUNAI_REGEX`: akun yang dianggap tunai (sisanya rekening).

Di dashboard ada panel **Diagnosa** (di bagian bawah): daftar akun/dimensi yang terhitung beserta kategorinya, dan tombol
"Lihat semua akun aset" untuk memilih `FILTER_AKUN`. Bila zsql membalas galat SQL, pesannya ditampilkan apa adanya.

## Catatan
- Data dibaca lewat endpoint zsql (`/api/v2/zsql`) memakai Bearer token + header Slug dari perusahaan yang dipilih.
- Highcharts dipasang lokal (npm), tidak butuh CDN.
- Bulan yang belum terjadi di tahun berjalan tidak digambar di grafik garis.
