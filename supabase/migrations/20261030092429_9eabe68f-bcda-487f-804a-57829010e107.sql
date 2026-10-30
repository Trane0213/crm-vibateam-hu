CREATE INDEX IF NOT EXISTS idx_emails_mailbox_thread_date ON public.emails (owner_user_id, thread_id, internal_date DESC);
CREATE OR REPLACE FUNCTION public.crm_mailboxes()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
SELECT coalesce(jsonb_agg(jsonb_build_object('userId',p.auth_user_id,'email',m.mailbox,'name',p.full_name,'active',coalesce(p.active,false),'authError',p.gmail_auth_error IS NOT NULL,'lastSync',p.gmail_last_sync_at) ORDER BY coalesce(p.active,false) DESC,m.mailbox),'[]'::jsonb)
FROM public.users_profile p
CROSS JOIN LATERAL (SELECT lower(p.gmail_email) mailbox WHERE p.gmail_email IS NOT NULL UNION SELECT lower(a.mailbox_email) FROM public.email_thread_access a WHERE a.user_id=p.auth_user_id AND a.mailbox_email IS NOT NULL) m
WHERE auth.uid() IS NOT NULL AND (public.crm_role_of(auth.uid()) IN ('owner','tulajdonos') OR p.auth_user_id=auth.uid());
$$;
REVOKE ALL ON FUNCTION public.crm_mailboxes() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_mailboxes() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.crm_mailbox_page(p_mailbox text DEFAULT NULL,p_folder text DEFAULT 'inbox',p_search text DEFAULT '',p_page integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb; own_mailbox text; owner_access boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Bejelentkezés szükséges' USING ERRCODE='42501'; END IF;
 owner_access := coalesce(public.crm_role_of(auth.uid()) IN ('owner','tulajdonos'),false);
 IF NOT owner_access AND (p_mailbox IS NULL OR NOT EXISTS (SELECT 1 FROM public.users_profile p WHERE p.auth_user_id=auth.uid() AND lower(p.gmail_email)=lower(p_mailbox)) AND NOT EXISTS(SELECT 1 FROM public.email_thread_access a WHERE a.user_id=auth.uid() AND lower(a.mailbox_email)=lower(p_mailbox))) THEN
 RAISE EXCEPTION 'Csak a saját postafiók kérdezhető le' USING ERRCODE='42501'; END IF;
 IF p_folder NOT IN ('inbox','sent','waiting','auto','all','unread') OR p_page<0 OR length(coalesce(p_search,''))>200 THEN RAISE EXCEPTION 'Érvénytelen szűrés'; END IF;
 WITH accounts AS (
 SELECT p.auth_user_id user_id, lower(p.gmail_email) mailbox FROM public.users_profile p WHERE p.gmail_email IS NOT NULL AND (owner_access OR p.auth_user_id=auth.uid())
 UNION SELECT a.user_id,lower(a.mailbox_email) FROM public.email_thread_access a WHERE a.mailbox_email IS NOT NULL AND (owner_access OR a.user_id=auth.uid())
 ), memberships AS (
 SELECT a.thread_id,c.user_id,c.mailbox FROM public.email_thread_access a JOIN accounts c ON c.user_id=a.user_id AND c.mailbox=lower(a.mailbox_email)
 UNION SELECT e.thread_id,c.user_id,c.mailbox FROM public.emails e JOIN accounts c ON c.user_id=e.owner_user_id WHERE e.thread_id IS NOT NULL
 ), scoped AS (
 SELECT m.*,t.subject,t.company_id,t.project_id,t.last_message_at FROM memberships m JOIN public.email_threads t ON t.id=m.thread_id WHERE p_mailbox IS NULL OR m.mailbox=lower(p_mailbox)
 ), agg AS (
 SELECT s.*,x.message_count,x.latest_id,x.from_email,x.to_email,x.snippet,x.latest_date,x.latest_outbound,x.inbox,x.sent,x.unread,x.automated,x.last_inbound,x.last_sent,x.has_attachments,x.search_hit,
 CASE WHEN x.message_count=0 THEN NULL ELSE coalesce(x.last_inbound>x.last_sent,x.last_inbound IS NOT NULL) AND NOT x.automated END waiting
 FROM scoped s CROSS JOIN LATERAL (
 SELECT count(*) message_count,(array_agg(e.id ORDER BY coalesce(e.internal_date,e.created_at) DESC,e.id DESC))[1] latest_id,
 (array_agg(e.from_email ORDER BY coalesce(e.internal_date,e.created_at) DESC,e.id DESC))[1] from_email,
 (array_agg(e.to_email ORDER BY coalesce(e.internal_date,e.created_at) DESC,e.id DESC))[1] to_email,
 (array_agg(coalesce(e.snippet,e.summary,left(e.body,160)) ORDER BY coalesce(e.internal_date,e.created_at) DESC,e.id DESC))[1] snippet,
 max(coalesce(e.internal_date,e.created_at)) latest_date,
 (array_agg(coalesce(e.gmail_label_ids @> ARRAY['SENT'],false) ORDER BY coalesce(e.internal_date,e.created_at) DESC,e.id DESC))[1] latest_outbound,
 coalesce(bool_or(e.gmail_label_ids @> ARRAY['INBOX']),false) inbox,coalesce(bool_or(e.gmail_label_ids @> ARRAY['SENT']),false) sent,
 coalesce(bool_or(e.gmail_label_ids @> ARRAY['UNREAD']),false) unread,
 coalesce(bool_or(e.gmail_label_ids && ARRAY['CATEGORY_PROMOTIONS','CATEGORY_UPDATES','CATEGORY_SOCIAL','CATEGORY_FORUMS']),false) automated,
 max(coalesce(e.internal_date,e.created_at)) FILTER(WHERE NOT coalesce(e.gmail_label_ids @> ARRAY['SENT'],false) AND lower(coalesce(e.from_email,''))<>s.mailbox AND NOT coalesce(e.gmail_label_ids && ARRAY['TRASH','SPAM','DRAFT','CATEGORY_PROMOTIONS','CATEGORY_UPDATES','CATEGORY_SOCIAL','CATEGORY_FORUMS'],false) AND EXISTS(SELECT 1 FROM public.companies c WHERE c.id=coalesce(e.company_id,s.company_id)) AND NOT EXISTS(SELECT 1 FROM public.users_profile p WHERE lower(p.email)=lower(e.from_email) OR lower(p.gmail_email)=lower(e.from_email))) last_inbound,
 max(coalesce(e.internal_date,e.created_at)) FILTER(WHERE e.gmail_label_ids @> ARRAY['SENT']) last_sent,
 coalesce(bool_or(EXISTS(SELECT 1 FROM public.email_attachments a WHERE a.email_id=e.id AND NOT coalesce(a.inline,false))),false) has_attachments,
 coalesce(bool_or(position(lower(coalesce(p_search,'')) IN lower(concat_ws(' ',e.subject,e.from_email,e.to_email,array_to_string(e.to_emails,' '),array_to_string(e.cc_emails,' '),e.body,e.snippet)))>0),false) search_hit
 FROM public.emails e WHERE e.thread_id=s.thread_id AND e.owner_user_id=s.user_id
 ) x
 ), groups AS (
 SELECT a.thread_id,max(a.subject) subject,max(coalesce(a.latest_date,a.last_message_at)) sort_date,
 bool_or(a.inbox) inbox,bool_or(a.sent) sent,bool_or(coalesce(a.waiting,false)) waiting,bool_or(a.automated) automated,bool_or(a.unread) unread,
 bool_or(a.search_hit OR position(lower(coalesce(p_search,'')) IN lower(coalesce(a.subject,'')))>0) search_hit,
 jsonb_agg(jsonb_build_object('userId',a.user_id,'email',a.mailbox,'messageCount',a.message_count,'labelsKnown',a.message_count>0) ORDER BY a.mailbox) mailboxes,
 (array_agg(a.latest_id ORDER BY a.latest_date DESC NULLS LAST,a.mailbox))[1] latest_id,
 (array_agg(a.from_email ORDER BY a.latest_date DESC NULLS LAST,a.mailbox))[1] from_email,
 (array_agg(a.to_email ORDER BY a.latest_date DESC NULLS LAST,a.mailbox))[1] to_email,
 (array_agg(a.snippet ORDER BY a.latest_date DESC NULLS LAST,a.mailbox))[1] snippet,
 (array_agg(a.latest_outbound ORDER BY a.latest_date DESC NULLS LAST,a.mailbox))[1] outbound,
 sum(a.message_count) message_count,bool_or(a.has_attachments) has_attachments,
 (array_agg(a.company_id))[1] company_id,(array_agg(a.project_id))[1] project_id,
 bool_or(a.message_count=0) unknown_labels
 FROM agg a GROUP BY a.thread_id
 ), filtered AS (
 SELECT * FROM groups g WHERE (coalesce(p_search,'')='' OR g.search_hit) AND CASE p_folder WHEN 'inbox' THEN g.inbox WHEN 'sent' THEN g.sent WHEN 'waiting' THEN g.waiting WHEN 'auto' THEN g.automated WHEN 'unread' THEN g.unread ELSE true END
 ), page_rows AS (
 SELECT f.*,c.name company_name,p.title project_name FROM filtered f LEFT JOIN public.companies c ON c.id=f.company_id LEFT JOIN public.projects p ON p.id=f.project_id ORDER BY f.sort_date DESC NULLS LAST,f.thread_id LIMIT 50 OFFSET p_page*50
 )
 SELECT jsonb_build_object('counts',(SELECT jsonb_build_object('inbox',count(*) FILTER(WHERE inbox),'sent',count(*) FILTER(WHERE sent),'waiting',count(*) FILTER(WHERE waiting),'auto',count(*) FILTER(WHERE automated),'all',count(*),'unread',count(*) FILTER(WHERE unread),'unknown',count(*) FILTER(WHERE unknown_labels),'messages',coalesce(sum(message_count),0)) FROM groups),'total',(SELECT count(*) FROM filtered),'rows',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.sort_date DESC NULLS LAST,r.thread_id) FROM page_rows r),'[]'::jsonb)) INTO result;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.crm_mailbox_page(text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_mailbox_page(text,text,text,integer) TO authenticated,service_role;