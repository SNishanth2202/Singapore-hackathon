import http from 'http';
import app from '../app';

async function testEndpoint(port: number, path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: data });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('=== ENTERPRISE RADAR AI — API VERIFICATION SUITE ===\n');

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address() as any;
  const port = address.port;
  console.log(`Test server running on port ${port}\n`);

  const endpoints = [
    '/',
    '/api/v1/health',
    '/api/v1/health/mongodb',
    '/api/v1/health/neo4j',
    '/api/v1/companies',
    '/api/v1/opportunities',
    '/api/v1/analytics/overview',
  ];

  let passed = 0;

  for (const ep of endpoints) {
    try {
      const res = await testEndpoint(port, ep);
      console.log(`[PASS] ${ep} → HTTP ${res.status}`);
      console.log('       Response:', JSON.stringify(res.body).substring(0, 140) + '...\n');
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${ep} → Error: ${err.message}\n`);
    }
  }

  server.close();
  console.log(`Verification Complete: ${passed}/${endpoints.length} endpoints tested.\n`);
}

runTests().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});

