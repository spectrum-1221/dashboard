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
Alamat **Server** di layar login bisa berupa domain atau IP publik, dengan/tanpa port dan skema:
`go.zahironline.com`, `13.212.173.222`, `13.212.173.222:8989`, `http://13.212.173.222:8989`, `https://erp.contoh.com:8443`.
Tanpa skema: IP dianggap `http://`, domain dianggap `https://`. Di versi online (Vercel) alamat lokal/privat
(localhost, 10.x, 172.16-31.x, 192.168.x, 169.254.x) ditolak; untuk server di jaringan lokal jalankan aplikasi di jaringan yang sama.
Perhatian: koneksi `http://` ke server berarti email/password dari aplikasi ke server Zahir tidak terenkripsi di jaringan.
Slug perusahaan tidak wajib (ZahirERP lewat IP); bila ada dikirim sebagai header Slug, dan ID perusahaan sebagai X-Company-Id.

Opsional (env): `PORT`, `HOST`, `ZAHIR_INSECURE_TLS=1` (server on-premise self-signed),
`ZAHIR_ALLOWED_HOSTS`, `LOGIN_RSA_PRIVATE_KEY` (wajib di Vercel agar enkripsi password jalan).

## Yang perlu disesuaikan di `config.js`
Query memakai tabel bawaan Zahir Online yang sama dengan Zahir Insight (`g_jurnal`, `jurnalvc`, `kiraan`, `subklas`, `klas`, `dept`, `job`),
hanya jurnal berstatus `approved`.
1. `FILTER_AKUN`: akun mana yang dihitung sebagai Kas/Bank. Bawaan: klasifikasi 1 (aset) yang nama akun/sub-klasifikasinya memuat
   kas, bank, atau petty. Kalau ada akun yang tidak terambil, ubah, mis. `k.code IN ('1-1100','1-1200')`.

Kategori dana dan Saldo Tunai **tidak lagi diubah di `config.js`**, melainkan lewat tombol **Pengaturan kategori** di dashboard:
- Tambah, hapus, ganti nama, beri warna, dan urutkan kategori (urutan = prioritas; baris masuk ke kategori pertama yang cocok).
- Tiap kategori punya aturan (ATAU): berdasarkan **Akun**, **Kode akun**, **Departemen**, atau **Proyek**, dengan cara
  *salah satu dari daftar* (pilih/ketik, dari data yang sedang dimuat), *mengandung kata*, atau *regex*.
- Aturan **Saldo Tunai** diatur di halaman yang sama.
- Tersimpan di browser, terpisah per perusahaan. Ekspor/Impor JSON untuk membagikan ke pemakai lain. `config.js` (`KONFIG_DEFAULT`) hanya nilai awal.
- Di tabel Diagnosa, kolom **Atur** memindahkan satu akun ke kategori lain dengan sekali klik (bila masih tertahan kategori di atasnya, ada tawaran menaikkan prioritas).

Di dashboard ada panel **Diagnosa** (di bagian bawah): daftar akun/dimensi yang terhitung beserta kategorinya, dan tombol
"Lihat semua akun aset" untuk memilih `FILTER_AKUN`. Bila zsql membalas galat SQL, pesannya ditampilkan apa adanya.

## Catatan
- Filter **Periode** meniru Zahir Online: Hari Ini, Minggu Ini, Bulan Ini, Bulan Lalu, Kuartal Ini, Tahun Ini, Tahun Lalu,
  Pilih Bulan (ikon kalender), dan Custom (Dari-Sampai). Saldo (pie, bar, kotak) dihitung per tanggal akhir periode,
  grafik garis memakai tahun dari tanggal akhir, dan kotak biru menampilkan perubahan kas selama periode.
- Data dibaca lewat endpoint zsql (`/api/v2/zsql`) memakai Bearer token + header Slug dari perusahaan yang dipilih.
- Highcharts dipasang lokal (npm), tidak butuh CDN.
- Bulan yang belum terjadi di tahun berjalan tidak digambar di grafik garis.
