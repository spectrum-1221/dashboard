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
function showPage(id){ for (const p of ['pgCo','pgDash','pgSet']) $('#'+p).classList.toggle('hide', p !== id); $('#btnDb').classList.toggle('hide', id === 'pgCo'); window.scrollTo(0,0); }
async function post(url, body, extra={}){ const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', ...extra }, body:JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }
function headersData(){ const h = { 'x-zahir-base': st.dataBase, 'x-zahir-token': st.token, 'x-zahir-slug': st.slug }; if (st.client) h['x-zahir-client'] = st.client; if (st.company?.id) h['x-zahir-company'] = st.company.id; return h; }

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
/* ---------- filter periode (gaya Zahir: Today / This Week / This Month / Custom + pemilih bulan) ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const akhirBulan = (y, m) => new Date(y, m + 1, 0);
const PRESET = {
  hari:      () => { const n = new Date(); return [n, n]; },
  minggu:    () => { const n = new Date(), k = (n.getDay() + 6) % 7; return [new Date(n.getFullYear(), n.getMonth(), n.getDate() - k), new Date(n.getFullYear(), n.getMonth(), n.getDate() - k + 6)]; }, // Senin-Minggu
  bulan:     () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), 1), akhirBulan(n.getFullYear(), n.getMonth())]; },
  bulanlalu: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth() - 1, 1), akhirBulan(n.getFullYear(), n.getMonth() - 1)]; },
  kuartal:   () => { const n = new Date(), q = Math.floor(n.getMonth() / 3) * 3; return [new Date(n.getFullYear(), q, 1), akhirBulan(n.getFullYear(), q + 2)]; },
  tahun:     () => { const y = new Date().getFullYear(); return [new Date(y, 0, 1), new Date(y, 11, 31)]; },
  tahunlalu: () => { const y = new Date().getFullYear() - 1; return [new Date(y, 0, 1), new Date(y, 11, 31)]; },
};
const OPSI = [['hari','Hari Ini'],['minggu','Minggu Ini'],['bulan','Bulan Ini'],['bulanlalu','Bulan Lalu'],['kuartal','Kuartal Ini'],['tahun','Tahun Ini'],['tahunlalu','Tahun Lalu'],['pilihbulan','Pilih Bulan…'],['custom','Custom']];
$('#periode').innerHTML = OPSI.map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
let bulanPilih = null;      // { y, m } dari pemilih bulan
let periodeSebelum = 'hari';

function rentangAktif(){
  const k = $('#periode').value;
  if (k === 'custom') return [$('#dari').value, $('#sampai').value];
  if (k === 'pilihbulan' && bulanPilih) return [ymd(new Date(bulanPilih.y, bulanPilih.m, 1)), ymd(akhirBulan(bulanPilih.y, bulanPilih.m))];
  const [a, b] = (PRESET[k] || PRESET.hari)(); return [ymd(a), ymd(b)];
}
function tampilRentang(){
  const [a, b] = rentangAktif(); const k = $('#periode').value;
  $('#boxCustom').classList.toggle('hide', k !== 'custom');
  $('#rentang').textContent = a && b ? (a === b ? tglPanjang(a) : `${tglPanjang(a)} – ${tglPanjang(b)}`) : '';
  if (k !== 'custom') { $('#dari').value = a; $('#sampai').value = b; }   // custom dimulai dari rentang terakhir
}
$('#periode').addEventListener('change', () => {
  const k = $('#periode').value;
  if (k === 'pilihbulan') { bukaBulan(); return; }
  periodeSebelum = k; tampilRentang(); if (k !== 'custom') muat(false);
});
$('#muat').addEventListener('click', () => muat(false));

/* pemilih bulan (popup seperti Zahir) */
let mmTahun = new Date().getFullYear(), mmBulan = new Date().getMonth();
const NAMA_BLN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
function gambarBulan(){
  $('#mmTitle').textContent = `${NAMA_BLN[mmBulan]} ${mmTahun}`; $('#mmYear').textContent = mmTahun;
  $('#mmGrid').innerHTML = NAMA_BLN.map((n, i) => `<button type="button" class="${i === mmBulan ? 'on' : ''}" data-m="${i}">${n}</button>`).join('');
  $('#mmGrid').querySelectorAll('button').forEach(b => b.onclick = () => { mmBulan = +b.dataset.m; gambarBulan(); });
}
function bukaBulan(){ if (bulanPilih) { mmTahun = bulanPilih.y; mmBulan = bulanPilih.m; } gambarBulan(); $('#mm').classList.remove('hide'); }
function tutupBulan(){ $('#mm').classList.add('hide'); if ($('#periode').value === 'pilihbulan' && !bulanPilih) $('#periode').value = periodeSebelum; tampilRentang(); }
$('#btnKal').onclick = bukaBulan;
$('#mmPrev').onclick = () => { mmTahun--; gambarBulan(); };
$('#mmNext').onclick = () => { mmTahun++; gambarBulan(); };
$('#mmNow').onclick = () => { const n = new Date(); mmTahun = n.getFullYear(); mmBulan = n.getMonth(); gambarBulan(); };
$('#mmCancel').onclick = tutupBulan;
$('#mm').addEventListener('click', e => { if (e.target.id === 'mm') tutupBulan(); });
$('#mmOk').onclick = () => {
  bulanPilih = { y: mmTahun, m: mmBulan };
  $('#periode').querySelector('option[value="pilihbulan"]').textContent = `${NAMA_BLN[mmBulan]} ${mmTahun}`;
  $('#periode').value = 'pilihbulan'; periodeSebelum = 'pilihbulan'; $('#mm').classList.add('hide'); tampilRentang(); muat(false);
};
$('#periode').value = 'hari'; tampilRentang();

async function muat(silent){
  const stEl = $('#status'); stEl.className = ''; stEl.textContent = 'Memuat...';
  try {
    tampilRentang();
    const [dari, sampai] = rentangAktif();
    if (!dari || !sampai) throw new Error('Isi tanggal Dari dan Sampai');
    await defReady;
    const r = await fetch('/api/dashboard', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headersData() }, body: JSON.stringify({ dari, sampai, konfig: kfgAktif() }) });
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
  const cat = [];
  if (d.taktegori) cat.push(`Ada saldo Rp ${rp(d.taktegori)} yang belum cocok ke kategori mana pun. Atur lewat tombol "Pengaturan kategori", atau pindahkan akunnya di tabel Diagnosa.`);
  (d.peringatan || []).forEach(w => cat.push(w));
  $('#catatan').classList.toggle('hide', !cat.length);
  $('#catatan').textContent = cat.join(' ');
  DATAOPSI = d.opsi || DATAOPSI; ultimaAkun = d.akun || []; isiDatalist();
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
  const namaKat = (kfgAktif()?.kategori || []).map((k, i) => `<option value="${i}">${esc(k.nama)}</option>`).join('');
  $('#diagBody').innerHTML = d.akun.length ? d.akun.map((a, i) => `<tr><td class="mono">${esc(a.kode)}</td><td>${esc(a.nama)}</td><td>${esc(a.dimensi)}</td><td>${a.jenis}</td><td>${esc(a.kategori)}</td><td class="num" style="text-align:right">${rp(a.saldo)}</td><td><select class="atur" data-i="${i}"><option value="">Pindahkan ke…</option>${namaKat}</select></td></tr>`).join('')
    : '<tr><td colspan="7" class="empty">Tidak ada akun kas/bank yang terbaca.</td></tr>';
  if (!d.jumlahBaris) {
    $('#catatan').classList.remove('hide');
    $('#catatan').textContent = 'zsql tidak mengembalikan satu pun baris kas/bank. Biasanya FILTER_AKUN di config.js belum cocok dengan akun perusahaan ini; lihat daftar akun aset di bawah dan sesuaikan.';
    $('#diag').open = true; if ($('#akunTbl').classList.contains('hide')) $('#btnAkun').click();
  }
  const baris = (k, v, cls='') => `<div class="baris ${cls}"><span class="k">${esc(k)}</span><span class="v">: Rp ${rp(v)}</span></div>`;
  const rentang = d.dari === d.tanggal ? tglPanjang(d.tanggal) : `${tglPanjang(d.dari)} – ${tglPanjang(d.tanggal)}`;
  $('#boxSaldo').innerHTML = baris('Saldo Tunai', d.tunai) + baris('Saldo Rekening', d.rekening) + baris('Saldo Total', d.total, 'total')
    + `<div class="baris sub"><span class="k">Perubahan kas (${esc(rentang)})</span><span class="v">${d.perubahan < 0 ? '-' : '+'}Rp ${rp(Math.abs(d.perubahan))}</span></div>`;
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

/* ---------- pengaturan kategori (per perusahaan, tersimpan di browser) ---------- */
let DEF = null;
const defReady = fetch('/api/konfig-default').then(r => r.json()).then(j => { DEF = j; }).catch(() => {});
const clone = o => JSON.parse(JSON.stringify(o));
const kunciKfg = () => 'kfg.' + (st.slug || st.company?.id || st.company?.name || 'umum');
const memKfg = {};
const kfgAktif = () => L.get(kunciKfg()) || memKfg[kunciKfg()] || (DEF ? clone(DEF) : null);
const simpanKfg = k => { memKfg[kunciKfg()] = k; L.set(kunciKfg(), k); };
let K = null, DATAOPSI = { akun: [], departemen: [], proyek: [] }, ultimaAkun = [];
const PALET = ['#7cb5ec', '#434348', '#90ed7d', '#f7a35c', '#8085e9', '#f15c80', '#2b908f', '#e4d354', '#a6c96a', '#9a6fb0'];
const BY = { akun: 'Akun', kode: 'Kode akun', departemen: 'Departemen', proyek: 'Proyek' };
const OPL = { in: 'salah satu dari daftar', contains: 'mengandung kata', regex: 'cocok pola (regex)' };
const opt = (m, sel) => Object.entries(m).map(([k, t]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${t}</option>`).join('');
const pecah = v => String(v || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean);
function rapikanKfg(k) {   // bentuk nilai sesuai op: 'in' = array, lainnya = teks
  k.kategori = Array.isArray(k.kategori) ? k.kategori : []; k.tunai = Array.isArray(k.tunai) ? k.tunai : [];
  const fix = a => { a.by = BY[a.by] ? a.by : 'akun'; a.op = OPL[a.op] ? a.op : 'contains'; a.nilai = a.op === 'in' ? (Array.isArray(a.nilai) ? a.nilai.map(String) : pecah(a.nilai)) : (Array.isArray(a.nilai) ? a.nilai.join(', ') : String(a.nilai ?? '')); };
  k.kategori.forEach((c, i) => { c.nama = String(c.nama || ''); c.warna = /^#[0-9a-f]{6}$/i.test(c.warna) ? c.warna : PALET[i % PALET.length]; c.aturan = Array.isArray(c.aturan) ? c.aturan : []; c.aturan.forEach(fix); });
  k.tunai.forEach(fix); return k;
}
function isiDatalist() {
  $('#dl-akun').innerHTML = DATAOPSI.akun.map(o => `<option value="${esc(o.kode)}" label="${esc(o.nama)}">`).join('');
  $('#dl-departemen').innerHTML = (DATAOPSI.departemen || []).map(v => `<option value="${esc(v)}">`).join('');
  $('#dl-proyek').innerHTML = (DATAOPSI.proyek || []).map(v => `<option value="${esc(v)}">`).join('');
}
const labelNilai = (by, v) => { if (by === 'akun' || by === 'kode') { const o = DATAOPSI.akun.find(x => String(x.kode) === String(v)); if (o) return `${v} — ${o.nama}`; } return String(v); };
function aturanHtml(list, s) {
  return list.map((a, i) => {
    const isi = a.op === 'in'
      ? `<div class="chips">${a.nilai.map((v, j) => `<span class="chip">${esc(labelNilai(a.by, v))}<button type="button" data-act="delChip" data-s="${s}" data-i="${i}" data-j="${j}" aria-label="Hapus">×</button></span>`).join('')}<input class="a-add" list="${a.by === 'kode' ? 'dl-akun' : 'dl-' + a.by}" placeholder="ketik / pilih lalu Enter"></div>`
      : `<input class="a-val" value="${esc(a.nilai)}" placeholder="${a.op === 'regex' ? 'mis. ^kas|bank' : 'kata1, kata2'}">`;
    return `<div class="ar" data-s="${s}" data-i="${i}"><span class="or">${i ? 'ATAU' : 'Jika'}</span><select class="a-by">${opt(BY, a.by)}</select><select class="a-op">${opt(OPL, a.op)}</select>${isi}<button type="button" class="x" data-act="delAr" data-s="${s}" data-i="${i}" title="Hapus aturan">×</button></div>`;
  }).join('') + `<button type="button" class="lnk" data-act="addAr" data-s="${s}">+ aturan</button>`;
}
const listOf = s => s === 't' ? K.tunai : K.kategori[+s.slice(1)].aturan;
function renderSet() {
  $('#tunaiRules').innerHTML = aturanHtml(K.tunai, 't');
  $('#katList').innerHTML = K.kategori.map((k, i) => `<div class="kat" data-k="${i}"><div class="kat-h"><span class="no">${i + 1}</span><input class="k-nama" value="${esc(k.nama)}" placeholder="Nama kategori"><input type="color" class="k-warna" value="${esc(k.warna)}" title="Warna"><button type="button" class="lnk" data-act="up" data-k="${i}" title="Naikkan prioritas">↑</button><button type="button" class="lnk" data-act="down" data-k="${i}" title="Turunkan prioritas">↓</button><button type="button" class="lnk bahaya" data-act="delKat" data-k="${i}">Hapus</button></div>${aturanHtml(k.aturan, 'k' + i)}</div>`).join('')
    || '<div class="prev">Belum ada kategori. Klik "+ Tambah kategori".</div>';
}
const aturanDari = el => { const d = el.closest('.ar').dataset; return listOf(d.s)[+d.i]; };
$('#pgSet').addEventListener('input', e => {
  const t = e.target;
  if (t.classList.contains('a-val')) aturanDari(t).nilai = t.value;
  else if (t.classList.contains('k-nama')) K.kategori[+t.closest('.kat').dataset.k].nama = t.value;
  else if (t.classList.contains('k-warna')) K.kategori[+t.closest('.kat').dataset.k].warna = t.value;
});
$('#pgSet').addEventListener('change', e => {
  const t = e.target, d = t.closest('.ar')?.dataset;
  if (t.classList.contains('a-by')) { const a = aturanDari(t); a.by = t.value; if (a.op === 'in') a.nilai = []; renderSet(); }
  else if (t.classList.contains('a-op')) { const a = aturanDari(t); const lama = a.op; a.op = t.value; if (a.op === 'in' && lama !== 'in') a.nilai = pecah(a.nilai); if (a.op !== 'in' && lama === 'in') a.nilai = a.nilai.join(', '); renderSet(); }
  else if (t.classList.contains('a-add')) {
    const a = aturanDari(t); let v = t.value.trim(); if (!v) return;
    if (a.by === 'akun' || a.by === 'kode') { const o = DATAOPSI.akun.find(x => String(x.nama).toLowerCase() === v.toLowerCase()); if (o) v = String(o.kode); }  // boleh ketik nama akun
    if (!a.nilai.includes(v)) a.nilai.push(v);
    renderSet(); document.querySelector(`.ar[data-s="${d.s}"][data-i="${d.i}"] .a-add`)?.focus();
  }
});
$('#pgSet').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('a-add')) { e.preventDefault(); e.target.dispatchEvent(new Event('change', { bubbles: true })); } });
$('#pgSet').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return; const d = b.dataset; e.preventDefault();
  switch (d.act) {
    case 'addAr': listOf(d.s).push({ by: d.s === 't' ? 'akun' : 'departemen', op: 'in', nilai: [] }); break;
    case 'delAr': listOf(d.s).splice(+d.i, 1); break;
    case 'delChip': listOf(d.s)[+d.i].nilai.splice(+d.j, 1); break;
    case 'addKat': K.kategori.push({ nama: '', warna: PALET[K.kategori.length % PALET.length], aturan: [] }); break;
    case 'delKat': if (!confirm(`Hapus kategori "${K.kategori[+d.k].nama || +d.k + 1}"?`)) return; K.kategori.splice(+d.k, 1); break;
    case 'up': if (+d.k > 0) K.kategori.splice(+d.k - 1, 0, ...K.kategori.splice(+d.k, 1)); break;
    case 'down': if (+d.k < K.kategori.length - 1) K.kategori.splice(+d.k + 1, 0, ...K.kategori.splice(+d.k, 1)); break;
    default: return;
  }
  renderSet();
});
function cekKfg() {
  K.kategori.forEach((k, i) => { if (!k.nama.trim()) k.nama = 'Kategori ' + (i + 1); });
  if (!K.kategori.length) return 'Minimal harus ada satu kategori.';
  for (const a of [...K.tunai, ...K.kategori.flatMap(k => k.aturan)]) if (a.op === 'regex' && a.nilai) { try { new RegExp(a.nilai, 'i'); } catch { return 'Pola regex tidak valid: ' + a.nilai; } }
  return '';
}
async function bukaSet() {
  await defReady; if (!DEF) { $('#status').className = 'bad'; $('#status').textContent = 'Konfigurasi bawaan tidak bisa dimuat dari server'; return; }
  K = rapikanKfg(clone(kfgAktif())); $('#setErr').textContent = ''; renderSet(); showPage('pgSet');
}
$('#btnSet').onclick = bukaSet;
$('#setBack').onclick = $('#setCancel').onclick = e => { e.preventDefault?.(); showPage('pgDash'); };
$('#setSave').onclick = () => { const err = cekKfg(); if (err) { $('#setErr').textContent = err; return; } simpanKfg(K); showPage('pgDash'); muat(false); };
$('#setReset').onclick = () => { if (confirm('Kembalikan semua pengaturan ke bawaan?')) { K = rapikanKfg(clone(DEF)); renderSet(); } };
$('#setExport').onclick = () => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(K, null, 2)], { type: 'application/json' }));
  a.download = 'pengaturan-kategori.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#setImport').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const j = JSON.parse(await f.text()); if (!Array.isArray(j.kategori)) throw new Error('Berkas tidak berisi daftar "kategori"'); K = rapikanKfg(j); $('#setErr').textContent = ''; renderSet(); }
  catch (err) { $('#setErr').textContent = 'Impor gagal: ' + err.message; }
});

// Pindahkan satu akun ke kategori lain dari tabel Diagnosa
$('#diagBody').addEventListener('change', async e => {
  const sel = e.target.closest('select.atur'); if (!sel || sel.value === '') return;
  const a = ultimaAkun[+sel.dataset.i], k = +sel.value, c = rapikanKfg(clone(kfgAktif()));
  c.kategori.forEach(kt => kt.aturan.forEach(r => { if (r.op === 'in' && (r.by === 'akun' || r.by === 'kode')) r.nilai = r.nilai.filter(v => v !== String(a.kode)); })); // lepas dari aturan daftar lain
  let r = c.kategori[k].aturan.find(x => x.by === 'akun' && x.op === 'in');
  if (!r) { r = { by: 'akun', op: 'in', nilai: [] }; c.kategori[k].aturan.unshift(r); }
  r.nilai.push(String(a.kode));
  c.kategori.forEach(kt => { kt.aturan = kt.aturan.filter(x => !(x.op === 'in' && !x.nilai.length)); });
  simpanKfg(c);
  if (await muat(false)) {
    const baru = ultimaAkun.find(x => x.kode === a.kode && x.dimensi === a.dimensi);
    const tujuan = c.kategori[k].nama;
    if (baru && baru.kategori !== tujuan) {   // kategori lain di atasnya masih mencocokkan baris ini (urutan = prioritas)
      const blok = c.kategori.findIndex(x => x.nama === baru.kategori);
      if (blok >= 0 && blok < k && confirm(`Akun ${a.kode} masih masuk "${baru.kategori}" karena kategori itu berada di atas "${tujuan}".\n\nNaikkan "${tujuan}" ke atas "${baru.kategori}"? (urutan ini juga menjadi urutan tampil di grafik)`)) {
        const [m] = c.kategori.splice(k, 1); c.kategori.splice(blok, 0, m); simpanKfg(c); await muat(false);
      } else { $('#status').className = 'bad'; $('#status').textContent = `Akun ${a.kode} masih masuk "${baru.kategori}" karena aturan di kategori yang lebih atas. Atur urutan/aturannya di Pengaturan kategori.`; }
    }
  }
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
