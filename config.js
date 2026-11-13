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
// Kolom hasil: tanggal | kode | nama | departemen | proyek | dimensi | nilai   (nilai = debit - kredit)
// Placeholder: {{awal}} = 1 Januari tahun terpilih, {{sampai}} = tanggal terakhir yang dibutuhkan, {{filterAkun}}.
// Transaksi sebelum {{awal}} dijadikan satu baris saldo awal bertanggal {{awal}} - 1 hari.
// Dimensi = nama departemen dan/atau proyek pada baris jurnal (dipakai untuk menentukan kategori dana).
// Tabel/kolom mengikuti query bawaan Zahir Insight (bb_trx): g_jurnal, jurnalvc, kiraan, subklas, klas, dept, job.
const SQL_MUTASI = `
SELECT (CASE WHEN g.tanggal::date < DATE '{{awal}}' THEN DATE '{{awal}}' - 1
             ELSE g.tanggal::date END)                                              AS tanggal,
       k.code                                                                       AS kode,
       k.nama                                                                       AS nama,
       COALESCE(d.nama, '')                                                         AS departemen,
       COALESCE(p.namapekerjaan, '')                                                AS proyek,
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
GROUP BY 1, 2, 3, 4, 5, 6
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

// ---- Pengaturan kategori BAWAAN ----
// Ini hanya titik awal. Tiap pemakai bisa mengubahnya dari menu "Pengaturan kategori" di dashboard
// (tersimpan per perusahaan di browser, bisa diekspor/diimpor sebagai JSON).
// Aturan: { by: 'akun' | 'kode' | 'departemen' | 'proyek', op: 'in' | 'contains' | 'regex', nilai }
//   in       = sama dengan salah satu nilai terpilih (daftar; untuk 'akun' dicocokkan ke kode akun)
//   contains = mengandung salah satu kata (pisah dengan koma)
//   regex    = pola regex (tidak peka huruf besar/kecil)
// Baris kas/bank masuk ke kategori PERTAMA yang cocok; sisanya "Belum terkategori".
const pola = src => ['akun', 'departemen', 'proyek'].map(by => ({ by, op: 'regex', nilai: src }));
const KONFIG_DEFAULT = {
  kategori: [
    { nama: 'Uang Kuliah',                            warna: '#7cb5ec', aturan: pola('kuliah|spp') },
    { nama: 'Lainnya dari Mahasiswa',                 warna: '#434348', aturan: pola('^(?!.*non).*mahasiswa') },
    { nama: 'Kerjasama, Hibah, Bantuan dan Beasiswa', warna: '#90ed7d', aturan: pola('kerjasama|hibah|bantuan|beasiswa') },
    { nama: 'Kegiatan Usaha',                         warna: '#f7a35c', aturan: pola('usaha') },
    { nama: 'Lainnya Non-Mahasiswa',                  warna: '#8085e9', aturan: pola('non.?mahasiswa') },
    { nama: 'Petty Cash',                             warna: '#f15c80', aturan: pola('petty') },
  ],
  // Akun yang cocok dianggap SALDO TUNAI, sisanya SALDO REKENING.
  tunai: [{ by: 'akun', op: 'regex', nilai: '^(kas|petty)' }],
};

// Palet cadangan bila warna kategori tidak valid
const WARNA = ['#7cb5ec', '#434348', '#90ed7d', '#f7a35c', '#8085e9', '#f15c80', '#2b908f', '#e4d354', '#a6c96a', '#9a6fb0'];

module.exports = { SQL_MUTASI, SQL_AKUN_ASET, FILTER_AKUN, KONFIG_DEFAULT, WARNA };
