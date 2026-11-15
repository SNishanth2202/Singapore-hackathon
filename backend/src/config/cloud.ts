/** Validate endpoints without returning credentials or connection strings in errors. */
export function cloudConfigurationProblems(config: {
  MONGODB_URI: string; NEO4J_URI: string; NEO4J_USERNAME: string; NEO4J_PASSWORD: string;
}): string[] {
  const problems: string[] = [];
  try {
    const uri = new URL(config.MONGODB_URI);
    if (uri.protocol !== 'mongodb+srv:' || !uri.hostname.endsWith('.mongodb.net') || /[<>]/.test(config.MONGODB_URI)) throw new Error();
  } catch { problems.push('MONGODB_URI must be the mongodb+srv connection string supplied by MongoDB Atlas, with its placeholders replaced.'); }
  try {
    const uri = new URL(config.NEO4J_URI);
    if (uri.protocol !== 'neo4j+s:' || !uri.hostname.endsWith('.neo4j.io') || uri.username || uri.password || /[<>]/.test(config.NEO4J_URI)) throw new Error();
  } catch { problems.push('NEO4J_URI must be the encrypted neo4j+s connection URI supplied by Neo4j Aura.'); }
  if (!config.NEO4J_USERNAME.trim()) problems.push('NEO4J_USERNAME is required.');
  if (!config.NEO4J_PASSWORD || /[<>]|^enterprise_radar_pass$|^your[_-].*password$/i.test(config.NEO4J_PASSWORD)) problems.push('NEO4J_PASSWORD must be the password for your Aura database.');
  return problems;
}
