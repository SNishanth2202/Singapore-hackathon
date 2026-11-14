import path from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { AppError } from '../../utils/errors';

export interface CompanyIdentity {
  entityId: string; name: string; description: string; website: string | null;
  wikipediaTitle: string | null; aliases: string[]; identitySource: string;
}
export interface ResearchSource {
  id: string; kind: 'company_profile' | 'official_page' | 'news_headline';
  title: string; url: string; publisher: string; excerpt: string;
  publishedAt: string | null; retrievedAt: string; contentHash: string;
  verification: 'retrieved_profile' | 'retrieved_official_page' | 'headline_only';
}
export interface ResearchRecord {
  id: string; company: CompanyIdentity; sources: ResearchSource[]; warnings: string[]; createdAt: string;
  quality?: import('./events').ResearchOverview;
}
const directory = path.resolve(__dirname, '..', '..', '..', 'data', 'research');
export function validResearchId(id: string): boolean { return /^research-[0-9a-f-]{36}$/.test(id); }
export async function saveResearch(record: ResearchRecord) {
  if (!validResearchId(record.id)) throw new Error('Invalid generated research ID');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${record.id}.json`), JSON.stringify(record, null, 2), { flag: 'wx' });
}
export async function loadResearch(id: string): Promise<ResearchRecord> {
  if (!validResearchId(id)) throw new AppError('Research not found.', 404, 'NOT_FOUND');
  try {
    const record = JSON.parse(await readFile(path.join(directory, `${id}.json`), 'utf8')) as ResearchRecord;
    if (record.id !== id || !Array.isArray(record.sources)) throw new Error('Invalid record');
    return record;
  } catch { throw new AppError('Research not found. Search for the company again.', 404, 'NOT_FOUND'); }
}
