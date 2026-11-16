import { env } from '../config/env';

/** Explicit public walkthrough mode keeps cloud records durable and every email in the test provider. */
export function salesPreviewEnabled(): boolean {
  return env.HOSTED_PREVIEW && env.SALES_EMAIL_PROVIDER === 'mock';
}
