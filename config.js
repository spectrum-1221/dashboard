// ============================================================
//  KONFIGURASI DASHBOARD KAS DAN SALDO
//  Yang biasanya perlu disesuaikan: SQL_MUTASI dan KATEGORI.
// ============================================================

// Satu query yang mengembalikan mutasi akun Kas/Bank per tanggal.
// Kolom WAJIB (nama alias harus persis):
//   tanggal | kode | nama | dimensi | nilai
// nilai = debit - kredit (saldo bertambah kalau positif).
// Placeholder: {{awal}} = 1 Januari tahun terpilih, {{sampai}} = tanggal paling akhir yang dibutuhkan.
// Transaksi sebelum {{awal}} dijadikan satu baris (saldo awal) lewat GREATEST().
//
// CATATAN: nama tabel/kolom di bawah adalah TEBAKAN. Cocokkan dengan skema Zahir Online
// yang sebenarnya (pakai http://localhost:3000/api/skema?cari=jurnal untuk melihat tabel/kolom).
const SQL_MUTASI = `
SELECT GREATEST(j.tanggal, DATE '{{awal}}')  AS tanggal,
       a.kode                                AS kode,
       a.nama                                AS nama,
       COALESCE(d.nama, '')                  AS dimensi,
       SUM(jd.debit - jd.kredit)             AS nilai
FROM   jurnal_detail jd
JOIN   jurnal j        ON j.id = jd.jurnal_id
JOIN   akun   a        ON a.id = jd.akun_id
LEFT JOIN dimensi d    ON d.id = jd.dimensi_id
WHERE  a.tipe IN ('Kas', 'Bank')
  AND  j.tanggal <= DATE '{{sampai}}'
GROUP BY 1, 2, 3, 4
`;

// Akun yang namanya cocok regex ini dianggap SALDO TUNAI, sisanya SALDO REKENING.
const TUNAI_REGEX = /^(kas|petty)/i;

// Enam kategori dana. Urutan di sini = urutan tampil di grafik dan kotak hijau.
// Baris mutasi masuk ke kategori PERTAMA yang cocok, dicek terhadap
// "kode nama" akun (akun) atau nama dimensi/proyek/departemen (dimensi).
// Contoh pola di bawah hanya tebakan, ganti dengan nama akun/dimensi aslinya.
const KATEGORI = [
  { nama: 'Uang Kuliah',                         akun: /kuliah|spp/i,           dimensi: /uang kuliah|spp/i },
  { nama: 'Lainnya dari Mahasiswa',              akun: /^(?!.*non).*mahasiswa/i, dimensi: /^(?!.*non).*mahasiswa/i },
  { nama: 'Kerjasama, Hibah, Bantuan dan Beasiswa', akun: /kerjasama|hibah|bantuan|beasiswa/i, dimensi: /kerjasama|hibah|bantuan|beasiswa/i },
  { nama: 'Kegiatan Usaha',                      akun: /usaha/i,                dimensi: /usaha/i },
  { nama: 'Lainnya Non-Mahasiswa',               akun: /non.?mahasiswa/i,       dimensi: /non.?mahasiswa/i },
  { nama: 'Petty Cash',                          akun: /petty/i,                dimensi: /petty/i },
];

// Warna mengikuti palet Highcharts seperti di contoh.
const WARNA = ['#7cb5ec', '#434348', '#90ed7d', '#f7a35c', '#8085e9', '#f15c80', '#999999'];

module.exports = { SQL_MUTASI, TUNAI_REGEX, KATEGORI, WARNA };
