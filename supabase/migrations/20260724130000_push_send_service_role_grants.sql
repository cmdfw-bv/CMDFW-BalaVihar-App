-- push-send (Netlify Function) runs under SUPABASE_SERVICE_ROLE_KEY and bypasses RLS, so —
-- per this project's established convention (20260711105647_csv_import_service_role_grants.sql:
-- "The service_role needs explicit table-level GRANTs because this project does not use
-- auto_expose_new_tables") — it needs an explicit grant for every table it queries directly.
-- Filed/reproduced as issue #47: neither this feature's class_updates read (dispatchClassUpdate)
-- nor push-send's original messages/conversations/conversation_participants reads
-- (dispatchMessage, pre-existing) ever had one, so every push dispatch has been silently
-- no-op'ing (`{"status":"noop","recipients":0}`) on any freshly-migrated database — the caller
-- gets a 200, nothing is logged as an error, and no push is ever actually sent.
--
-- comments is deliberately NOT granted here — push-send never queries it (confirmed by reading
-- netlify/functions/push-send.ts and its lib/ helpers); enrollments/students/family_members
-- already have service_role grants from the csv-import migration above. Narrowest-scope grants
-- only (§ supabase-sql rules) — add comments' grant later if a real caller needs it.

grant select on public.class_updates to service_role;

grant select on public.messages to service_role;
grant select on public.conversations to service_role;
grant select on public.conversation_participants to service_role;

-- push_subscriptions: select to read a recipient's subscriptions, delete for the fan-out's
-- expired-subscription cleanup (push-send.ts's fanOut() deletes a subscription on a 410/404
-- "gone" response from the push service).
grant select, delete on public.push_subscriptions to service_role;
