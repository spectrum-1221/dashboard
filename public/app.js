const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const rp = n => new Intl.NumberFormat('id-ID').format(Math.round(n));
const tglPanjang = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${BULAN[m - 1]} ${y}`; };

// sessionStorage = sesi login (hilang saat tab ditutup); localStorage = daftar server saja
const S = { get(k){ try{ return JSON.parse(sessionStorage.getItem('zdk.'+k)); }catch{ return null; } }, set(k,v){ try{ sessionStorage.setItem('zdk.'+k, JSON.stringify(v)); }catch{} }, del(k){ try{ sessionStorage.removeItem('zdk.'+k); }catch{} } };
const L = { get(k){ try{ return JSON.parse(localStorage.getItem('zdk.'+k)); }catch{ return null; } }, set(k,v){ try{ localStorage.setItem('zdk.'+k, JSON.stringify(v)); }catch{} } };
const st = { server:null, token:null, client:'', me:null, companies:[], coEndpoint:null, dataBase:null, slug:'', company:null };

const ov = { show(t, s=''){ $('#ovTitle').innerHTML = '<span class="spin"></span> ' + esc(t); $('#ovSub').textContent = s; $('#ov').classList.remove('hide'); }, hide(){ $('#ov').classList.add('hide'); } };
function showPage(id){ for (const p of ['pgCo','pgDash']) $('#'+p).classList.toggle('hide', p !== id); $('#btnDb').classList.toggle('hide', id === 'pgCo'); window.scrollTo(0,0); }
async function post(url, body, extra={}){ const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', ...extra }, body:JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }
function headersData(){ const h = { 'x-zahir-base': st.dataBase, 'x-zahir-token': st.token, 'x-zahir-slug': st.slug }; if (st.client) h['x-zahir-client'] = st.client; return h; }

/* cari nilai primitif dari daftar nama kunci (struktur API bisa beda per versi) */
function pick(obj, keys, depth=0, seen=new Set()){
  if (!obj || typeof obj !== 'object' || depth > 4 || seen.has(obj)) return undefined; seen.add(obj);
  for (const k of keys) if (obj[k] != null && typeof obj[k] !== 'object') return obj[k];
  for (const v of Object.values(obj)) { const r = pick(v, keys, depth+1, seen); if (r !== undefined) return r; }
}
const findSlug = o => { const v = pick(o, ['slug','url','api_url','base_url','host','domain','subdomain']); return (typeof v === 'string' && /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(:\d+)?/i.test(v)) ? v : ''; };
const coName = c => c?.company?.name || c?.name || c?.company_name || c?.title || '(tanpa nama)';
const coId = c => c?.company?.id || c?.id || c?.company_id;

/* ---------- login ---------- */
function saveServer(v){ v = (v||'').trim(); if (!v) return; const hist = [v, ...(L.get('servers')||[]).filter(x => x !== v)].slice(0, 8); L.set('servers', hist); $('#srvList').innerHTML = hist.map(h => `<option value="${esc(h)}">`).join(''); }
(function initLogin(){
  const hist = L.get('servers') || ['go.zahironline.com'];
  $('#srvList').innerHTML = hist.map(h => `<option value="${esc(h)}">`).join(''); $('#server').value = hist[0] || '';
  $('#btnSaveSrv').onclick = () => { saveServer($('#server').value); $('#srvSaved').textContent = 'Tersimpan sebagai server utama'; setTimeout(() => $('#srvSaved').textContent = '', 2500); };
})();
$('#frmLogin').addEventListener('submit', async e => {
  e.preventDefault(); $('#loginErr').textContent = ''; $('#btnLogin').disabled = true; $('#btnLogin').textContent = 'Menghubungkan…';
  try {
    const body = { server: $('#server').value, username: $('#user').value }; const pass = $('#pass').value; const hdr = {};
    const { jwk } = window.crypto?.subtle ? await (await fetch('/auth/pubkey')).json() : { jwk: null };
    if (jwk) { // password dienkripsi RSA-OAEP: di DevTools hanya terlihat ciphertext
      const key = await crypto.subtle.importKey('jwk', jwk, { name:'RSA-OAEP', hash:'SHA-256' }, false, ['encrypt']);
      const buf = await crypto.subtle.encrypt({ name:'RSA-OAEP' }, key, new TextEncoder().encode(pass));
      body.password_enc = btoa(String.fromCharCode(...new Uint8Array(buf)));
    } else hdr.Authorization = 'Basic ' + btoa(unescape(encodeURIComponent($('#user').value + ':' + pass)));
    const r = await post('/auth/login', body, hdr);
    st.server = r.server; st.token = r.me.access_token; st.me = r.me; st.client = r.client || '';
    saveServer($('#server').value);
    S.set('sess', { server: st.server, token: st.token, me: st.me, client: st.client });
    $('#pass').value = ''; enterApp();
  } catch (err) { $('#loginErr').textContent = err.message; }
  finally { $('#btnLogin').disabled = false; $('#btnLogin').textContent = 'Masuk'; }
});

function enterApp(){
  $('#login').classList.add('hide'); $('#app').classList.remove('hide');
  const nm = `${st.me?.first_name||''} ${st.me?.last_name||''}`.trim() || st.me?.username || '';
  $('#whoami').innerHTML = `<b>${esc(nm)}</b> · ${esc(st.me?.email||'')}`; $('#sName').textContent = nm; $('#sEmail').textContent = st.me?.email || '';
  showPage('pgCo'); loadCompanies();
}
$('#btnLogout').onclick = () => { S.del('sess'); location.reload(); };
$('#btnDb').onclick = $('#crumbCo').onclick = e => { e.preventDefault?.(); showPage('pgCo'); };
$('#btnReload').onclick = () => loadCompanies();

/* ---------- pilih perusahaan ---------- */
let dbSel = -1;
async function loadCompanies(){
  $('#coBody').innerHTML = '<tr><td colspan="5" class="empty">Mengambil daftar perusahaan…</td></tr>'; $('#dbErr').textContent = ''; $('#coCnt').textContent = '—';
  try {
    const r = await post('/auth/companies', { server: st.server, token: st.token, client: st.client });
    st.coEndpoint = r.endpoint;
    st.companies = (r.results || []).map(c => ({ raw:c, id:coId(c), name:coName(c), slug:findSlug(c),
      version: pick(c, ['version','product_version','app_version','api_version']) ?? '',
      edition: pick(c, ['edition','product_type','product','package','variant_name']) ?? '',
      expired: pick(c.membership || c.company?.membership || {}, ['expired_at','expired_date','expiry_date','expire_at','expired','end_date']) ?? pick(c, ['expired_at','expired_date','expiry_date','expire_at','expired','end_date']) ?? '',
      status: normStatus(c.membership?.status ?? c.company?.membership?.status ?? pick(c, ['membership_status','status'])) }))
      .map(c => { const d = c.expired ? new Date(c.expired) : null; if (d && !isNaN(d) && d < new Date(new Date().toDateString()) && c.status !== 'INACTIVE') c.status = 'Expired'; return c; })
      .filter(c => c.status !== 'INACTIVE')
      .sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity:'base' }));
    if (!st.companies.length) { $('#coBody').innerHTML = ''; $('#dbErr').textContent = 'Daftar perusahaan tidak bisa diambil (' + (r.notes || []).join('; ') + '). Isi alamat database manual.'; return; }
    renderCo(''); $('#dbQ').focus();
  } catch (err) { $('#coBody').innerHTML = ''; $('#dbErr').textContent = err.message; }
}
function normStatus(v){ const k = String(v ?? '').toLowerCase().replace(/[^a-z]/g, ''); if (!k) return ''; if (/inactive|notactive|nonactive|nonaktif|tidakaktif|disabled|suspend|deactiv/.test(k)) return 'INACTIVE'; if (k.includes('postsubscri')) return 'Post Subscribe'; if (k.includes('subscri') || k.includes('active')) return 'Active'; if (k.includes('trial')) return 'Trial'; if (k.includes('expire')) return 'Expired'; if (k.includes('await') || k.includes('payment')) return 'Awaiting Payment'; return String(v); }
const badge = s => { const cls = s === 'Active' ? 'active' : s === 'Trial' ? 'trial' : (s === 'Expired' || s === 'Post Subscribe') ? 'expired' : ''; return s ? `<span class="badge ${cls}">${esc(s)}</span>` : ''; };
const fmtExp = v => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? esc(v) : d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }); };
function renderCo(q){
  q = (q || '').trim().toLowerCase();
  const items = st.companies.map((c, i) => ({ c, i })).filter(({ c }) => !q || (c.name + ' ' + c.slug).toLowerCase().includes(q));
  $('#coCnt').textContent = `${items.length} Perusahaan` + (q ? ` (dari ${st.companies.length})` : '');
  $('#coBody').innerHTML = items.length ? items.map(({ c, i }) => `<tr class="r${i === dbSel ? ' sel' : ''}" data-i="${i}"><td><div class="nm">${esc(c.name)}</div><div class="sl mono">${esc(c.slug || c.id || '')}</div></td><td>${esc(c.version)}</td><td>${esc(String(c.edition).toUpperCase())}</td><td>${fmtExp(c.expired)}</td><td>${badge(c.status)}</td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">Tidak ada perusahaan yang cocok.</td></tr>';
  $('#coBody').querySelectorAll('tr.r').forEach(el => {
    el.onclick = () => { dbSel = +el.dataset.i; $('#coBody').querySelectorAll('tr.r').forEach(x => x.classList.toggle('sel', +x.dataset.i === dbSel)); };
    el.ondblclick = () => openCompany(st.companies[+el.dataset.i]);
  });
}
$('#dbQ').addEventListener('input', e => { dbSel = -1; renderCo(e.target.value); });
$('#dbQ').addEventListener('keydown', e => {
  const vis = [...$('#coBody').querySelectorAll('tr.r')]; if (!vis.length) return; let idx = vis.findIndex(x => +x.dataset.i === dbSel);
  if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(vis.length - 1, idx + 1); vis[idx].click(); vis[idx].scrollIntoView({ block:'nearest' }); }
  if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); vis[idx].click(); vis[idx].scrollIntoView({ block:'nearest' }); }
  if (e.key === 'Enter') { e.preventDefault(); if (idx < 0 && vis.length === 1) idx = 0; if (idx >= 0) openCompany(st.companies[+vis[idx].dataset.i]); }
});
async function openCompany(c){
  ov.show('Membuka perusahaan', c.name);
  let detail = c.raw;
  try { detail = await post('/auth/company', { server: st.server, token: st.token, client: st.client, id: c.id, endpoint: st.coEndpoint }); } catch {}
  if (detail?.access_token) st.token = detail.access_token;
  st.slug = (findSlug(detail) || c.slug || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  st.company = { id: c.id, name: detail?.company?.name || detail?.name || c.name }; st.dataBase = st.server;
  await useDatabase();
}
$('#btnManualDb').onclick = async () => {
  const v = $('#manualDb').value.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, ''); if (!v) return;
  ov.show('Membuka database', v); st.company = { id: null, name: v }; st.slug = v; st.dataBase = st.server; await useDatabase();
};
// Buka dashboard; bila server login tidak bisa dipakai untuk data, coba lewat https://<slug>
async function useDatabase(){
  $('#dbErr').textContent = '';
  let ok = await muat(true);
  if (!ok && st.slug && /\./.test(st.slug) && !/^demo\./.test(st.slug)) { st.dataBase = 'https://' + st.slug; ok = await muat(true); }
  ov.hide();
  if (!ok) { st.dataBase = st.server; $('#dbErr').textContent = 'Tidak bisa membaca data database ini: ' + ($('#status').textContent || 'cek koneksi'); showPage('pgCo'); return; }
  S.set('sess', { ...S.get('sess'), token: st.token, dataBase: st.dataBase, slug: st.slug, company: st.company });
  $('#whoami').innerHTML = `<b>${esc(st.company.name)}</b> · ${esc(st.slug || '')}`; $('#dashCo').textContent = st.company.name;
  showPage('pgDash');
}

/* ---------- dashboard ---------- */
Highcharts.setOptions({ lang: { thousandsSep: '.', decimalPoint: ',', numericSymbols: [' rb', ' jt', ' M', ' T', ' Q', ' Qi'] }, credits: { enabled: false } });
const now = new Date();
for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 8; y--) $('#tahun').add(new Option(y, y));
$('#tahun').value = now.getFullYear();
$('#tanggal').value = now.toISOString().slice(0, 10);
$('#tahun').addEventListener('change', () => { const y = $('#tahun').value; $('#tanggal').value = +y === now.getFullYear() ? now.toISOString().slice(0, 10) : `${y}-12-31`; });
$('#muat').addEventListener('click', () => muat(false));

async function muat(silent){
  const stEl = $('#status'); stEl.className = ''; stEl.textContent = 'Memuat...';
  try {
    const r = await fetch(`/api/dashboard?tahun=${$('#tahun').value}&tanggal=${$('#tanggal').value}`, { headers: headersData() });
    const d = await r.json();
    if (r.status === 401) { S.del('sess'); throw new Error(d.error || 'Sesi habis, silakan masuk lagi'); }
    if (!r.ok) throw new Error(d.error || r.statusText);
    gambar(d); stEl.textContent = 'Diperbarui ' + new Date().toLocaleTimeString('id-ID'); return true;
  } catch (e) { stEl.className = 'bad'; stEl.textContent = e.message; return false; }
}

function gambar(d){
  const judulTgl = tglPanjang(d.tanggal);
  Highcharts.chart('garis', {
    chart: { type: 'line' }, title: { text: 'Pertumbuhan Kas dan Saldo per Bulan pada Tahun ' + d.tahun, style: { fontSize: '13px' } },
    xAxis: { categories: BULAN }, yAxis: { title: { text: 'Rupiah (Rp)' } },
    tooltip: { pointFormatter(){ return `Kas dan Saldo: <b>Rp ${rp(this.y)}</b>`; } },
    series: [{ name: 'Kas dan Saldo', data: d.bulanan, color: '#7cb5ec' }],
  });
  const kat = d.kategori.slice();
  if (d.taktegori) kat.push({ nama: 'Belum terkategori', saldo: d.taktegori, warna: '#999999' });
  $('#catatan').classList.toggle('hide', !d.taktegori);
  $('#catatan').textContent = d.taktegori ? `Ada saldo Rp ${rp(d.taktegori)} yang belum cocok ke kategori mana pun. Sesuaikan pola KATEGORI di config.js.` : '';
  Highcharts.chart('pie', {
    chart: { type: 'pie' }, title: { text: 'Persentase Dana Saldo Tanggal ' + judulTgl, style: { fontSize: '14px' } },
    tooltip: { pointFormat: '<b>{point.percentage:.1f}%</b><br>Rp {point.y:,.0f}' },
    plotOptions: { pie: { dataLabels: { format: '{point.name}<br>{point.percentage:.1f}%', style: { fontWeight: 'normal', fontSize: '11px' } } } },
    series: [{ name: 'Saldo', data: kat.filter(k => k.saldo > 0).map(k => ({ name: k.nama, y: k.saldo, color: k.warna })) }],
  });
  Highcharts.chart('bar', {
    chart: { type: 'column' }, title: { text: 'Dana Tanggal ' + judulTgl, style: { fontSize: '14px' } },
    xAxis: { categories: kat.map(k => k.nama), labels: { style: { fontSize: '10px' } } }, yAxis: { title: { text: 'Saldo (Rupiah)' } }, legend: { enabled: false },
    tooltip: { pointFormat: 'Saldo: <b>Rp {point.y:,.0f}</b>' },
    plotOptions: { column: { dataLabels: { enabled: true, formatter(){ return rp(this.y); }, style: { fontSize: '10px', fontWeight: 'normal' } } } },
    series: [{ name: 'Saldo', colorByPoint: true, data: kat.map(k => ({ y: k.saldo, color: k.warna })) }],
  });
  // diagnosa
  $('#diagInfo').textContent = `${d.jumlahBaris} baris mutasi diterima dari zsql` + (d.dibuang ? `, ${d.dibuang} baris dibuang karena tanggalnya tidak terbaca` : '') + `. Saldo dihitung sampai ${judulTgl}.`;
  $('#diagBody').innerHTML = d.akun.length ? d.akun.map(a => `<tr><td class="mono">${esc(a.kode)}</td><td>${esc(a.nama)}</td><td>${esc(a.dimensi)}</td><td>${a.jenis}</td><td>${esc(a.kategori)}</td><td class="num" style="text-align:right">${rp(a.saldo)}</td></tr>`).join('')
    : '<tr><td colspan="6" class="empty">Tidak ada akun kas/bank yang terbaca.</td></tr>';
  if (!d.jumlahBaris) {
    $('#catatan').classList.remove('hide');
    $('#catatan').textContent = 'zsql tidak mengembalikan satu pun baris kas/bank. Biasanya FILTER_AKUN di config.js belum cocok dengan akun perusahaan ini; lihat daftar akun aset di bawah dan sesuaikan.';
    $('#diag').open = true; if ($('#akunTbl').classList.contains('hide')) $('#btnAkun').click();
  }
  const baris = (k, v, cls='') => `<div class="baris ${cls}"><span class="k">${esc(k)}</span><span class="v">: Rp ${rp(v)}</span></div>`;
  $('#boxSaldo').innerHTML = baris('Saldo Tunai', d.tunai) + baris('Saldo Rekening', d.rekening) + baris('Saldo Total', d.total, 'total');
  $('#boxKategori').innerHTML = kat.map(k => baris(k.nama, k.saldo)).join('');
}

$('#btnAkun').addEventListener('click', async () => {
  $('#akunErr').textContent = ''; $('#btnAkun').disabled = true;
  try {
    const r = await fetch('/api/akun', { headers: headersData() }); const rows = await r.json();
    if (!r.ok) throw new Error(rows.error || r.statusText);
    $('#akunBody').innerHTML = rows.length ? rows.map(a => `<tr><td class="mono">${esc(a.kode)}</td><td>${esc(a.nama)}</td><td>${esc(a.subklas)}</td><td class="num" style="text-align:right">${esc(a.jumlah_baris)}</td><td class="num" style="text-align:right">${rp(parseFloat(a.saldo) || 0)}</td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">Tidak ada akun berklasifikasi 1.</td></tr>';
    $('#akunTbl').classList.remove('hide');
  } catch (e) { $('#akunErr').textContent = e.message; }
  finally { $('#btnAkun').disabled = false; }
});

/* ---------- pulihkan sesi (refresh halaman) ---------- */
(function restore(){
  const s = S.get('sess'); if (!s?.token) return;
  st.server = s.server; st.token = s.token; st.me = s.me; st.client = s.client || '';
  if (s.dataBase && s.company) {
    st.dataBase = s.dataBase; st.slug = s.slug || ''; st.company = s.company;
    $('#login').classList.add('hide'); $('#app').classList.remove('hide');
    const nm = `${st.me?.first_name||''} ${st.me?.last_name||''}`.trim(); $('#sName').textContent = nm; $('#sEmail').textContent = st.me?.email || '';
    ov.show('Membuka perusahaan', s.company.name); useDatabase();
  } else enterApp();
})();
