import { env } from '../config/env';
import { AppError } from '../utils/errors';

export interface OutboundEmail { to: string; subject: string; body: string; threadId?: string; providerMessageId?: string; inReplyTo?: string; idempotencyKey: string }
export interface ProviderAcceptance { provider: 'MOCK' | 'GMAIL' | 'MICROSOFT_GRAPH'; messageId: string; threadId?: string; internetMessageId?: string; acceptedAt: string; deliveryConfirmed: false }
export interface InboundEmail {
  provider: ProviderAcceptance['provider']; providerMessageId: string; providerThreadId?: string; internetMessageId?: string;
  inReplyTo?: string; from: string; subject: string; text: string; receivedAt: string; isSynthetic: boolean;
}
export interface EmailProvider {
  send(message: OutboundEmail): Promise<ProviderAcceptance>;
  /** Messages received after `since`. Callers deduplicate by provider message ID. */
  listInbound(since: Date): Promise<InboundEmail[]>;
}

/** Remove quoted history so classification sees only what the customer wrote in this message. */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s*On .{4,200}wrote:\s*$/i.test(line) || /^-{2,}\s*Original Message\s*-{2,}/i.test(line) || (/^\s*From:\s.+/i.test(line) && kept.length > 0)) break;
    if (/^\s*>/.test(line)) continue;
    kept.push(line);
  }
  return kept.join('\n').trim() || text.trim();
}

function parseAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

function assertSafeEmailHeaders(message: OutboundEmail) {
  for (const value of [message.to, message.subject, message.inReplyTo ?? '']) {
    if (/[\r\n\0]/.test(value)) throw new AppError('Email contains an invalid header value.', 400, 'INVALID_EMAIL_HEADER');
  }
}
function encodeSubject(value: string) {
  assertSafeEmailHeaders({ to: '', subject: value, body: '', idempotencyKey: 'header-check' });
  return /[^\x20-\x7e]/.test(value) ? '=?UTF-8?B?' + Buffer.from(value, 'utf8').toString('base64') + '?=' : value;
}

const syntheticInbox: InboundEmail[] = [];
const syntheticOutbox: (OutboundEmail & { acceptedAt: string })[] = [];
/** Local preview only: queue a clearly labelled synthetic customer email for the polling worker. */
export function enqueueSyntheticInbound(message: Omit<InboundEmail, 'provider' | 'isSynthetic' | 'receivedAt'> & { receivedAt?: string }) {
  const value: InboundEmail = { ...message, provider: 'MOCK', isSynthetic: true, receivedAt: message.receivedAt ?? new Date().toISOString() };
  syntheticInbox.push(value);
  return value;
}
export function syntheticOutboxMessages() { return structuredClone(syntheticOutbox); }
export function clearSyntheticMailbox() { syntheticInbox.length = 0; syntheticOutbox.length = 0; }

/** Never contacts a mail server. Used by tests and the clearly labelled local/hosted preview. */
class MockEmailProvider implements EmailProvider {
  async send(message: OutboundEmail): Promise<ProviderAcceptance> {
    assertSafeEmailHeaders(message);
    syntheticOutbox.push({ ...structuredClone(message), acceptedAt: new Date().toISOString() });
    return { provider: 'MOCK', messageId: 'mock-' + message.idempotencyKey, threadId: message.threadId ?? 'mock-thread-' + message.idempotencyKey,
      internetMessageId: '<mock-' + message.idempotencyKey + '@synthetic.invalid>', acceptedAt: new Date().toISOString(), deliveryConfirmed: false };
  }
  async listInbound(): Promise<InboundEmail[]> {
    // Drain: each synthetic message is handed to the worker once.
    return syntheticInbox.splice(0, syntheticInbox.length);
  }
}

abstract class OAuthEmailProvider {
  private cached?: { token: string; expiresAt: number };
  protected async accessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt > Date.now() + 60_000) return this.cached.token;
    const refreshed = await this.refreshToken();
    this.cached = { token: refreshed.accessToken, expiresAt: Date.now() + refreshed.expiresIn * 1000 };
    return refreshed.accessToken;
  }
  protected async refresh(url: string, body: URLSearchParams): Promise<{ accessToken: string; expiresIn: number }> {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, redirect: 'error' });
    if (!response.ok) throw new AppError('Email provider authentication failed. Check server-side OAuth settings.', 503, 'EMAIL_AUTH_FAILED');
    const data = await response.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token || !data.expires_in) throw new AppError('Email provider returned an invalid OAuth token response.', 502, 'EMAIL_PROVIDER_INVALID_RESPONSE');
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }
  protected abstract refreshToken(): Promise<{ accessToken: string; expiresIn: number }>;
  abstract send(message: OutboundEmail): Promise<ProviderAcceptance>;
}

class GmailProvider extends OAuthEmailProvider {
  protected async refreshToken() {
    const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
    if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) throw new AppError('Configure Gmail OAuth client ID, secret, and refresh token in the backend environment.', 503, 'EMAIL_PROVIDER_NOT_CONFIGURED');
    return this.refresh('https://oauth2.googleapis.com/token', new URLSearchParams({ client_id: GMAIL_CLIENT_ID, client_secret: GMAIL_CLIENT_SECRET, refresh_token: GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }));
  }
  async send(message: OutboundEmail): Promise<ProviderAcceptance> {
    assertSafeEmailHeaders(message);
    const raw = ['To: ' + message.to, 'Subject: ' + encodeSubject(message.subject), 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
      ...(message.inReplyTo ? ['In-Reply-To: ' + message.inReplyTo, 'References: ' + message.inReplyTo] : []), '', message.body].join('\r\n');
    const encoded = Buffer.from(raw, 'utf8').toString('base64url');
    const token = await this.accessToken();
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded, ...(message.threadId ? { threadId: message.threadId } : {}) }), redirect: 'error',
    });
    if (!response.ok) throw new AppError('Gmail did not accept the message. Review provider status before retrying.', 502, 'EMAIL_PROVIDER_SEND_FAILED');
    const data = await response.json() as { id?: string; threadId?: string };
    if (!data.id) throw new AppError('Gmail accepted a request without a message identifier.', 502, 'EMAIL_PROVIDER_INVALID_RESPONSE');
    let internetMessageId: string | undefined;
    try {
      const metadata = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent(data.id) + '?format=metadata&metadataHeaders=Message-ID',
        { headers: { Authorization: 'Bearer ' + token }, redirect: 'error' });
      if (metadata.ok) {
        const value = await metadata.json() as { payload?: { headers?: { name: string; value: string }[] } };
        internetMessageId = value.payload?.headers?.find(header => header.name.toLowerCase() === 'message-id')?.value;
      }
    } catch { /* The provider acceptance remains valid if optional thread metadata is unavailable. */ }
    return { provider: 'GMAIL', messageId: data.id, threadId: data.threadId, internetMessageId, acceptedAt: new Date().toISOString(), deliveryConfirmed: false };
  }
  async listInbound(since: Date): Promise<InboundEmail[]> {
    const token = await this.accessToken();
    const query = encodeURIComponent('in:inbox -from:me after:' + Math.floor(+since / 1000));
    const list = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=' + query,
      { headers: { Authorization: 'Bearer ' + token }, redirect: 'error' });
    if (!list.ok) throw new AppError('Gmail inbox could not be listed. Check the OAuth grant includes gmail.readonly.', 502, 'EMAIL_PROVIDER_READ_FAILED');
    const ids = ((await list.json()) as { messages?: { id: string }[] }).messages ?? [];
    const results: InboundEmail[] = [];
    for (const { id } of ids) {
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent(id) + '?format=full',
        { headers: { Authorization: 'Bearer ' + token }, redirect: 'error' });
      if (!response.ok) continue;
      type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[]; headers?: { name: string; value: string }[] };
      const message = await response.json() as { id: string; threadId?: string; internalDate?: string; payload?: Part };
      const headers = message.payload?.headers ?? [];
      const header = (name: string) => headers.find(item => item.name.toLowerCase() === name)?.value;
      const findText = (part?: Part): string | undefined => {
        if (!part) return undefined;
        if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
        for (const child of part.parts ?? []) { const value = findText(child); if (value) return value; }
        return undefined;
      };
      const text = findText(message.payload);
      const from = header('from');
      if (!text || !from) continue;
      results.push({ provider: 'GMAIL', providerMessageId: message.id, providerThreadId: message.threadId, internetMessageId: header('message-id'),
        inReplyTo: header('in-reply-to'), from: parseAddress(from), subject: header('subject') ?? '', text: stripQuotedReply(text),
        receivedAt: new Date(Number(message.internalDate ?? Date.now())).toISOString(), isSynthetic: false });
    }
    return results;
  }
}

class MicrosoftGraphProvider extends OAuthEmailProvider {
  protected async refreshToken() {
    const { MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REFRESH_TOKEN } = process.env;
    if (!MICROSOFT_TENANT_ID || !MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_REFRESH_TOKEN) {
      throw new AppError('Configure Microsoft OAuth tenant, client ID, secret, and refresh token in the backend environment.', 503, 'EMAIL_PROVIDER_NOT_CONFIGURED');
    }
    return this.refresh('https://login.microsoftonline.com/' + encodeURIComponent(MICROSOFT_TENANT_ID) + '/oauth2/v2.0/token',
      new URLSearchParams({ client_id: MICROSOFT_CLIENT_ID, client_secret: MICROSOFT_CLIENT_SECRET, refresh_token: MICROSOFT_REFRESH_TOKEN, grant_type: 'refresh_token', scope: 'offline_access Mail.Send Mail.ReadWrite Mail.Read' }));
  }
  async send(message: OutboundEmail): Promise<ProviderAcceptance> {
    assertSafeEmailHeaders(message);
    const token = await this.accessToken();
    const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'IdType="ImmutableId"' };
    let id: string;
    let threadId: string | undefined;
    if (message.providerMessageId) {
      const reply = await fetch('https://graph.microsoft.com/v1.0/me/messages/' + encodeURIComponent(message.providerMessageId) + '/createReply', { method: 'POST', headers, redirect: 'error' });
      if (!reply.ok) throw new AppError('Microsoft Graph could not create a reply draft.', 502, 'EMAIL_PROVIDER_SEND_FAILED');
      const draft = await reply.json() as { id?: string; conversationId?: string };
      if (!draft.id) throw new AppError('Microsoft Graph returned an invalid reply draft.', 502, 'EMAIL_PROVIDER_INVALID_RESPONSE');
      id = draft.id; threadId = draft.conversationId;
      const updated = await fetch('https://graph.microsoft.com/v1.0/me/messages/' + encodeURIComponent(id), {
        method: 'PATCH', headers, body: JSON.stringify({ subject: message.subject, body: { contentType: 'Text', content: message.body } }), redirect: 'error',
      });
      if (!updated.ok) throw new AppError('Microsoft Graph could not update the reply draft.', 502, 'EMAIL_PROVIDER_SEND_FAILED');
    } else {
      const draft = await fetch('https://graph.microsoft.com/v1.0/me/messages', { method: 'POST', headers,
        body: JSON.stringify({ subject: message.subject, body: { contentType: 'Text', content: message.body }, toRecipients: [{ emailAddress: { address: message.to } }] }), redirect: 'error' });
      if (!draft.ok) throw new AppError('Microsoft Graph could not create a message draft.', 502, 'EMAIL_PROVIDER_SEND_FAILED');
      const created = await draft.json() as { id?: string; conversationId?: string };
      if (!created.id) throw new AppError('Microsoft Graph returned a draft without an identifier.', 502, 'EMAIL_PROVIDER_INVALID_RESPONSE');
      id = created.id; threadId = created.conversationId;
    }
    const sent = await fetch('https://graph.microsoft.com/v1.0/me/messages/' + encodeURIComponent(id) + '/send', { method: 'POST', headers: { Authorization: headers.Authorization }, redirect: 'error' });
    if (!sent.ok) throw new AppError('Microsoft Graph did not accept the message for sending.', 502, 'EMAIL_PROVIDER_SEND_FAILED');
    return { provider: 'MICROSOFT_GRAPH', messageId: id, threadId, acceptedAt: new Date().toISOString(), deliveryConfirmed: false };
  }
  async listInbound(since: Date): Promise<InboundEmail[]> {
    const token = await this.accessToken();
    const params = new URLSearchParams({
      $filter: 'receivedDateTime ge ' + since.toISOString(), $orderby: 'receivedDateTime asc', $top: '50',
      $select: 'id,conversationId,internetMessageId,from,subject,body,receivedDateTime',
    });
    const response = await fetch('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?' + params.toString(), {
      headers: { Authorization: 'Bearer ' + token, Prefer: 'outlook.body-content-type="text", IdType="ImmutableId"' }, redirect: 'error' });
    if (!response.ok) throw new AppError('Microsoft Graph inbox could not be listed. Check the Mail.Read permission.', 502, 'EMAIL_PROVIDER_READ_FAILED');
    const data = await response.json() as { value?: { id: string; conversationId?: string; internetMessageId?: string; subject?: string;
      receivedDateTime?: string; from?: { emailAddress?: { address?: string } }; body?: { content?: string } }[] };
    return (data.value ?? []).filter(item => item.from?.emailAddress?.address && item.body?.content).map(item => ({
      provider: 'MICROSOFT_GRAPH' as const, providerMessageId: item.id, providerThreadId: item.conversationId, internetMessageId: item.internetMessageId,
      from: item.from!.emailAddress!.address!.toLowerCase(), subject: item.subject ?? '', text: stripQuotedReply(item.body!.content!),
      receivedAt: item.receivedDateTime ?? new Date().toISOString(), isSynthetic: false,
    }));
  }
}

export function emailProviderStatus() {
  const provider = env.SALES_EMAIL_PROVIDER;
  const configured = provider === 'gmail' ? !!(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN)
    : provider === 'microsoft' ? !!(env.MICROSOFT_TENANT_ID && env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET && env.MICROSOFT_REFRESH_TOKEN)
      : true;
  return {
    provider, configured, synthetic: provider === 'mock', sendsRealEmail: provider !== 'mock' && configured,
    inboundMode: provider === 'mock' ? 'synthetic_inbox' : 'polling_with_optional_webhook_relay',
    note: provider === 'mock'
      ? 'Test provider: outbound messages stay in the recorded outbox and never leave this server. Customer replies can be simulated.'
      : configured ? 'Real provider configured. Provider acceptance is recorded separately from confirmed inbox delivery.'
        : 'Provider selected but OAuth credentials are missing; sending and inbox polling will fail until configured.',
  };
}

let configuredEmailProvider: EmailProvider | undefined;
export function getEmailProvider(): EmailProvider {
  if (!configuredEmailProvider) {
    configuredEmailProvider = env.SALES_EMAIL_PROVIDER === 'gmail' ? new GmailProvider()
      : env.SALES_EMAIL_PROVIDER === 'microsoft' ? new MicrosoftGraphProvider() : new MockEmailProvider();
  }
  return configuredEmailProvider;
}
