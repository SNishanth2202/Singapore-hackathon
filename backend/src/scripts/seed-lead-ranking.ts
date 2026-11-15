import { RankingService } from '../ranking/service';
new RankingService().reset(process.argv.includes('--empty')).then(q => console.log(`Seeded ${q.total} opportunities; ${q.fixtureVersion}; clock ${q.asOf}`)).catch(err => { console.error(err.message); process.exitCode = 1; });
