-- Class-chat membership preview (issue #119). READ-ONLY and COUNTS ONLY.
--
-- For every class conversation: how many participant rows the repair would add, remove, or
-- relabel, by label. No user ids, names or emails are printed (minors' data minimization).
-- class_chat_membership_preview() is a `stable` function, so Postgres refuses any write in it.
--
-- Run with psql against the target database, before and after
-- 20261113130000_class_chat_membership_repair.sql. After the repair it must return 0 rows.
--   relabel -> participant_role is the NEW label;  remove -> the stored label.
select * from public.class_chat_membership_preview() order by class_id, action, participant_role;
