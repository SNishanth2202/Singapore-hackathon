/** References are scoped to one snapshot. Never guess or fuzzy-match a citation. */
export function createEvidenceReferences(sourceIds: string[], events: Array<{ id: string; sourceIds: string[] }> = []) {
  const allowed = new Set(sourceIds);
  const aliases = new Map<string, string>();
  const resolved = new Map<string, string[]>([...allowed].map(id => [id, [id]]));
  let number = 1;
  for (const id of allowed) {
    // Preserve canonical IDs even if an imported source already uses an E-number.
    while (allowed.has(`E${number}`)) number++;
    const alias = `E${number++}`;
    aliases.set(id, alias);
    resolved.set(alias, [id]);
  }
  for (const event of events) {
    if (!resolved.has(event.id) && event.sourceIds.length && event.sourceIds.every(id => allowed.has(id))) {
      resolved.set(event.id, [...new Set(event.sourceIds)]);
    }
  }
  return {
    allowed,
    resolve(ids: string[]): string[] | null {
      if (ids.some(id => !resolved.has(id))) return null;
      return [...new Set(ids.flatMap(id => resolved.get(id)!))];
    },
    // Only exact source-ID string values change; IDs from the seller catalogue remain separate.
    forPrompt(value: unknown): string {
      return JSON.stringify(value, (_key, item) => typeof item === 'string' ? aliases.get(item) ?? item : item);
    },
  };
}

export type EvidenceReferences = ReturnType<typeof createEvidenceReferences>;
