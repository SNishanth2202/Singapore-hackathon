export function allowedOrigins(value: string, production: boolean): string[] {
  const configured = value.split(',').map(v => v.trim()).filter(Boolean);
  return [...new Set([...configured, ...(production ? [] : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'])])];
}

export function validProductionOrigins(value: string): boolean {
  const origins = allowedOrigins(value, true);
  return origins.length > 0 && origins.every(origin => {
    try { const url = new URL(origin); return url.protocol === 'https:' && url.origin === origin && !url.username && !url.password; }
    catch { return false; }
  });
}
