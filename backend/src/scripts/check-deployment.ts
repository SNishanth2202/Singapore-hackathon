import { env } from '../config/env';
import { deploymentConfigurationProblems } from '../config/deployment';

const problems = deploymentConfigurationProblems(env);
if (problems.length) {
  console.error('Deployment configuration needs attention:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else console.log('Deployment configuration is complete. No secrets were printed. Run verify:cloud to test the actual database connections.');
