-- PR #48 code-review Minor #7 and Minor #1.
--
-- (1) Length caps. `body`/`homework`/comment `body` were unbounded `text` with no client
-- `maxLength`, so a paste-bomb was accepted and then rendered. Caps are enforced here rather than
-- only in the composer, because the client bound is UX guidance that a direct PostgREST call
-- ignores. Values are the human-approved 5000/2000/2000 (2026-07-28); the client-side mirrors in
-- classUpdatePayload.ts / CommentComposer.logic.ts must stay in lockstep with these numbers.
--
-- Written as `not valid` + `validate` so the constraint is checked for new/updated rows
-- immediately but the validation scan doesn't take an ACCESS EXCLUSIVE lock on the whole table.
-- At POC size this is indistinguishable, but it's the correct shape to establish.
alter table class_updates
  add constraint class_updates_body_len check (char_length(body) <= 5000) not valid;
alter table class_updates validate constraint class_updates_body_len;

alter table class_updates
  add constraint class_updates_homework_len check (homework is null or char_length(homework) <= 2000) not valid;
alter table class_updates validate constraint class_updates_homework_len;

alter table comments
  add constraint comments_body_len check (char_length(body) <= 2000) not valid;
alter table comments validate constraint comments_body_len;

-- (2) Self-contradictory FK action. `posted_by`/`author_user_id` are `not null` but were declared
-- `on delete set null`, which cannot both hold: deleting an `auth.users` row raises 23502 (null
-- violation) instead of nulling the column. The *effective* behavior was already "block the
-- delete", so this is a no-op in practice — it just states that honestly and yields a clear
-- 23503 foreign-key error instead of a confusing not-null one.
--
-- `target_parent_id` is deliberately left `on delete set null`: it IS nullable, so set-null is
-- coherent there — except that `comments_private_target_shape` would then be violated for a
-- private comment, so that path still errors. Tightened to restrict for the same honesty.
--
-- messages.sender_user_id carries the identical latent bug (this feature's schema mirrored it);
-- fixing it is out of issue #21's scope and is tracked separately so the convention converges.
alter table class_updates drop constraint if exists class_updates_posted_by_fkey;
alter table class_updates
  add constraint class_updates_posted_by_fkey foreign key (posted_by) references auth.users(id) on delete restrict;

alter table comments drop constraint if exists comments_author_user_id_fkey;
alter table comments
  add constraint comments_author_user_id_fkey foreign key (author_user_id) references auth.users(id) on delete restrict;

alter table comments drop constraint if exists comments_target_parent_id_fkey;
alter table comments
  add constraint comments_target_parent_id_fkey foreign key (target_parent_id) references auth.users(id) on delete restrict;
