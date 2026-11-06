import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inspectDraftMessage, listOwnDrafts, readOwnDraft } from './gmail-drafts.server';
import { draftTextCopy, ownDraftInput } from './gmail-draft-source';
const mocks = vi.hoisted(() => ({ token: vi.fn(), profile: vi.fn(), list: vi.fn(), get: vi.fn(), admin: vi.fn() }));
vi.mock('@/lib/gmail/oauth.server', () => ({ getValidAccessToken: mocks.token }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: mocks.admin } }));
vi.mock('@/lib/gmail/gmail-api.server', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/gmail/gmail-api.server')>(), getProfile: mocks.profile, listDrafts: mocks.list, getDraft: mocks.get }));
const encoded = (s: string) => Buffer.from(s).toString('base64url');
const message = () => ({ id: 'message', threadId: 'thread', labelIds: ['DRAFT'], payload: { mimeType: 'multipart/alternative', headers: [{ name: 'Subject', value: 'TESZT árvíztűrő' }], parts: [{ mimeType: 'text/plain', body: { data: encoded('TESZT őű'), size: 10 } }, { mimeType: 'text/html', body: { data: encoded('<b>TESZT őű</b>'), size: 20 } }] } });
const sb = (role = 'marketing') => ({ rpc: vi.fn().mockResolvedValue({ data: role, error: null }) }) as any;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockImplementation(() => { const q: any = { select: () => q, eq: () => q, single: async () => ({ data: { gmail_email: 'info@vibateam.hu', active: true, gmail_auth_error: null }, error: null }) }; return q; });
  mocks.token.mockResolvedValue({ accessToken: 'synthetic', email: 'info@vibateam.hu' });
  mocks.profile.mockResolvedValue({ emailAddress: 'info@vibateam.hu' });
  mocks.list.mockResolvedValue({ drafts: [{ id: 'draft', message: { id: 'message' } }], nextPageToken: 'next' });
  mocks.get.mockResolvedValue({ id: 'draft', message: message() });
});
describe('own Gmail draft source', () => {
  it('binds token lookup to authenticated user and lists one page without content reads', async () => {
    expect(await listOwnDrafts(sb(), 'own-user', 'page')).toMatchObject({ drafts: [{ id: 'draft' }], nextPageToken: 'next' });
    expect(mocks.token).toHaveBeenCalledWith('own-user'); expect(mocks.list).toHaveBeenCalledWith('synthetic', 'page'); expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each(['sales', 'pm', 'admin', 'user'])('rejects %s before accessing tokens', async role => {
    await expect(listOwnDrafts(sb(role), 'user')).rejects.toThrow(); expect(mocks.token).not.toHaveBeenCalled(); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('rejects foreign live mailbox before fetching a draft', async () => {
    mocks.profile.mockResolvedValue({ emailAddress: 'ramon.dencsi@vibateam.hu' });
    await expect(readOwnDraft(sb(), 'user', 'draft')).rejects.toThrow(); expect(mocks.get).not.toHaveBeenCalled();
  });
  it('rejects inactive account without refresh or draft reads', async () => {
    mocks.admin.mockImplementation(() => { const q: any = { select: () => q, eq: () => q, single: async () => ({ data: { gmail_email: 'info@vibateam.hu', active: false }, error: null }) }; return q; });
    await expect(readOwnDraft(sb(), 'user', 'draft')).rejects.toThrow(); expect(mocks.token).not.toHaveBeenCalled();
  });
  it('preserves nested UTF8 plain/HTML, source IDs and timestamp without tokens', async () => {
    const result = await readOwnDraft(sb('owner'), 'user', 'draft');
    expect(result).toMatchObject({ draftId: 'draft', messageId: 'message', text: 'TESZT őű', html: '<b>TESZT őű</b>', attachments: 0 });
    expect(Number.isFinite(Date.parse(result.readAt))).toBe(true); expect(JSON.stringify(result)).not.toContain('synthetic');
    expect(draftTextCopy(result)).toEqual({ subject: 'TESZT árvíztűrő', body: 'TESZT őű' });
  });
  it.each(['SENT', 'TRASH', 'SPAM'])('rejects DRAFT with %s', label => {
    expect(() => inspectDraftMessage({ ...message(), labelIds: ['DRAFT', label] })).toThrow();
  });
  it('rejects a changed draft identity', async () => {
    mocks.get.mockResolvedValue({ id: 'other', message: message() }); await expect(readOwnDraft(sb(), 'user', 'draft')).rejects.toThrow();
  });
  it('does not silently copy HTML-only or attached drafts', () => {
    const source = { draftId: 'draft', messageId: 'm', mailbox: 'info@vibateam.hu', readAt: '2026-11-06T17:23:00Z', subject: 'TESZT', text: 'TESZT', html: '<b>TESZT</b>', attachments: 0 };
    expect(() => draftTextCopy({ ...source, text: null })).toThrow();
    expect(() => draftTextCopy({ ...source, attachments: 1 })).toThrow();
    expect(() => draftTextCopy({ ...source, text: 'x'.repeat(20001) })).toThrow();
  });
  it('rejects external body parts and oversized MIME instead of snippets', () => {
    const draft = message();
    draft.payload.parts = [{ mimeType: 'text/plain', body: { attachmentId: 'a' } }] as any;
    expect(() => inspectDraftMessage(draft)).toThrow();
    draft.payload.parts = [{ mimeType: 'text/plain', body: { size: 200001, data: encoded('short') } }];
    expect(() => inspectDraftMessage(draft)).toThrow();
  });
  it('does not allow selecting another user or mailbox', () => {
    expect(() => ownDraftInput.parse({ draftId: 'draft', userId: 'foreign' })).toThrow();
    expect(() => ownDraftInput.parse({ draftId: 'draft', mailbox: 'ramon.dencsi@vibateam.hu' })).toThrow();
  });
});