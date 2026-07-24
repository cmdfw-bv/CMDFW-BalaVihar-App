-- Teacher's stacked private-thread UI (design decision #4) needs to label each thread card with
-- the target Parent/family's identifying label — the /design spec is explicit this must NOT be
-- the Student's name (data minimization, §12.1 non-negotiable #6). Uses families.label (already
-- granted select to authenticated, already populated for every family) rather than any
-- student-derived value, so no minor's name is ever exposed to a Teacher through this path. Gated
-- exactly as narrowly as is_parent_of_class: only the class's Teacher or an oversight role may
-- resolve a label, and only for a Parent genuinely enrolled-linked to that class. No match/no
-- authorization -> null, not an error (no existence leak).
create or replace function public.resolve_parent_family_label(p_parent_user_id uuid, p_class_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select f.label
  from family_members fm
  join families f on f.id = fm.family_id
  join students s on s.family_id = fm.family_id
  join enrollments e on e.student_id = s.id
  where fm.user_id = p_parent_user_id
    and e.class_id = p_class_id
    and e.status = 'active'
    and (
      (auth.jwt()->>'active_role' = 'teacher' and (auth.jwt()->>'scope_id')::uuid = p_class_id)
      or (auth.jwt()->>'active_role' = 'coordinator' and exists (
        select 1 from classes c where c.id = p_class_id and c.session_id = (auth.jwt()->>'scope_id')::uuid
      ))
      or auth.jwt()->>'active_role' in ('bv_coordinator', 'admin')
    )
  limit 1;
$$;

revoke all on function public.resolve_parent_family_label(uuid, uuid) from public;
grant execute on function public.resolve_parent_family_label(uuid, uuid) to authenticated;
