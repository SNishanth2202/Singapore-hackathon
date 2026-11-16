import path from 'node:path';
import { env } from '../config/env';
import { readCrmSource, writePortfolioView } from '../crm/portfolio-store';
import { buildCrmPortfolio } from '../crm/portfolio';

async function main() {
  if (!env.CRM_SOURCE_MONGODB_URI) throw new Error('Configure CRM_SOURCE_MONGODB_URI privately before refreshing customer records.');
  const source = await readCrmSource(env.CRM_SOURCE_MONGODB_URI, env.CRM_SOURCE_DB_NAME);
  const snapshot = buildCrmPortfolio(source.data, { database: source.database });
  await writePortfolioView(env.CRM_PORTFOLIO_CACHE_PATH ?? path.resolve(__dirname, '../../..', '.local/crm-portfolio.json'), snapshot);
  console.log(JSON.stringify({ accounts: snapshot.metrics.accounts, records: snapshot.source.totalRecords, reportingMonth: snapshot.reportingMonth, refreshedAt: snapshot.refreshedAt }));
}
main().catch(() => { console.error('CRM refresh failed. Check the private connection settings and Atlas network access.'); process.exitCode = 1; });
