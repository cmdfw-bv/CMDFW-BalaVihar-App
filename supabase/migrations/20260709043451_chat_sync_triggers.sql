create or replace function sync_class_conversation() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into conversations (kind, scope_type, scope_id)
  values ('class', 'class', new.id)
  on conflict (kind, scope_type, scope_id) do nothing;
  return new;
end;
$$;

create trigger classes_after_insert_conversation
after insert on classes
for each row execute function sync_class_conversation();

create or replace function sync_session_conversation() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into conversations (kind, scope_type, scope_id)
  values ('session_staff', 'session', new.id)
  on conflict (kind, scope_type, scope_id) do nothing;
  return new;
end;
$$;

create trigger sessions_after_insert_conversation
after insert on sessions
for each row execute function sync_session_conversation();

-- One org-wide leadership conversation, created once.
insert into conversations (kind, scope_type, scope_id)
values ('leadership', 'org', null)
on conflict (kind) where scope_type = 'org' do nothing;

create or replace function sync_class_participants() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
  v_conversation_id uuid;
  v_student_user_id uuid;
  v_family_id uuid;
begin
  v_class_id := coalesce(new.class_id, old.class_id);

  select id into v_conversation_id from conversations
  where kind = 'class' and scope_type = 'class' and scope_id = v_class_id;

  if v_conversation_id is null then
    return coalesce(new, old);
  end if;

  if tg_op in ('INSERT','UPDATE') and new.status = 'active' then
    select user_id, family_id into v_student_user_id, v_family_id from students where id = new.student_id;

    if v_student_user_id is not null then
      insert into conversation_participants (conversation_id, user_id, participant_role)
      values (v_conversation_id, v_student_user_id, 'student')
      on conflict (conversation_id, user_id) do nothing;
    end if;

    insert into conversation_participants (conversation_id, user_id, participant_role)
    select v_conversation_id, fm.user_id, 'parent'
    from family_members fm
    where fm.family_id = v_family_id
    on conflict (conversation_id, user_id) do nothing;
  end if;

  if tg_op = 'UPDATE' and old.status = 'active' and new.status = 'withdrawn' then
    select user_id, family_id into v_student_user_id, v_family_id from students where id = old.student_id;

    if v_student_user_id is not null then
      delete from conversation_participants
      where conversation_id = v_conversation_id and user_id = v_student_user_id;
    end if;

    delete from conversation_participants cp
    using family_members fm
    where cp.conversation_id = v_conversation_id
      and cp.user_id = fm.user_id
      and fm.family_id = v_family_id
      and not exists (
        select 1 from enrollments e2
        join students s2 on s2.id = e2.student_id
        where e2.class_id = v_class_id and e2.status = 'active' and s2.family_id = v_family_id
      );
  end if;

  return coalesce(new, old);
end;
$$;

create trigger enrollments_sync_participants
after insert or update on enrollments
for each row execute function sync_class_participants();

create or replace function sync_staff_participants() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
  if tg_op = 'DELETE' then
    if old.scope_type = 'class' and old.role = 'teacher' then
      select id into v_conversation_id from conversations where kind='class' and scope_type='class' and scope_id = old.scope_id;
    elsif old.scope_type = 'session' and old.role = 'coordinator' then
      select id into v_conversation_id from conversations where kind='session_staff' and scope_type='session' and scope_id = old.scope_id;
    elsif old.scope_type = 'org' and old.role in ('bv_coordinator','admin') then
      select id into v_conversation_id from conversations where kind='leadership' and scope_type='org';
    end if;

    if v_conversation_id is not null then
      delete from conversation_participants where conversation_id = v_conversation_id and user_id = old.user_id;
    end if;
    return old;
  end if;

  if new.scope_type = 'class' and new.role = 'teacher' then
    select id into v_conversation_id from conversations where kind='class' and scope_type='class' and scope_id = new.scope_id;
    if v_conversation_id is not null then
      insert into conversation_participants (conversation_id, user_id, participant_role)
      values (v_conversation_id, new.user_id, 'teacher')
      on conflict (conversation_id, user_id) do nothing;
    end if;
  elsif new.scope_type = 'session' and new.role = 'coordinator' then
    select id into v_conversation_id from conversations where kind='session_staff' and scope_type='session' and scope_id = new.scope_id;
    if v_conversation_id is not null then
      insert into conversation_participants (conversation_id, user_id, participant_role)
      values (v_conversation_id, new.user_id, 'coordinator')
      on conflict (conversation_id, user_id) do nothing;
    end if;
  elsif new.scope_type = 'org' and new.role in ('bv_coordinator','admin') then
    select id into v_conversation_id from conversations where kind='leadership' and scope_type='org';
    if v_conversation_id is not null then
      insert into conversation_participants (conversation_id, user_id, participant_role)
      values (v_conversation_id, new.user_id, new.role)
      on conflict (conversation_id, user_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

create trigger user_roles_sync_participants
after insert or delete on user_roles
for each row execute function sync_staff_participants();
