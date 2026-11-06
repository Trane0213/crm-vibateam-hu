import { beforeEach, expect, it, vi } from 'vitest';
import { importCampaignSource, sourceHash, detachCampaignSource } from './campaign-gmail-source.server';
import { campaignTestCopy } from './campaign-test-copy';
const m = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), row: null as any, role: 'marketing' }));
vi.mock('./gmail-drafts.server', () => ({ readOwnDraft: m.read }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { rpc: m.save } }));
const source = { draftId: 'draft', messageId: 'message', mailbox: 'info@vibateam.hu', subject: 'TESZT', text: 'TESZT őű', html: '<b>TESZT őű</b>', attachments: 0, readAt: '2026-11-06T17:27:00Z' };
const sb = { rpc: async () => ({ data: m.role }), from: () => { const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: m.row }) }; return q; } } as any;
const input = () => ({ campaignId: 'campaign', revision: 'revision', draftId: 'draft', expectedHash: sourceHash(source) });
beforeEach(() => {
  vi.clearAllMocks(); m.role = 'marketing';
  m.row = { id: 'campaign', created_by: 'user', status: 'draft', updated_at: 'revision' };
  m.read.mockResolvedValue(source);
  m.save.mockImplementation(async (_name, args) => { m.row = { ...m.row, message_subject: args.p_subject, message_body: args.p_text, message_html: args.p_html, gmail_draft_source: args.p_source }; return { data: {}, error: null }; });
});
it('stores freshly read exact HTML/source through one RPC and verifies readback', async () => {
  expect(await importCampaignSource(sb, 'user', input())).toEqual({ campaignId: 'campaign' });
  expect(m.read).toHaveBeenCalledWith(sb, 'user', 'draft'); expect(m.save).toHaveBeenCalledTimes(1);
  expect(m.save.mock.calls[0]?.[1]).toMatchObject({ p_html: '<b>TESZT őű</b>', p_source: { imported_by: 'user', sha256: sourceHash(source) } });
});
it('does not overwrite a changed Gmail source', async () => {
  m.read.mockResolvedValue({ ...source, html: '<i>changed</i>' });
  await expect(importCampaignSource(sb, 'user', input())).rejects.toThrow(); expect(m.save).not.toHaveBeenCalled();
});
it('blocks stale and foreign campaign before Gmail read', async () => {
  m.row.created_by = 'foreign'; await expect(importCampaignSource(sb, 'user', input())).rejects.toThrow();
  m.row.created_by = 'user'; m.row.updated_at = 'changed'; await expect(importCampaignSource(sb, 'user', input())).rejects.toThrow(); expect(m.read).not.toHaveBeenCalled();
});
it('does not report success for incomplete readback', async () => {
  m.save.mockResolvedValue({ data: {}, error: null }); await expect(importCampaignSource(sb, 'user', input())).rejects.toThrow();
});
it('rejects attached source before any persistence', async () => {
  const changed = { ...source, attachments: 1 }; m.read.mockResolvedValue(changed);
  await expect(importCampaignSource(sb, 'user', { ...input(), expectedHash: sourceHash(changed) })).rejects.toThrow(); expect(m.save).not.toHaveBeenCalled();
});
it('HTML-only import remains exact without invented plain text', async () => {
  const changed = { ...source, text: null }; m.read.mockResolvedValue(changed);
  await importCampaignSource(sb, 'user', { ...input(), expectedHash: sourceHash(changed) });
  expect(m.save.mock.calls[0]?.[1]).toMatchObject({ p_text: '', p_html: source.html });
});
it('detach proves null HTML and provenance after saved operation', async () => {
  m.save.mockImplementation(async () => { m.row = { ...m.row, message_html: null, gmail_draft_source: null }; return { error: null }; });
  expect(await detachCampaignSource(sb, 'user', 'campaign', 'revision')).toEqual({ campaignId: 'campaign' });
});
it('test copy uses stored HTML and retains old plain fallback', () => {
  expect(campaignTestCopy('TESZT', 'Hello {{nev}}', '<b>{{nev}}</b>')).toEqual({ subject: '[TESZT] TESZT', body: 'Hello TESZT Címzett', html: '<b>TESZT Címzett</b>' });
  expect(campaignTestCopy('TESZT', '<plain>', null).html).toBe('&lt;plain&gt;');
  expect(() => campaignTestCopy('TESZT', '', '<b>HTML only</b>')).toThrow();
});