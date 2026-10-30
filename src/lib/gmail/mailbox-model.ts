export type Mailbox = { userId: string; email: string; name: string | null; active: boolean; authError: boolean; lastSync: string | null };
export type MailFolder = "inbox" | "sent" | "waiting" | "auto" | "all" | "unread";
export type MailboxRow = {
  thread_id: string; subject: string | null; sort_date: string | null;
  from_email: string | null; to_email: string | null; snippet: string | null;
  outbound: boolean | null; unread: boolean; waiting: boolean; has_attachments: boolean;
  message_count: number; company_name: string | null; project_name: string | null;
  unknown_labels: boolean;
  mailboxes: { userId: string; email: string; messageCount: number; labelsKnown: boolean }[];
};
export type MailboxPage = {
  rows: MailboxRow[]; total: number;
  counts: Record<MailFolder | "unknown" | "messages", number>;
};

export function defaultMailbox(mailboxes: Mailbox[], userId: string | undefined): string | null {
  return mailboxes.find(m => m.userId === userId && m.active)?.email
    ?? mailboxes.find(m => m.active)?.email ?? mailboxes[0]?.email ?? null;
}

export function assertSenderIdentity(expected: string | undefined, stored: string, actual: string): void {
  const normalize = (value: string) => value.trim().toLowerCase();
  if (normalize(stored) !== normalize(actual) || (expected && normalize(expected) !== normalize(actual))) {
    throw new Error("A kiválasztott postafiók nem egyezik a saját Gmail-küldőfiókoddal.");
  }
}