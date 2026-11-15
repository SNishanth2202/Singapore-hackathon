import { cloudConfigurationProblems } from './cloud';
import { publicAiConfigurationProblems, resolveAiConfiguration, resolveAiFallbackConfiguration } from './ai';
import { validProductionOrigins } from './http';

type DeploymentEnvironment = Parameters<typeof resolveAiConfiguration>[0] & Parameters<typeof cloudConfigurationProblems>[0] & {
  STORAGE_MODE: string; LOCAL_DEMO_MODE: boolean; HOSTED_PREVIEW?: boolean; CORS_ORIGIN: string; HOST: string;
};
export function deploymentConfigurationProblems(config: DeploymentEnvironment): string[] {
  const preview = config.STORAGE_MODE === 'memory' && config.LOCAL_DEMO_MODE && config.HOSTED_PREVIEW;
  const fallback = resolveAiFallbackConfiguration(config);
  return [
    ...(!preview && (config.STORAGE_MODE !== 'cloud' || config.LOCAL_DEMO_MODE) ? ['Choose explicit hosted preview mode, or STORAGE_MODE=cloud with LOCAL_DEMO_MODE=false.'] : []),
    ...(config.HOST !== '0.0.0.0' ? ['Set HOST=0.0.0.0 so Render can reach the backend.'] : []),
    ...(!validProductionOrigins(config.CORS_ORIGIN) ? ['Set CORS_ORIGIN to the exact HTTPS Vercel URL, without a trailing slash.'] : []),
    ...(config.STORAGE_MODE === 'cloud' ? cloudConfigurationProblems(config) : []), ...publicAiConfigurationProblems(resolveAiConfiguration(config)),
    ...(fallback ? publicAiConfigurationProblems(fallback, true).map(problem => `FreeLLM fallback: ${problem}`) : []),
  ];
}
