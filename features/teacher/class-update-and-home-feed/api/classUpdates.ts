import type { SupabaseClient } from '@supabase/supabase-js';

export interface ClassUpdateRow {
  id: string;
  class_id: string;
  posted_by: string;
  body: string;
  homework: string | null;
  created_at: string;
  classLabel: string;
}

interface RawClassUpdateRow {
  id: string;
  class_id: string;
  posted_by: string;
  body: string;
  homework: string | null;
  created_at: string;
  classes: { name: string; sessions: { name: string; centers: { name: string } } } | null;
}

const CLASS_UPDATE_COLUMNS = 'id, class_id, posted_by, body, homework, created_at, classes(name, sessions(name, centers(name)))';

function mapClassUpdateRow(row: RawClassUpdateRow): ClassUpdateRow {
  return {
    id: row.id,
    class_id: row.class_id,
    posted_by: row.posted_by,
    body: row.body,
    homework: row.homework,
    created_at: row.created_at,
    classLabel: row.classes ? `${row.classes.sessions.centers.name} · ${row.classes.sessions.name} · ${row.classes.name}` : '',
  };
}

// RLS already scopes which rows come back per viewer (Student/Parent/Teacher/oversight) — this
// query is identical for every role (§12.1 non-negotiable #1: access is DB-enforced, not
// client-branched). The classes/sessions/centers nested select is readable per-viewer because
// it's the same class_id they already have class_updates visibility into (classes_*_select
// policies mirror the same scoping — core-schema-and-rls).
export async function fetchClassUpdatesFeed(supabase: SupabaseClient): Promise<ClassUpdateRow[]> {
  const { data, error } = await supabase
    .from('class_updates')
    .select(CLASS_UPDATE_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as RawClassUpdateRow[]).map(mapClassUpdateRow);
}

// Detail screen needs exactly one row — filter server-side instead of refetching (and re-joining)
// the whole feed and finding it client-side. maybeSingle() (not single()) so an out-of-scope/
// nonexistent id resolves to null, matching fetchClassUpdatesFeed(...).find(...)'s prior behavior,
// rather than throwing.
export async function fetchClassUpdateById(supabase: SupabaseClient, id: string): Promise<ClassUpdateRow | null> {
  const { data, error } = await supabase
    .from('class_updates')
    .select(CLASS_UPDATE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapClassUpdateRow(data as unknown as RawClassUpdateRow) : null;
}

export async function insertClassUpdate(
  supabase: SupabaseClient,
  params: { classId: string; postedBy: string; body: string; homework?: string }
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('class_updates')
    .insert({ class_id: params.classId, posted_by: params.postedBy, body: params.body, homework: params.homework ?? null })
    .select('id')
    .single();
  if (error) throw error;
  return data as { id: string };
}

// Design decision #3: a live, RLS-filtered count — not a denormalized counter. Counting the
// filtered rows client-side after one query (rather than one count(*) call per feed card)
// keeps this a single round trip; RLS has already dropped anything this viewer can't see.
export async function fetchCommentCounts(supabase: SupabaseClient, classUpdateIds: string[]): Promise<Map<string, number>> {
  if (classUpdateIds.length === 0) return new Map();
  const { data, error } = await supabase.from('comments').select('class_update_id').in('class_update_id', classUpdateIds);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ class_update_id: string }>) {
    counts.set(row.class_update_id, (counts.get(row.class_update_id) ?? 0) + 1);
  }
  return counts;
}
