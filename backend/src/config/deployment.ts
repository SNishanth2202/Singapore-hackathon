import { cloudConfigurationProblems } from './cloud';
import { publicAiConfigurationProblems, resolveAiConfiguration } from './ai';
import { validProductionOrigins } from './http';

type DeploymentEnvironment = Parameters<typeof resolveAiConfiguration>[0] & Parameters<typeof cloudConfigurationProblems>[0] & {
  STORAGE_MODE: string; LOCAL_DEMO_MODE: boolean; CORS_ORIGIN: string; HOST: string;
};
export function deploymentConfigurationProblems(config: DeploymentEnvironment): string[] {
  return [
    ...(config.STORAGE_MODE !== 'cloud' || config.LOCAL_DEMO_MODE ? ['Hosted startup requires STORAGE_MODE=cloud and LOCAL_DEMO_MODE=false.'] : []),
    ...(config.HOST !== '0.0.0.0' ? ['Set HOST=0.0.0.0 so Render can reach the backend.'] : []),
    ...(!validProductionOrigins(config.CORS_ORIGIN) ? ['Set CORS_ORIGIN to the exact HTTPS Vercel URL, without a trailing slash.'] : []),
    ...cloudConfigurationProblems(config), ...publicAiConfigurationProblems(resolveAiConfiguration(config)),
  ];
}
