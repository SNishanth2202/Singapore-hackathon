import { businessKnowledgeStore, getSeedKnowledge } from '../business/store';

// One-time local upgrade for configurations saved before event-based discovery existed.
async function main() {
  const current = await businessKnowledgeStore.read();
  if (current.offerings.some(o => o.discoveryRules.length)) {
    console.log('Discovery rules already exist; saved business settings were kept.');
    return;
  }
  const defaults = new Map(getSeedKnowledge().offerings.map(o => [o.id, o]));
  const offerings = current.offerings.map(o => {
    const seed = defaults.get(o.id);
    return seed ? { ...o, discoveryRules: seed.discoveryRules,
      signalRules: { ...o.signalRules, allowedEventTypes: o.signalRules.allowedEventTypes.length ? o.signalRules.allowedEventTypes : seed.signalRules.allowedEventTypes } } : o;
  });
  const next = await businessKnowledgeStore.update(current.version, { ...current, offerings });
  console.log(`Saved business knowledge v${next.version} with event-based discovery rules. Existing seller, strategy, sources and service settings were kept.`);
}
main().catch(() => { console.error('Business knowledge upgrade failed; current configuration was kept.'); process.exitCode = 1; });
