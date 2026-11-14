const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isPublicAddress, validatePublicUrl } = require('../dist/integrations/research/publicFetch');
const { parseNews, extractOfficialPage, normalizedName, selectUnambiguousCompany } = require('../dist/integrations/research/service');
const { validResearchId } = require('../dist/integrations/research/store');
const { groundPublicAnalysis } = require('../dist/integrations/research/grounding');

test('public-source retrieval blocks local, private, link-local and mapped addresses', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1', '224.0.0.1']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('8.8.8.8'), true);
});

test('source URLs reject credentials, local hosts, non-HTTPS, IPs and unusual ports', () => {
  for (const url of ['http://example.com', 'https://127.0.0.1/', 'https://[::1]/', 'https://user:secret@example.com/', 'https://example.com:8080/', 'https://metadata.internal/', 'file:///etc/passwd', 'https://localhost/']) {
    assert.throws(() => validatePublicUrl(url), { code: 'SOURCE_URL_BLOCKED' }, url);
  }
  assert.equal(validatePublicUrl('https://example.com/news').hostname, 'example.com');
});

const company = { name: 'Infosys', aliases: ['Infosys Limited'] };
const pubDate = new Date(Date.now() - 86400000).toUTCString();
const item = (title, url, date = pubDate) => `<item><title>${title}</title><link>${url}</link><pubDate>${date}</pubDate><source url="https://publisher.example">Example Publisher</source></item>`;
test('news collection deduplicates, attributes headlines and excludes unrelated companies', () => {
  const xml = '<rss><channel>' + item('Infosys opens a new center', 'https://news.google.com/rss/articles/a') + item('Infosys opens a new center', 'https://news.google.com/rss/articles/b') + item('OtherCorp opens a center', 'https://news.google.com/rss/articles/c') + '</channel></rss>';
  const result = parseNews(xml, company);
  assert.equal(result.length, 1);
  assert.equal(result[0].verification, 'headline_only');
  assert.match(result[0].excerpt, /not retrieved or verified/);
  assert.equal(result[0].publisher, 'Example Publisher');
  assert.equal(result[0].publishedAt, new Date(pubDate).toISOString());
  assert.ok(result[0].contentHash);
});

test('stale, invalid-date and future headlines never become fresh signals', () => {
  const xml = '<rss><channel>' + item('Infosys old news', 'https://news.google.com/rss/articles/a', 'Mon, 01 Jan 2001 00:00:00 GMT') + item('Infosys invalid date', 'https://news.google.com/rss/articles/b', 'unknown') + item('Infosys future news', 'https://news.google.com/rss/articles/c', new Date(Date.now() + 10*86400000).toUTCString()) + '</channel></rss>';
  assert.deepEqual(parseNews(xml, company), []);
});

test('official-page extraction omits scripts, preserves unknown publication date and stays on-domain', () => {
  const text = 'This company describes its operations and plans in a public paragraph that is long enough for extraction.';
  const result = extractOfficialPage(`<html><head><title>Company</title></head><body><script>secretScript()</script><nav>Ignore navigation</nav><main><p>${text}</p><a href="/newsroom">News</a><a href="https://evil.example/press-release">Other site</a></main></body></html>`, 'https://example.com/');
  assert.equal(result.excerpt, text);
  assert.equal(result.publishedAt, null);
  assert.deepEqual(result.links, ['https://example.com/newsroom']);
});

test('research IDs cannot become filesystem paths', () => {
  assert.equal(validResearchId('../../.env'), false);
  assert.equal(validResearchId('research-../../../../.env'), false);
  assert.equal(validResearchId('research-12345678-abcd-abcd-abcd-123456789012'), true);
});

test('company matching normalizes legal suffixes without substring matching', () => {
  assert.equal(normalizedName('Infosys Limited'), normalizedName('Infosys'));
  assert.notEqual(normalizedName('Apple'), normalizedName('Pineapple Holdings'));
});

test('ambiguous exact-name directory hits require user confirmation', () => {
  const candidates = [{ entityId: 'Q123', name: 'Mercury', description: 'automobile marque of Ford Motor Company', aliases: [] }];
  assert.equal(selectUnambiguousCompany('Mercury', candidates, ['Mercury', 'Mercury', 'Mercury Records']), null);
  assert.equal(selectUnambiguousCompany('Infosys', [{ entityId: 'Q26989', name: 'Infosys limited', description: 'Indian multinational technology company', aliases: ['Infosys'] }], ['Infosys limited', 'Infosys Consulting']), 'Q26989');
});

test('historical legal background cannot justify a cybersecurity recommendation', () => {
  const record = { company: { name: 'Example', description: 'technology company' }, sources: [{ id: 'profile-1', kind: 'company_profile', excerpt: 'Historical legal allegations', publishedAt: null }] };
  const analysis = { summary: 'Historical visa controversies', observedFacts: [], possibleNeeds: [{ offeringId: 'cybersecurity', need: 'Cybersecurity', reason: 'Tax fraud risk', evidenceIds: ['profile-1'] }], recommendedCapability: { offeringId: 'cybersecurity', name: 'cybersecurity', reason: 'Legal risk', evidenceIds: ['profile-1'] }, nextAction: { role: 'CIO', question: 'Address controversies?', whyNow: 'Historical visa case' }, unknowns: [], readiness: 'NEEDS_RESEARCH' };
  const result = groundPublicAnalysis(analysis, record);
  assert.equal(result.analysis.recommendedCapability, null);
  assert.equal(result.analysis.readiness, 'HOLD');
  assert.deepEqual(result.analysis.possibleNeeds, []);
  assert.doesNotMatch(result.analysis.nextAction.question, /controvers/);
});

test('a cited current expansion supports a conditional connectivity hypothesis', () => {
  const record = { company: { name: 'Example', description: 'logistics company' }, sources: [{ id: 'news-1', kind: 'news_headline', title: 'Example expands warehouse operations in Singapore', excerpt: 'Headline only', publishedAt: new Date().toISOString() }] };
  const analysis = { summary: 'A headline reports an expansion.', observedFacts: [], possibleNeeds: [{ offeringId: 'international-connectivity', need: 'Possible connectivity need', reason: 'New site access should be validated', evidenceIds: ['news-1'] }], recommendedCapability: { offeringId: 'international-connectivity', name: 'International connectivity', reason: 'Expansion might require links', evidenceIds: ['news-1'] }, nextAction: { role: 'IT lead', question: 'Can you confirm the expansion?', whyNow: 'Recent report' }, unknowns: [], readiness: 'NEEDS_RESEARCH' };
  assert.equal(groundPublicAnalysis(analysis, record).analysis.recommendedCapability.name, 'International connectivity');
});
