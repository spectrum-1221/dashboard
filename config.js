// ============================================================
//  KONFIGURASI DASHBOARD KAS DAN SALDO
//  Yang biasanya perlu disesuaikan: FILTER_AKUN dan KATEGORI.
// ============================================================

// Penentu akun mana yang dihitung sebagai Kas/Bank (potongan SQL, dipasang ke {{filterAkun}}).
// Alias yang tersedia: k = kiraan (akun), s = subklas, k2 = klas, jv = jurnalvc, g = g_jurnal.
// Bawaan: akun berklasifikasi 1 (aset) yang nama akun atau nama sub-klasifikasinya memuat kata kas / bank / petty.
// Kalau di perusahaan Anda ada akun kas/bank yang tidak terambil (atau akun lain ikut terhitung), ubah di sini,
// misalnya per kode akun:   k.code IN ('1-1100','1-1200','1-1300')   atau   k.code LIKE '1-1%'
const FILTER_AKUN = `
  k2.noklasifikasi::text = '1'
  AND (COALESCE(k.nama, '') || ' ' || COALESCE(to_jsonb(s) ->> 'nama', to_jsonb(s) ->> 'name', ''))
      ~* '(^|[^a-z])(kas|bank|petty)([^a-z]|$)'
`;

// Satu query yang mengembalikan mutasi akun Kas/Bank per tanggal (jurnal berstatus approved).
// Kolom hasil WAJIB: tanggal | kode | nama | dimensi | nilai   (nilai = debit - kredit)
// Placeholder: {{awal}} = 1 Januari tahun terpilih, {{sampai}} = tanggal terakhir yang dibutuhkan, {{filterAkun}}.
// Transaksi sebelum {{awal}} dijadikan satu baris (saldo awal) lewat GREATEST().
// Dimensi = nama departemen dan/atau proyek pada baris jurnal (dipakai untuk menentukan kategori dana).
// Tabel/kolom mengikuti query bawaan Zahir Insight (bb_trx): g_jurnal, jurnalvc, kiraan, subklas, klas, dept, job.
const SQL_MUTASI = `
SELECT GREATEST(g.tanggal::date, DATE '{{awal}}')                                   AS tanggal,
       k.code                                                                       AS kode,
       k.nama                                                                       AS nama,
       concat_ws(' / ', NULLIF(d.nama, ''), NULLIF(p.namapekerjaan, ''))            AS dimensi,
       SUM(COALESCE(jv.debit, 0) - COALESCE(jv.kredit, 0))::numeric(20,2)           AS nilai
FROM   g_jurnal g
JOIN   jurnalvc jv ON jv.transaction_id = g.id
JOIN   kiraan k    ON k.id  = jv.account_id
JOIN   subklas s   ON s.id  = k.subclassification_id
JOIN   klas k2     ON k2.id = s.classification_id
LEFT JOIN dept d   ON d.id  = jv.department_id
LEFT JOIN (SELECT DISTINCT ON (project_id) project_id, namapekerjaan
           FROM job ORDER BY project_id) p ON p.project_id = jv.project_id
WHERE  g.status = 'approved'
  AND  g.tanggal::date <= DATE '{{sampai}}'
  AND  ({{filterAkun}})
GROUP BY 1, 2, 3, 4
`;

// Daftar semua akun aset (klasifikasi 1) + jumlah baris jurnal, untuk membantu memilih FILTER_AKUN.
const SQL_AKUN_ASET = `
SELECT k.code AS kode, k.nama AS nama,
       COALESCE(to_jsonb(s) ->> 'nama', to_jsonb(s) ->> 'name', '') AS subklas,
       COUNT(jv.id) AS jumlah_baris,
       SUM(COALESCE(jv.debit, 0) - COALESCE(jv.kredit, 0))::numeric(20,2) AS saldo
FROM   kiraan k
JOIN   subklas s ON s.id  = k.subclassification_id
JOIN   klas k2   ON k2.id = s.classification_id
LEFT JOIN (jurnalvc jv JOIN g_jurnal g ON g.id = jv.transaction_id AND g.status = 'approved') ON jv.account_id = k.id
WHERE  k2.noklasifikasi::text = '1'
GROUP BY k.code, k.nama, 3
ORDER BY k.code
`;

// Akun yang namanya cocok regex ini dianggap SALDO TUNAI, sisanya SALDO REKENING.
const TUNAI_REGEX = /^(kas|petty)/i;

// Enam kategori dana. Urutan di sini = urutan tampil di grafik dan kotak hijau.
// Baris mutasi masuk ke kategori PERTAMA yang cocok, dicek terhadap
// "kode nama" akun (akun) atau nama dimensi/proyek/departemen (dimensi).
// Contoh pola di bawah hanya tebakan, ganti dengan nama akun/dimensi aslinya.
const KATEGORI = [
  { nama: 'Uang Kuliah',                            akun: /kuliah|spp/i,           dimensi: /uang kuliah|spp/i },
  { nama: 'Lainnya dari Mahasiswa',                 akun: /^(?!.*non).*mahasiswa/i, dimensi: /^(?!.*non).*mahasiswa/i },
  { nama: 'Kerjasama, Hibah, Bantuan dan Beasiswa', akun: /kerjasama|hibah|bantuan|beasiswa/i, dimensi: /kerjasama|hibah|bantuan|beasiswa/i },
  { nama: 'Kegiatan Usaha',                         akun: /usaha/i,                dimensi: /usaha/i },
  { nama: 'Lainnya Non-Mahasiswa',                  akun: /non.?mahasiswa/i,       dimensi: /non.?mahasiswa/i },
  { nama: 'Petty Cash',                             akun: /petty/i,                dimensi: /petty/i },
];

// Warna mengikuti palet Highcharts seperti di contoh.
const WARNA = ['#7cb5ec', '#434348', '#90ed7d', '#f7a35c', '#8085e9', '#f15c80', '#999999'];

module.exports = { SQL_MUTASI, SQL_AKUN_ASET, FILTER_AKUN, TUNAI_REGEX, KATEGORI, WARNA };
