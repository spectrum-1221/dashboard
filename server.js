// Dashboard Kas dan Saldo — proxy tipis ke API Zahir Online / ZahirERP.
// Stateless: token, server, dan slug disimpan di browser (sessionStorage) dan dikirim per request lewat header.
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { SQL_MUTASI, TUNAI_REGEX, KATEGORI, WARNA } = require('./config');
const { mutasiDemo } = require('./demo');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1'; // hanya lokal; ganti 0.0.0.0 bila sengaja dibuka ke jaringan
const DEMO = process.env.DEMO === '1';
const IS_VERCEL = !!process.env.VERCEL;
if (process.env.ZAHIR_INSECURE_TLS === '1') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // server on-premise self-signed

// client_id:client_secret (base64) — sama dengan Zahir Insight. Login mencoba client Zahir Online GO dulu, lalu bawaan.
const DEFAULT_CLIENT_B64 = process.env.ZAHIR_CLIENT_B64 || 'NjljYjNlYTMxN2EzMmM0ZTYxNDNlNjY1ZmRiMjBiMTQ6MTAyNmQ1MWQyZTkwZjg=';
const GO_CLIENT_B64 = 'NjljYjNlYTMxN2EzMmM0ZTYxNDNlNjY1ZmRiMjBiMTQ6MTEyNmQ1MWQyZTkwZjg=';
const CLIENT_CANDIDATES = [...new Set([GO_CLIENT_B64, DEFAULT_CLIENT_B64])];
const COMPANY_ENDPOINTS = ['/api/v3/user_companies', '/api/v2/user_companies', '/api/v2/companies', '/api/v1/user_companies'];

// Kunci RSA: browser mengenkripsi password dengan kunci publik ini, jadi di DevTools hanya terlihat ciphertext.
// Di Vercel tiap instance berbeda, jadi kunci diambil dari env LOGIN_RSA_PRIVATE_KEY (PEM); tanpa itu login pakai Basic header (tetap HTTPS).
const { publicKey, privateKey } = process.env.LOGIN_RSA_PRIVATE_KEY
  ? (() => { const k = crypto.createPrivateKey(process.env.LOGIN_RSA_PRIVATE_KEY.replace(/\\n/g, '\n')); return { privateKey: k, publicKey: crypto.createPublicKey(k) }; })()
  : IS_VERCEL ? { publicKey: null, privateKey: null } : crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUB_JWK = publicKey ? publicKey.export({ format: 'jwk' }) : null;
const decryptPassword = b64 => crypto.privateDecrypt(
  { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(b64, 'base64')).toString('utf8');

function normServer(s) {
  s = String(s || '').trim().replace(/\/+$/, '');
  if (!s) throw new Error('Alamat server kosong');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  if (!/^https?:\/\/[\w.-]+(:\d{1,5})?$/i.test(s)) throw new Error('Alamat server tidak valid: ' + s);
  if (IS_VERCEL || process.env.ZAHIR_ALLOWED_HOSTS) { // versi online: wajib https, bukan alamat lokal/privat
    const host = s.replace(/^https?:\/\//i, '').replace(/:\d+$/, '').toLowerCase();
    if (!/^https:/i.test(s)) throw new Error('Versi online hanya bisa terhubung lewat https://');
    const allow = String(process.env.ZAHIR_ALLOWED_HOSTS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    if (allow.length) { if (!allow.some(d => host === d || host.endsWith('.' + d))) throw new Error('Domain tidak diizinkan. Domain yang diizinkan: ' + allow.join(', ')); }
    else if (!host.includes('.') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /\.(local|localhost|internal|lan|intranet)$/.test(host))
      throw new Error('Versi online hanya bisa terhubung ke domain publik. Untuk server lokal jalankan di komputer sendiri.');
  }
  return s;
}
const clientB64 = v => { v = String(v || '').trim(); return !v ? DEFAULT_CLIENT_B64 : v.includes(':') ? Buffer.from(v).toString('base64') : v; };

function explain(e, url) {
  const c = e.cause || e; const code = c.code || '';
  const host = (() => { try { return new URL(url).host; } catch { return url; } })();
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `Nama server ${host} tidak ditemukan (DNS). Periksa ejaan alamat server.`;
  if (code === 'ECONNREFUSED') return `Koneksi ke ${host} ditolak. Server mati, port salah, atau hanya bisa diakses dari jaringan internal/VPN.`;
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return `Koneksi ke ${host} time-out. Periksa firewall/VPN.`;
  if (/CERT|certificate|self.signed|SSL|TLS/i.test(code + ' ' + c.message)) return `Sertifikat HTTPS ${host} tidak dipercaya (self-signed). Jalankan dengan ZAHIR_INSECURE_TLS=1 atau pakai http://.`;
  return `Tidak bisa menghubungi ${host}: ${c.message || e.message}${code ? ' (' + code + ')' : ''}`;
}
async function zfetch(url, headers = {}, method = 'GET', body) {
  let r;
  try {
    r = await fetch(url, { method, headers: { Accept: 'application/json', 'Content-Language': 'id', ...headers }, body, signal: AbortSignal.timeout(120000) });
  } catch (e) { throw new Error(explain(e, url)); }
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: r.status, json, text };
}

// ---------- zsql ----------
const decodeHtml = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
// Respons zsql berupa tabel HTML (is_show_as_table=true); JSON juga ditangani bila suatu saat berubah.
function parseRespons(teks) {
  const t = teks.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    try { const j = JSON.parse(t); const arr = Array.isArray(j) ? j : (j.data || j.rows || j.result || j.results || []); if (Array.isArray(arr)) return arr; } catch { /* lanjut parser HTML */ }
  }
  const baris = [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m =>
    [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(c => decodeHtml(c[1].replace(/<[^>]*>/g, '')).trim()));
  if (!baris.length) throw new Error('Respons zsql tidak berisi tabel: ' + t.slice(0, 200));
  const [kepala, ...isi] = baris;
  const kunci = kepala.map(k => k.toLowerCase());
  return isi.map(r => Object.fromEntries(kunci.map((k, i) => [k, r[i]])));
}
function ctxDari(req) {
  const token = req.get('x-zahir-token'); if (!token) throw Object.assign(new Error('Belum login'), { status: 401 });
  const slug = (req.get('x-zahir-slug') || '').trim();
  if (!slug && !DEMO) throw Object.assign(new Error('Perusahaan belum dipilih'), { status: 400 });
  return { token, slug, client: req.get('x-zahir-client'), base: DEMO ? '' : normServer(req.get('x-zahir-base')) };
}
async function zsql(ctx, query) {
  const body = new FormData(); body.append('query', query);
  const headers = { Authorization: 'Bearer ' + ctx.token, client: clientB64(ctx.client), Slug: ctx.slug, 'X-Slug': ctx.slug };
  const r = await zfetch(`${ctx.base}/api/v2/zsql?is_show_as_table=true`, headers, 'POST', body);
  if (r.status === 401) throw Object.assign(new Error('Sesi habis atau token ditolak (401). Keluar lalu masuk lagi.'), { status: 401 });
  if (r.status >= 300) throw new Error(`zsql HTTP ${r.status}: ${r.text.slice(0, 300)}`);
  return parseRespons(r.text);
}

// ---------- Hitung dashboard ----------
function angka(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/\s/g, '');
  if (!s) return 0;
  if (/,\d{1,2}$/.test(s) && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
  else s = s.replace(/,/g, '');                                                           // 1,234.56
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
function tgl(v) {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = String(v ?? '').match(/^(\d{2})[/-](\d{2})[/-](\d{4})/); return d ? `${d[3]}-${d[2]}-${d[1]}` : null; // dd/mm/yyyy
}
const kategoriDari = r => KATEGORI.findIndex(k => k.akun.test(`${r.kode} ${r.nama}`) || (r.dimensi && k.dimensi.test(r.dimensi))); // -1 = tak terkategori

function hitung(mutasi, tahun, tanggal) {
  const rows = mutasi.map(r => ({ tanggal: tgl(r.tanggal), kode: r.kode ?? '', nama: r.nama ?? '', dimensi: r.dimensi ?? '', nilai: angka(r.nilai) })).filter(r => r.tanggal);
  rows.forEach(r => { r.kat = kategoriDari(r); r.tunai = TUNAI_REGEX.test(r.nama); });
  const sampaiTgl = batas => rows.filter(r => r.tanggal <= batas);

  // Grafik garis: saldo akhir tiap bulan (bulan yang belum terjadi tidak digambar)
  const sekarang = new Date().toISOString().slice(0, 10);
  const bulanan = [];
  for (let m = 1; m <= 12; m++) {
    const akhir = new Date(Date.UTC(tahun, m, 0)).toISOString().slice(0, 10);
    if (`${tahun}-${String(m).padStart(2, '0')}-01` > sekarang) { bulanan.push(null); continue; }
    bulanan.push(Math.round(sampaiTgl(akhir).reduce((s, r) => s + r.nilai, 0)));
  }
  // Pie/bar/kotak: saldo per tanggal
  const aktif = sampaiTgl(tanggal);
  const kategori = KATEGORI.map((k, i) => ({ nama: k.nama, warna: WARNA[i], saldo: Math.round(aktif.filter(r => r.kat === i).reduce((s, r) => s + r.nilai, 0)) }));
  const taktegori = Math.round(aktif.filter(r => r.kat === -1).reduce((s, r) => s + r.nilai, 0));
  const tunai = Math.round(aktif.filter(r => r.tunai).reduce((s, r) => s + r.nilai, 0));
  const total = Math.round(aktif.reduce((s, r) => s + r.nilai, 0));
  return { tahun, tanggal, bulanan, kategori, taktegori, tunai, rekening: total - tunai, total };
}

// ---------- Server ----------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules/highcharts')));
app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false, setHeaders: (res, fp) => { if (/\.(html|js)$/.test(fp)) res.setHeader('Cache-Control', 'no-store'); } }));

app.get('/auth/pubkey', (req, res) => res.json({ jwk: PUB_JWK })); // null = kredensial lewat header Basic (HTTPS)
app.get('/version', (req, res) => res.json({ demo: DEMO }));

// 1) Login = GET /api/v2/me, Basic email:password + header client
app.post('/auth/login', async (req, res) => {
  try {
    let password = '', via = 'basic';
    if (req.body.password_enc) {
      via = 'rsa';
      try { password = decryptPassword(req.body.password_enc); }
      catch { return res.status(400).json({ error: 'Password terenkripsi tidak valid (server mungkin baru restart) — muat ulang halaman lalu login lagi' }); }
    } else if (req.get('authorization')?.startsWith('Basic ')) {
      const [u, ...p] = Buffer.from(req.get('authorization').slice(6), 'base64').toString('utf8').split(':');
      password = p.join(':'); if (!req.body.username) req.body.username = u;
    }
    if (!req.body.username || !password) return res.status(400).json({ error: 'Email dan password wajib diisi' });
    if (DEMO) return res.json({ server: 'https://demo.zahironline.com', client: '', me: { first_name: 'Pengguna', last_name: 'Demo', email: req.body.username, access_token: 'demo' } });

    const server = normServer(req.body.server);
    const basic = 'Basic ' + Buffer.from(`${req.body.username}:${password}`).toString('base64');
    const tries = String(req.body.client || '').trim() ? [clientB64(req.body.client)] : CLIENT_CANDIDATES;
    let r = null, usedClient = tries[0];
    for (const c of tries) { usedClient = c; r = await zfetch(server + '/api/v2/me', { Authorization: basic, client: c }); if (r.status !== 401) break; }
    if (!r.json?.access_token) {
      const msg = r.json?.error?.message || r.json?.message || r.json?.detail?.message || (r.status === 401 ? 'Email / password salah' : 'Token tidak ada di respons');
      const hint = r.status === 401 ? ` — dicoba ke server "${server.replace(/^https?:\/\//i, '')}", email "${req.body.username}", password ${password.length} karakter${password !== password.trim() ? ' (ADA spasi di awal/akhir)' : ''}, dikirim via ${via}.` : '';
      return res.status(r.status === 200 ? 502 : r.status).json({ error: `Login gagal (HTTP ${r.status}): ${msg}${hint}` });
    }
    res.json({ server, me: r.json, client: usedClient });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2) Daftar perusahaan — coba beberapa endpoint berurutan
app.post('/auth/companies', async (req, res) => {
  try {
    if (DEMO) return res.json({ endpoint: null, results: [
      { id: 1, name: 'Universitas Contoh Nusantara', slug: 'unc.zahironline.com', version: '6.2', edition: 'enterprise', membership: { status: 'Active', expired_at: '2027-03-31' } },
      { id: 2, name: 'Yayasan Pendidikan Demo', slug: 'ypd.zahironline.com', version: '6.2', edition: 'advanced', membership: { status: 'Active', expired_at: '2026-12-31' } },
      { id: 3, name: 'PT Percobaan Mandiri', slug: 'ptpm.zahironline.com', version: '6.1', edition: 'standard', membership: { status: 'Trial', expired_at: '2026-11-30' } },
    ] });
    const server = normServer(req.body.server);
    const token = req.body.token; if (!token) return res.status(401).json({ error: 'Belum login' });
    const headers = { Authorization: 'Bearer ' + token, client: clientB64(req.body.client) };
    const notes = [];
    const QUERIES = ['?per_page=500&sort[company.name]=asc&company[membership][status][$nin]=INACTIVE', '?per_page=500&sort[company.name]=asc', '?per_page=500', ''];
    for (const ep of COMPANY_ENDPOINTS) {
      for (const q of QUERIES) {
        const r = await zfetch(server + ep + q, headers);
        const list = r.json?.results || r.json?.data || r.json?.companies || (Array.isArray(r.json) ? r.json : null);
        if (r.status === 200 && Array.isArray(list) && list.length) return res.json({ endpoint: ep, results: list });
        notes.push(`${ep}${q ? '?…' : ''}: HTTP ${r.status}${r.status === 200 ? ', 0 perusahaan' : ''}`);
      }
    }
    res.json({ endpoint: null, results: [], notes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3) Detail satu perusahaan
app.post('/auth/company', async (req, res) => {
  try {
    if (DEMO) return res.json({});
    const server = normServer(req.body.server);
    const { token, id, endpoint } = req.body;
    if (!token) return res.status(401).json({ error: 'Belum login' });
    const r = await zfetch(server + (endpoint || '/api/v2/user_companies') + '/' + encodeURIComponent(id), { Authorization: 'Bearer ' + token, client: clientB64(req.body.client) });
    res.status(r.status).json(r.json);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4) Data dashboard
app.get('/api/dashboard', async (req, res) => {
  try {
    const ctx = ctxDari(req);
    const tahun = parseInt(req.query.tahun, 10) || new Date().getFullYear();
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(req.query.tanggal || '') ? req.query.tanggal : `${tahun}-12-31`;
    const awal = `${tahun}-01-01`;
    const sampai = [tanggal, `${tahun}-12-31`].sort().pop();
    const mutasi = DEMO ? mutasiDemo(tahun, sampai) : await zsql(ctx, SQL_MUTASI.replaceAll('{{awal}}', awal).replaceAll('{{sampai}}', sampai));
    res.json(hitung(mutasi, tahun, tanggal));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Bantu cocokkan nama tabel/kolom: /api/skema?cari=jurnal (pakai sesi login di browser; atau lihat tombol "Cek skema" di dashboard)
app.get('/api/skema', async (req, res) => {
  try {
    const ctx = ctxDari(req);
    const cari = String(req.query.cari || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!cari) return res.status(400).json({ error: 'isi ?cari=kata (huruf/angka/_)' });
    if (DEMO) return res.json([{ table_name: 'jurnal_detail', column_name: 'debit', data_type: 'numeric' }]);
    res.json(await zsql(ctx, `SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND (table_name ILIKE '%${cari}%' OR column_name ILIKE '%${cari}%')
      ORDER BY table_name, ordinal_position LIMIT 300`));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.listen(PORT, HOST, () => console.log(`Dashboard Kas: http://${HOST}:${PORT}${DEMO ? '  (MODE DEMO: login apa saja diterima)' : ''}`));
module.exports = app;
