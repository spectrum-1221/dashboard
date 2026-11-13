// Data contoh (DEMO=1) supaya dashboard bisa dicoba tanpa koneksi Zahir.
// Bentuknya sama dengan hasil SQL_MUTASI: {tanggal, kode, nama, dimensi, nilai}
function mutasiDemo(tahun, sampai) {
  const akun = [
    { kode: '1-1001', nama: 'Kas Besar',          dim: 'Uang Kuliah',            skala: 3.0e8 },
    { kode: '1-1002', nama: 'Bank BNI Operasional', dim: 'Uang Kuliah',          skala: 9.0e8 },
    { kode: '1-1003', nama: 'Bank Mandiri Mahasiswa', dim: 'Lainnya dari Mahasiswa', skala: 2.2e8 },
    { kode: '1-1004', nama: 'Bank BRI Hibah',     dim: 'Kerjasama Hibah Beasiswa', skala: 5.5e8 },
    { kode: '1-1005', nama: 'Bank BCA Usaha',     dim: 'Kegiatan Usaha',         skala: 1.4e8 },
    { kode: '1-1006', nama: 'Bank BTN Non Mahasiswa', dim: 'Lainnya Non-Mahasiswa', skala: 7.5e8 },
    { kode: '1-1007', nama: 'Petty Cash',         dim: 'Petty Cash',             skala: 0.8e7 },
  ];
  const rows = [];
  let seed = tahun;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (const a of akun) {
    // saldo awal
    rows.push({ tanggal: `${tahun}-01-01`, kode: a.kode, nama: a.nama, dimensi: a.dim, nilai: a.skala * 3 });
    for (let m = 1; m <= 12; m++) {
      const hari = new Date(tahun, m, 0).getDate();
      for (const d of [5, 15, 25]) {
        if (d > hari) continue;
        const t = `${tahun}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (t > sampai) continue;
        rows.push({ tanggal: t, kode: a.kode, nama: a.nama, dimensi: a.dim, nilai: Math.round(a.skala * (rnd() - 0.35) * 0.25) });
      }
    }
  }
  return rows;
}
module.exports = { mutasiDemo };
