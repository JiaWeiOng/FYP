
import topDomains from '../assets/whitelist.json';


const EXCLUDE_FROM_WHITELIST = new Set([
  'appspot.com', 'web.app', 'firebaseapp.com', 'firebasestorage.googleapis.com',
  'storage.googleapis.com', 'googleusercontent.com', 'translate.goog', 'blogspot.com',
  'amazonaws.com', 'cloudfront.net', 'backblazeb2.com', 'r2.dev', 'azurewebsites.net',
  'blob.core.windows.net', 'windows.net', 'github.io', 'githubusercontent.com',
  'netlify.app', 'pages.dev', 'workers.dev', 'vercel.app', 'herokuapp.com', 'glitch.me',
  'repl.co', 'replit.dev', '000webhostapp.com', 'weebly.com', 'wixsite.com', 'wordpress.com',
  'myshopify.com', 'sharepoint.com',
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'cutt.ly', 'rebrand.ly', 'shorturl.at',
]);

export const WHITELIST = new Set([
  'google.com', 'youtube.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com',
  'wikipedia.org', 'amazon.com', 'microsoft.com', 'apple.com', 'github.com', 'linkedin.com',
  'gmail.com', 'whatsapp.com', 'netflix.com', 'yahoo.com', 'bing.com', 'reddit.com',
  'shopee.com.my', 'lazada.com.my', 'tarc.edu.my', 'taruc.edu.my',
  'maybank2u.com.my', 'cimbclicks.com.my', 'publicbank.com.my', 'rhbgroup.com', 'hlb.com.my',
  ...topDomains.filter((d) => !EXCLUDE_FROM_WHITELIST.has(d)),
]);


export function getHost(url) {
  let u = String(url).trim();
  if (!u.includes('://')) u = 'http://' + u;
  u = u.replace(/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//, ''); // strip scheme
  const authority = u.split(/[/?#]/)[0]; // host[:port] up to first / ? #
  const afterUser = authority.includes('@')
    ? authority.slice(authority.lastIndexOf('@') + 1)
    : authority;
  let host = afterUser.split(':')[0].toLowerCase(); // drop :port
  if (host.startsWith('www.')) host = host.slice(4);
  return host;
}

// exact domain OR a real subdomain of it (login.maybank2u.com.my) — NOT a substring trick.
export function isWhitelisted(url) {
  const h = getHost(url);
  if (!h) return false;
  for (const d of WHITELIST) {
    if (h === d || h.endsWith('.' + d)) return true;
  }
  return false;
}
