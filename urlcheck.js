// Normalisasi dan pemeriksaan alamat server Zahir yang diisi pemakai.
// Bisa berupa domain, IP publik, dengan/tanpa port, dengan/tanpa http:// atau https://.
//   go.zahironline.com | 13.212.173.222 | 13.212.173.222:8989 | http://13.212.173.222:8989 | https://erp.contoh.com:8443

// true bila host menunjuk jaringan lokal/privat (loopback, RFC1918, link-local/metadata, CGNAT, multicast, nama tanpa titik)
function privateHost(host) {
  host = String(host).toLowerCase();
  if (host === 'localhost' || /\.(local|localhost|internal|lan|intranet)$/.test(host)) return true;
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return !host.includes('.'); // nama tanpa titik = host internal
}

// online=true (Vercel / ZAHIR_ALLOWED_HOSTS): tolak alamat privat supaya aplikasi tidak bisa dipakai menjangkau jaringan internal hosting.
// allow = daftar domain/IP yang diizinkan (bila diisi, hanya itu yang boleh).
function normServer(s, { online = false, allow = [] } = {}) {
  s = String(s || '').trim().replace(/\/+$/, '');
  if (!s) throw new Error('Alamat server kosong');
  if (!/^https?:\/\//i.test(s)) {
    const h = s.split(/[/:]/)[0];
    s = (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) ? 'http://' : 'https://') + s; // tanpa skema: IP -> http, domain -> https
  }
  const m = s.match(/^(https?):\/\/([\w.-]+)(?::(\d{1,5}))?$/i);
  if (!m) throw new Error('Alamat server tidak valid: ' + s);
  const host = m[2].toLowerCase();
  if (m[3] && (+m[3] < 1 || +m[3] > 65535)) throw new Error('Port tidak valid: ' + m[3]);
  if (online) {
    if (allow.length) {
      if (!allow.some(d => host === d || host.endsWith('.' + d))) throw new Error('Alamat tidak diizinkan. Yang diizinkan: ' + allow.join(', '));
    } else if (privateHost(host)) {
      throw new Error('Versi online tidak bisa terhubung ke alamat lokal/privat (localhost, 10.x, 172.16-31.x, 192.168.x, dst). Pakai IP publik atau domain publik, atau jalankan aplikasi di jaringan yang sama dengan server.');
    }
  }
  return s;
}

module.exports = { normServer, privateHost };
