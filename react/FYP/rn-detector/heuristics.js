import { getHost } from './whitelist';

export const MAX_SAFE_LEN = 500;
export const MAX_SUBDOMAINS = 4;
export const MIN_SUSPICIOUS_KEYWORDS = 3;

export const SUSPICIOUS_KEYWORDS = [
  'login', 'signin', 'verify', 'account', 'secure', 'update', 'confirm',
  'password', 'bank', 'webscr', 'ebayisapi', 'paypal', 'wallet', 'billing',
  'menang', 'hadiah', 'ganjaran', 'percuma', 'pengesahan', 'kemaskini',
  'baucar', 'tuntut', 'akaun',
];


export const RISKY_HOSTS = [
  'backblazeb2.com', 'amazonaws.com', 'blob.core.windows.net', 'r2.dev',
  'storage.googleapis.com', 'web.app', 'firebaseapp.com', 'appspot.com', 'pages.dev',
  'netlify.app', 'workers.dev', 'glitch.me', 'repl.co', '000webhostapp.com',
];


export const MY_BRANDS = [
  { token: 'maybank',     legit: ['maybank.com', 'maybank2u.com', 'maybank2u.com.my'] },
  { token: 'cimb',        legit: ['cimb.com', 'cimb.com.my', 'cimbclicks.com.my'] },
  { token: 'publicbank',  legit: ['pbebank.com'] },
  { token: 'rhb',         legit: ['rhbgroup.com', 'rhb.com.my'] },
  { token: 'ambank',      legit: ['ambank.com.my', 'ambankgroup.com'] },
  { token: 'hongleong',   legit: ['hlb.com.my', 'hongleong.com.my'] },
  { token: 'touchngo',    legit: ['touchngo.com.my', 'tngdigital.com.my'] },
  { token: 'tng',         legit: ['tngdigital.com.my', 'touchngo.com.my'] },
  { token: 'duitnow',     legit: ['duitnow.my', 'paynet.my'] },
  { token: 'lhdn',        legit: ['hasil.gov.my'] },
  { token: 'myeg',        legit: ['myeg.com.my'] },
  { token: 'jpj',         legit: ['jpj.gov.my'] },
  { token: 'posmalaysia', legit: ['pos.com.my'] },
  { token: 'shopee',      legit: ['shopee.com.my', 'shopee.com'] },
  { token: 'lazada',      legit: ['lazada.com.my', 'lazada.com'] },
];

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function runHeuristics(url) {
  const reasons = [];
  const raw = String(url);
  const host = getHost(url);

  // --- strong signals -> DANGEROUS (block) ---
  if (IPV4.test(host)) reasons.push('IP-address host'); //block IPV4
  if (raw.length > MAX_SAFE_LEN) reasons.push(`URL longer than ${MAX_SAFE_LEN} chars`); //if more than 500 char

  // subdomain count = host labels minus the registered domain (last 2 labels)
  const labels = host ? host.split('.') : [];
  const subdomains = Math.max(0, labels.length - 2);
  if (subdomains > MAX_SUBDOMAINS) reasons.push(`more than ${MAX_SUBDOMAINS} subdomains`); //subdomain more than four will block

  if (raw.includes('@')) reasons.push("'@' in URL");

  const lower = raw.toLowerCase();
  const hits = SUSPICIOUS_KEYWORDS.filter((k) => lower.includes(k));
  if (hits.length >= MIN_SUSPICIOUS_KEYWORDS) {
    reasons.push(`${hits.length} suspicious keywords (${hits.join(', ')})`);
  }

  if (reasons.length) return { level: 'dangerous', hit: true, reasons };

  // --- softer signal -> SUSPICIOUS: impersonates a Malaysian brand off its real domain ---
  const lowerHost = host.toLowerCase();
  const brand = MY_BRANDS.find(({ token, legit }) =>
    lowerHost.includes(token) &&
    !legit.some((d) => lowerHost === d || lowerHost.endsWith('.' + d)),
  );
  if (brand) {
    return { level: 'suspicious', hit: false, reasons: [`mimics "${brand.token}" but is not its official domain`] };
  }

  // --- softer signal -> SUSPICIOUS: served from abused shared/object storage ---
  const risky = RISKY_HOSTS.find((d) => host === d || host.endsWith('.' + d));
  if (risky) {
    return { level: 'suspicious', hit: false, reasons: [`served from shared cloud storage (${risky})`] };
  }

  return { level: 'none', hit: false, reasons: [] };
}
