import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP, LookupFunction } from 'node:net';
import ipaddr from 'ipaddr.js';
import { AppError } from '../../utils/errors';

export function isPublicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}

export function validatePublicUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input); } catch { throw new AppError('Invalid public source URL.', 400, 'SOURCE_URL_BLOCKED'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      isIP(host.replace(/^\[|\]$/g, '')) || !host.includes('.') ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) {
    throw new AppError('Source must use a public HTTPS website.', 400, 'SOURCE_URL_BLOCKED');
  }
  return url;
}

/** DNS is checked and pinned for each hop; no credentials, scripts or cookies are sent. */
export async function publicFetch(input: string, redirects = 0): Promise<{ text: string; url: string; contentType: string }> {
  const url = validatePublicUrl(input);
  let addresses;
  try { addresses = await lookup(url.hostname, { all: true }); }
  catch { throw new AppError('The public source could not be resolved.', 502, 'SOURCE_UNAVAILABLE'); }
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address))) {
    throw new AppError('Source resolved to a non-public address.', 400, 'SOURCE_URL_BLOCKED');
  }
  const pinnedLookup = ((_host: string, options: { all?: boolean }, done: (...args: unknown[]) => void) => {
    if (options.all) done(null, addresses);
    else done(null, addresses[0].address, addresses[0].family);
  }) as LookupFunction;
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      lookup: pinnedLookup, family: addresses[0].family,
      headers: { 'User-Agent': 'EnterpriseRadarPrototype/0.1 (public company research; local preview)', Accept: 'application/json, application/rss+xml, application/xml, text/html;q=0.9', 'Accept-Encoding': 'identity' },
    }, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume(); clearTimeout(deadline);
        if (redirects >= 3) { reject(new AppError('Too many source redirects.', 502, 'SOURCE_UNAVAILABLE')); return; }
        const next = new URL(response.headers.location, url).href;
        publicFetch(next, redirects + 1).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        response.resume(); clearTimeout(deadline);
        reject(new AppError(`Public source returned HTTP ${status}.`, 502, 'SOURCE_UNAVAILABLE')); return;
      }
      const contentType = String(response.headers['content-type'] ?? '');
      if (!/json|html|xml|text\/plain/i.test(contentType)) {
        response.resume(); clearTimeout(deadline);
        reject(new AppError('Unsupported public source format.', 502, 'SOURCE_FORMAT_UNSUPPORTED')); return;
      }
      let size = 0;
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 900000) { request.destroy(new Error('size limit')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => { clearTimeout(deadline); resolve({ text: Buffer.concat(chunks).toString('utf8'), url: url.href, contentType }); });
      response.on('error', () => { clearTimeout(deadline); reject(new AppError('Source transfer failed.', 502, 'SOURCE_UNAVAILABLE')); });
    });
    const deadline = setTimeout(() => request.destroy(new Error('deadline')), 12000);
    request.on('error', () => { clearTimeout(deadline); reject(new AppError('The public source timed out or was unavailable.', 502, 'SOURCE_UNAVAILABLE')); });
  });
}
