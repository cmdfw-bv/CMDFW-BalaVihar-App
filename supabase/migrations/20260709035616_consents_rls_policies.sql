create policy consents_parent_select on consents for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from students s join family_members fm on fm.family_id = s.family_id
    where s.id = consents.student_id and fm.user_id = auth.uid()
  )
);
create policy consents_student_select on consents for select
using (
  auth.jwt()->>'active_role' = 'student'
  and exists (select 1 from students s where s.id = consents.student_id and s.user_id = auth.uid())
);
create policy consents_parent_insert on consents for insert
with check (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from students s join family_members fm on fm.family_id = s.family_id
    where s.id = consents.student_id and fm.user_id = auth.uid()
  )
);
create policy consents_parent_update on consents for update
using (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from students s join family_members fm on fm.family_id = s.family_id
    where s.id = consents.student_id and fm.user_id = auth.uid()
  )
)
with check (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from students s join family_members fm on fm.family_id = s.family_id
    where s.id = consents.student_id and fm.user_id = auth.uid()
  )
);
