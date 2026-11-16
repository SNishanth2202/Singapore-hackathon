import { createHash, randomUUID } from 'node:crypto';
import { load } from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { publicFetch, validatePublicUrl } from './publicFetch';
import { CompanyIdentity, ResearchRecord, ResearchSource, saveResearch } from './store';
import { AppError } from '../../utils/errors';
import { buildResearchOverview, classifySource } from './events';
import { recordDiscoverySnapshot } from '../../sales/workflow';

const entityId = z.string().regex(/^Q[1-9][0-9]{0,12}$/);
const textOnly = (value: string) => load(`<body>${value}</body>`).text().replace(/\s+/g, ' ').trim();
const apiUrl = (host: string, params: Record<string, string>) => `https://${host}/w/api.php?${new URLSearchParams({ format: 'json', ...params })}`;
async function jsonAt(url: string): Promise<any> {
  try { return JSON.parse((await publicFetch(url)).text); }
  catch (e) { if (e instanceof AppError) throw e; throw new AppError('Source returned unreadable data.', 502, 'SOURCE_INVALID_DATA'); }
}
function valueOf(entity: any, property: string) { return entity.claims?.[property]?.[0]?.mainsnak?.datavalue?.value; }
function identity(entity: any): CompanyIdentity | null {
  const instances = (entity.claims?.P31 ?? []).map((c: any) => c.mainsnak?.datavalue?.value?.id);
  if (instances.includes('Q5') || instances.includes('Q4167410') || /planet|chemical element|given name|commune in|municipality|fictional character/i.test(entity.descriptions?.en?.value ?? '')) return null;
  let website: string | null = null;
  const raw = valueOf(entity, 'P856');
  if (typeof raw === 'string') {
    try { website = validatePublicUrl(raw.replace(/^http:/, 'https:')).href; } catch { /* unresolved site remains unknown */ }
  }
  return { entityId: entity.id, name: entity.labels?.en?.value ?? entity.id,
    description: entity.descriptions?.en?.value ?? '', website,
    wikipediaTitle: entity.sitelinks?.enwiki?.title ?? null,
    aliases: (entity.aliases?.en ?? []).slice(0, 8).map((a: any) => a.value),
    identitySource: `https://www.wikidata.org/wiki/${entity.id}` };
}

export function normalizedName(value: string) {
  return value.toLowerCase().replace(/\b(incorporated|inc|limited|ltd|corporation|corp|plc)\b\.?/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
export function selectUnambiguousCompany(name: string, candidates: CompanyIdentity[], rawLabels: string[]): string | null {
  // Be conservative when a directory's exact-name results point to several entities.
  const rawExactCount = rawLabels.filter((label) => normalizedName(label) === normalizedName(name)).length;
  const exact = candidates.filter((c) => [c.name, ...c.aliases].some((n) => normalizedName(n) === normalizedName(name)) && /company|corporation|firm|business|enterprise|conglomerate|bank|airline|manufacturer|retailer|operator/i.test(c.description));
  return exact.length === 1 && rawExactCount <= 1 ? exact[0].entityId : null;
}
export async function searchCompanies(name: string) {
  const result = await jsonAt(apiUrl('www.wikidata.org', { action: 'wbsearchentities', search: name, language: 'en', limit: '6', type: 'item' }));
  const ids = (result.search ?? []).map((r: any) => entityId.safeParse(r.id).success ? r.id : null).filter(Boolean);
  if (!ids.length) return { candidates: [], autoSelectId: null, note: 'No public identity match found. Try the registered name or add its country to the search.' };
  const entities = await jsonAt(apiUrl('www.wikidata.org', { action: 'wbgetentities', ids: ids.join('|'), props: 'labels|descriptions|aliases|claims|sitelinks', languages: 'en', sitefilter: 'enwiki' }));
  const candidates: CompanyIdentity[] = ids.map((id: string) => identity(entities.entities?.[id] ?? {})).filter((c: CompanyIdentity | null) => c && c.name !== c.entityId && !/award|prize|championship|theater|theatre|album|song|film|fictional character/i.test(c.description));
  return { candidates, autoSelectId: selectUnambiguousCompany(name, candidates, (result.search ?? []).map((r: any) => String(r.label ?? ''))),
    note: 'Identity matches come from Wikidata. Confirm the description and listed website; similar names can refer to different organizations.' };
}

function source(kind: ResearchSource['kind'], title: string, url: string, excerpt: string, publisher: string, publishedAt: string | null): ResearchSource {
  const clean = textOnly(excerpt).slice(0, kind === 'news_headline' ? 400 : 1100);
  return { id: `src_${createHash('sha256').update(`${kind}|${url}|${title}`).digest('hex').slice(0, 14)}`,
    kind, title: textOnly(title).slice(0, 250), url, excerpt: clean, publisher: publisher.slice(0, 160), publishedAt,
    retrievedAt: new Date().toISOString(), contentHash: createHash('sha256').update(clean).digest('hex'),
    verification: kind === 'news_headline' ? 'headline_only' : kind === 'official_page' ? 'retrieved_official_page' : 'retrieved_profile' };
}

export function parseNews(xml: string, company: CompanyIdentity): ResearchSource[] {
  const parser = new XMLParser({ ignoreAttributes: false, processEntities: false, isArray: (_name, jpath) => jpath === 'rss.channel.item' });
  const data = parser.parse(xml);
  const items = data?.rss?.channel?.item ?? [];
  if (!Array.isArray(items)) return [];
  // Legal suffixes help distinguish a company from a person's name or a place.
  // Do not reduce "Pall Corporation" to "Pall" for headline matching.
  const compare = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const fullName = compare(company.name);
  const aliases = [company.name, ...company.aliases].map(compare).filter((name) => {
    if (name.length < 3) return false;
    // Short aliases are too ambiguous when the known identity has a longer name.
    // Single-name brands such as DHL retain their canonical identity.
    return name === fullName || !fullName.includes(' ') || name.includes(' ') || name.length >= 5;
  });
  const seen = new Set<string>();
  const sources: ResearchSource[] = [];
  const relevance = (item: any) => {
    const title = String(item.title ?? '');
    const assessment = classifySource({ id: '', kind: 'news_headline', title, publisher: typeof item.source === 'string' ? item.source : String(item.source?.['#text'] ?? ''), publishedAt: String(item.pubDate ?? ''), excerpt: '', url: '', retrievedAt: '', contentHash: '', verification: 'headline_only' }, company);
    const positive = (title.match(/expan|partner|contract|invest|acquir|acquisit|warehouse|facility|office|hiring|cloud|security|centre|center|plant|launch|growth|capacity/gi) ?? []).length + (assessment.relevance === 'COMPANY_EVENT' ? 20 : assessment.relevance === 'COMMENTARY' ? -20 : 0);
    const negative = (title.match(/prize|award|stock price|share price|dividend|green card/gi) ?? []).length;
    return positive - negative * 3;
  };
  for (const item of [...items].sort((a, b) => relevance(b) - relevance(a))) {
    if (sources.length >= 12) break;
    const title = textOnly(String(item.title ?? ''));
    const normalized = normalizedName(title);
    if (!aliases.some((a) => ` ${compare(title)} `.includes(` ${a} `))) continue;
    const url = String(item.link ?? '');
    try { if (new URL(url).hostname !== 'news.google.com' || new URL(url).protocol !== 'https:') continue; } catch { continue; }
    if (seen.has(normalized)) continue;
    const d = new Date(String(item.pubDate ?? ''));
    // Reject future and stale discovery items; retrieval date never substitutes for publication date.
    if (!Number.isFinite(d.valueOf()) || d.valueOf() > Date.now() + 86400000 || Date.now() - d.valueOf() > 120 * 86400000) continue;
    seen.add(normalized);
    const publisher = typeof item.source === 'string' ? item.source : String(item.source?.['#text'] ?? 'Publisher indexed by Google News');
    sources.push(source('news_headline', title, url, `Publisher-reported headline only: ${title}. Full article not retrieved or verified.`, publisher, d.toISOString()));
  }
  return sources;
}

export function extractOfficialPage(html: string, url: string) {
  const $ = load(html);
  $('script,style,noscript,nav,footer,header,form,aside,svg').remove();
  const root = $('main,article').first();
  const scope = root.length ? root : $('body');
  const paragraphs = scope.find('p').map((_i, e) => $(e).text().replace(/\s+/g, ' ').trim()).get().filter((s) => s.length > 65);
  const excerpt = paragraphs.slice(0, 8).join(' ').slice(0, 1100);
  const title = $('title').text().trim() || 'Company website';
  const rawDate = $('meta[property="article:published_time"]').attr('content');
  const date = rawDate ? new Date(rawDate) : null;
  const publishedAt = date && Number.isFinite(date.valueOf()) && date.valueOf() <= Date.now() + 86400000 ? date.toISOString() : null;
  const links = $('a[href]').map((_i, e) => {
    const href = $(e).attr('href') ?? '';
    if (!/press.release|newsroom|news-release|media.release/i.test(href)) return '';
    try { const next = new URL(href, url); return next.protocol === 'https:' && next.hostname === new URL(url).hostname && !next.hash ? next.href : ''; } catch { return ''; }
  }).get().filter(Boolean);
  return { title, excerpt, publishedAt, links: [...new Set(links)].slice(0, 1) };
}

export async function researchCompany(id: string, discoverySources: ResearchSource[] = []): Promise<ResearchRecord> {
  entityId.parse(id);
  const result = await jsonAt(apiUrl('www.wikidata.org', { action: 'wbgetentities', ids: id, props: 'labels|descriptions|aliases|claims|sitelinks', languages: 'en', sitefilter: 'enwiki' }));
  const company = identity(result.entities?.[id] ?? {});
  if (!company?.name || company.name === id) throw new AppError('No organization identity was found.', 404, 'COMPANY_NOT_FOUND');
  return researchIdentity(company, discoverySources);
}

export async function researchIdentity(company: CompanyIdentity, discoverySources: ResearchSource[] = [], strictNames = false): Promise<ResearchRecord> {
  const sources: ResearchSource[] = [...discoverySources];
  const warnings: string[] = ['Identity and website are directory listings, not an independently verified corporate registration. Existing-customer status is unknown.'];
  const reportedName=company.entityId.startsWith('public-name-');
  if(reportedName)warnings[0]='The company name is reported in public headlines; registered legal identity and existing-customer status are unverified.';
  // A reported name is not a retrieved registry profile. Keep its original
  // headline without relabelling it or counting it as a second source.
  if (!reportedName) sources.push(source('company_profile', `${company.name} - identity listing`, company.identitySource,
    `${company.entityId.startsWith('LEI-') ? 'GLEIF lists' : 'Wikidata lists'} ${company.name}: ${company.description}. Listed website: ${company.website ?? 'unknown'}.`, company.entityId.startsWith('LEI-') ? 'GLEIF (legal-entity registry)' : 'Wikidata (community-maintained)', null));

  await Promise.all([
    (async () => {
      if (!company.wikipediaTitle) return;
      try {
        const wiki = await jsonAt(apiUrl('en.wikipedia.org', { action: 'query', prop: 'extracts|info', exintro: '1', explaintext: '1', inprop: 'url', titles: company.wikipediaTitle, exchars: '1100', redirects: '1' }));
        const page: any = Object.values(wiki.query?.pages ?? {})[0];
        if (page?.extract && page?.fullurl?.startsWith('https://en.wikipedia.org/')) sources.push(source('company_profile', page.title, page.fullurl, page.extract, 'Wikipedia (background; verify important facts)', null));
      } catch { warnings.push('Background profile could not be retrieved.'); }
    })(),
    (async () => {
      try {
        const query = `"${company.name.replace(/["\\]/g, ' ')}" when:90d`;
        const feed = await publicFetch(`https://news.google.com/rss/search?${new URLSearchParams({ q: query, hl: 'en-IN', gl: 'IN', ceid: 'IN:en' })}`);
        const news = parseNews(feed.text, company); sources.push(...news);
        if (!news.length) warnings.push('No recent name-matching news headlines were found. This does not prove that the company has no needs.');
        else warnings.push('News items are publisher-reported headlines from Google News. Article bodies and company-specific relevance have not been independently verified.');
      } catch { warnings.push('News discovery is unavailable. No headlines were invented or substituted.'); }
    })(),
    (async () => {
      if (!company.website) { warnings.push('No listed company website was available.'); return; }
      try {
        const page = await publicFetch(company.website);
        const extracted = extractOfficialPage(page.text, page.url);
        if (extracted.excerpt) sources.push(source('official_page', extracted.title, page.url, extracted.excerpt, new URL(page.url).hostname, extracted.publishedAt));
        else warnings.push('The company website did not expose readable public paragraphs.');
        for (const link of extracted.links) {
          try {
            const news = await publicFetch(link); const parsed = extractOfficialPage(news.text, news.url);
            if (parsed.excerpt) sources.push(source('official_page', parsed.title, news.url, parsed.excerpt, new URL(news.url).hostname, parsed.publishedAt));
          } catch { warnings.push('A company news page was unavailable; it was not bypassed.'); }
        }
      } catch { warnings.push('The listed company website blocked retrieval or was unavailable. Official-page content was not substituted with AI guesses.'); }
    })(),
  ]);
  const record: ResearchRecord = { id: `research-${randomUUID()}`, company,
    sources: [...new Map(sources.map((s) => [strictNames ? `${s.kind}|${s.url}` : s.id, s])).values()], warnings, createdAt: new Date().toISOString() };
  record.quality = buildResearchOverview(record);
  await saveResearch(record);
  await recordDiscoverySnapshot({ companyId: `entity:${company.entityId}`, companyName: company.name, researchId: record.id,
    sourceIds: record.sources.map(s => s.id), evidence: record.sources.map(s => ({ sourceId: s.id, title: s.title, url: s.url, publishedAt: s.publishedAt })) });
  return record;
}
