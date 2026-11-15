import { setServers } from 'dns';
import { isIP } from 'net';

/** Optional process-only resolver configuration for networks where Node's
 * inherited resolver is unavailable. Never changes the operating system DNS. */
export function configureDns(value?: string, apply = setServers): void {
  if (!value?.trim()) return;
  const servers = value.split(',').map(server => server.trim());
  if (servers.some(server => !isIP(server))) throw new Error('DNS_SERVERS must contain comma-separated DNS server IP addresses.');
  apply(servers);
}
