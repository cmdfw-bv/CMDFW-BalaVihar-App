#!/usr/bin/env node
// verify-96-cloud.mjs — the cloud check ADR-2026-09-19's addendum requires before promotion.
//
// WHY THIS EXISTS
//   #96's migration (20261003120000) revokes conversational access on withdrawal. Local pgTAP
//   proves the access rules but is structurally blind to #105: on cloud free-tier, class_updates
//   reads already time out (57014, ~50s) with ZERO rows in the table, because the cost is the RLS
//   policy plan on the nested classes -> sessions -> centers embed. #96 adds join work to exactly
//   those policies, and takes comments_target_parent_select from no joins to four. So the only
//   place the risk is observable is cloud staging, as a real signed-in user through PostgREST.
//
// WHAT IT DOES
//   1. refuses to run against anything but the staging project (exact ref match)
//   2. finds a family with exactly ONE active enrollment (so withdrawing it empties their feed —
//      a family with a second enrolment would mask the effect via the sibling rule)
//   3. reads the home feed as that Parent and that Student, timed            -> expect rows, no 57014
//   4. flips the enrollment active -> withdrawn BY UPDATE (not insert: a transition, per the
//      addendum's fixture warning — an inserted 'withdrawn' row proves nothing about a transition)
//   5. re-reads as Parent and Student                                        -> expect 0 rows, fast
//   6. re-reads the Parent's own private thread                              -> expect 0 rows
//      (ADR Decision 1b — the assertion most likely to pass vacuously if 1b were skipped)
//   7. ALWAYS restores the enrollment to active, then verifies the restore
//   8. prints a result block to paste into the spec
//
//   If the migration is NOT applied to staging, step 5 returns rows and the script fails loudly —
//   so there is no separate "is it deployed?" check to forget.
//
// USAGE
//   export STAGING_PROJECT_REF='ejjvqtleuuamgtlmtxkc'          # exact ref, no guessing
//   export STAGING_SUPABASE_URL="https://$STAGING_PROJECT_REF.supabase.co"
//   read -rs "STAGING_SUPABASE_SERVICE_ROLE_KEY?service_role key: "; export STAGING_SUPABASE_SERVICE_ROLE_KEY
//   node verify-96-cloud.mjs            # dry run: discovery + baseline reads only, NO mutation
//   node verify-96-cloud.mjs --mutate   # the full check, including the withdraw/restore
//
//   Secrets are read from the environment and never written anywhere. Unset them when done.
//
// NOT COVERED HERE
//   EXPLAIN (ANALYZE, BUFFERS) — the addendum calls that "ideally". It needs psql against
//   STAGING_DB_URL with role/JWT claims set; psql is not installed on this machine. The SQL is
//   printed at the end so it can be pasted into Supabase Studio's SQL editor instead.

const FEED_SELECT =
  'id,class_id,posted_by,body,homework,created_at,classes(name,sessions(name,centers(name)))';
const FEED_LIMIT = 200;        // FEED_PAGE_LIMIT — matches fetchClassUpdatesFeed exactly
const SLOW_MS = 5000;          // flag anything this slow even if it eventually returns

const MUTATE = process.argv.includes('--mutate');

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`FATAL: ${name} is not set. See the usage block at the top of this file.`);
    process.exit(2);
  }
  return v;
}

// ---- safety rail: exact ref match, no suffix matching ------------------------------------------
// Deliberately NOT endsWith()/includes() — that is the class of bug under review in #108.
function assertStagingTarget(url, expectedRef) {
  if (!/^[a-z0-9]{20}$/.test(expectedRef)) {
    throw new Error(`STAGING_PROJECT_REF "${expectedRef}" is not a 20-char project ref`);
  }
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new Error(`refusing non-https target: ${u.protocol}`);
  if (u.hostname !== `${expectedRef}.supabase.co`) {
    throw new Error(
      `refusing target: host is "${u.hostname}", expected exactly "${expectedRef}.supabase.co"`
    );
  }
  if (u.pathname !== '/' && u.pathname !== '') throw new Error(`unexpected path: ${u.pathname}`);
}

const BASE = need('STAGING_SUPABASE_URL').replace(/\/+$/, '');
const REF = need('STAGING_PROJECT_REF');
const SRK = need('STAGING_SUPABASE_SERVICE_ROLE_KEY');
assertStagingTarget(BASE, REF);

const svc = { apikey: SRK, Authorization: `Bearer ${SRK}` };

async function rest(path, { token, method = 'GET', body, prefer } = {}) {
  const headers = token
    ? { apikey: SRK, Authorization: `Bearer ${token}` }   // anon-role request under RLS
    : { ...svc };                                         // service role, bypasses RLS
  if (body) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const t0 = Date.now();
  const r = await fetch(`${BASE}/rest/v1/${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const ms = Date.now() - t0;
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep raw */ }
  return { ok: r.ok, status: r.status, ms, json, text };
}

// ---- step 2: find a family with exactly one active enrollment ----------------------------------
async function findCleanFamily() {
  const r = await rest(
    'enrollments?select=id,status,class_id,student_id,students(id,family_id,user_id,first_name)' +
    '&status=eq.active&limit=1000'
  );
  if (!r.ok) throw new Error(`enrollment discovery failed (${r.status}): ${r.text.slice(0, 200)}`);

  const byFamily = new Map();
  for (const e of r.json ?? []) {
    const fam = e.students?.family_id;
    if (!fam) continue;
    if (!byFamily.has(fam)) byFamily.set(fam, []);
    byFamily.get(fam).push(e);
  }
  // exactly one active enrollment, and the student has a login (so the Student path is checkable)
  for (const [familyId, list] of byFamily) {
    if (list.length !== 1) continue;
    if (!list[0].students?.user_id) continue;
    const fm = await rest(`family_members?select=user_id,relationship&family_id=eq.${familyId}`);
    if (!fm.ok || !(fm.json ?? []).length) continue;
    return { familyId, enrollment: list[0], parentUserIds: fm.json.map((x) => x.user_id) };
  }
  throw new Error(
    'no family found with exactly one active enrollment AND a student login.\n' +
    '  Every candidate family has a second enrolment, which would mask the effect via the\n' +
    '  sibling rule (ADR Decision 3). Seed a single-enrolment family, or pick one by hand\n' +
    '  and set TARGET_ENROLLMENT_ID.'
  );
}

// ---- mint a real user JWT with the service-role key --------------------------------------------
// NOTE: this is the step most likely to need a tweak on first run — the admin generate_link /
// verify handshake differs slightly across GoTrue versions. If it fails, sign in as the user in a
// browser, copy the access token from the session, and set PARENT_TOKEN / STUDENT_TOKEN instead.
async function mintToken(email) {
  const gen = await fetch(`${BASE}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { ...svc, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  if (!gen.ok) throw new Error(`generate_link failed for ${email} (${gen.status})`);
  const g = await gen.json();
  const hashed = g.hashed_token ?? g.properties?.hashed_token;
  if (!hashed) throw new Error(`generate_link gave no hashed_token for ${email}`);

  const ver = await fetch(`${BASE}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: SRK, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token: hashed, email }),
  });
  if (!ver.ok) throw new Error(`verify failed for ${email} (${ver.status}): ${(await ver.text()).slice(0, 160)}`);
  const v = await ver.json();
  if (!v.access_token) throw new Error(`verify gave no access_token for ${email}`);
  return v.access_token;
}

async function emailFor(userId) {
  const r = await fetch(`${BASE}/auth/v1/admin/users/${userId}`, { headers: svc });
  if (!r.ok) throw new Error(`admin lookup failed for ${userId} (${r.status})`);
  return (await r.json()).email;
}

// ---- the reads under test ----------------------------------------------------------------------
async function feedRead(label, token) {
  const r = await rest(
    `class_updates?select=${encodeURIComponent(FEED_SELECT)}&order=created_at.desc&limit=${FEED_LIMIT}`,
    { token }
  );
  const code = r.json?.code;
  const timedOut = code === '57014';
  const rows = Array.isArray(r.json) ? r.json.length : null;
  console.log(
    `    ${label.padEnd(34)} ${String(r.status).padEnd(4)} ${String(r.ms + 'ms').padEnd(8)} ` +
    (timedOut ? 'TIMEOUT 57014' : rows === null ? `error: ${(r.json?.message ?? r.text).slice(0, 60)}` : `${rows} rows`) +
    (!timedOut && r.ms > SLOW_MS ? '   <-- SLOW' : '')
  );
  return { ...r, rows, timedOut };
}

async function privateThreadRead(label, token, classUpdateId) {
  const r = await rest(
    `comments?select=id,class_update_id,is_private,target_parent_id&class_update_id=eq.${classUpdateId}` +
    `&is_private=eq.true&order=created_at.asc`,
    { token }
  );
  const rows = Array.isArray(r.json) ? r.json.length : null;
  console.log(`    ${label.padEnd(34)} ${String(r.status).padEnd(4)} ${String(r.ms + 'ms').padEnd(8)}` +
    (rows === null ? `error: ${(r.json?.message ?? r.text).slice(0, 60)}` : `${rows} rows`));
  return { ...r, rows };
}

async function setStatus(enrollmentId, status) {
  const r = await rest(`enrollments?id=eq.${enrollmentId}`, {
    method: 'PATCH', body: { status }, prefer: 'return=representation',
  });
  if (!r.ok) throw new Error(`failed to set status=${status} (${r.status}): ${r.text.slice(0, 200)}`);
  const got = r.json?.[0]?.status;
  if (got !== status) throw new Error(`status did not take: wanted ${status}, got ${got}`);
  return got;
}

// ---- main --------------------------------------------------------------------------------------
const results = [];
let target = null;
let restored = true;

try {
  console.log(`\n  target: ${BASE}  (ref ${REF} — exact match verified)`);
  console.log(`  mode:   ${MUTATE ? 'FULL CHECK (will withdraw then restore)' : 'DRY RUN (no mutation)'}\n`);

  console.log('  [1] discovery');
  target = await findCleanFamily();
  const parentEmail = await emailFor(target.parentUserIds[0]);
  const studentEmail = await emailFor(target.enrollment.students.user_id);
  console.log(`    family ${target.familyId}`);
  console.log(`    enrollment ${target.enrollment.id} (class ${target.enrollment.class_id}) — the only active one`);
  console.log(`    parent  ${parentEmail}`);
  console.log(`    student ${studentEmail}\n`);

  console.log('  [2] sign in as both');
  const parentToken = process.env.PARENT_TOKEN ?? (await mintToken(parentEmail));
  const studentToken = process.env.STUDENT_TOKEN ?? (await mintToken(studentEmail));
  console.log('    got both access tokens\n');

  console.log('  [3] BASELINE — active enrollment (expect rows, no 57014)');
  const pActive = await feedRead('parent feed  (active)', parentToken);
  const sActive = await feedRead('student feed (active)', studentToken);
  results.push(['parent feed, active', pActive], ['student feed, active', sActive]);

  const firstUpdateId = pActive.json?.[0]?.id ?? null;
  if (firstUpdateId) {
    const pt = await privateThreadRead('parent private thread (active)', parentToken, firstUpdateId);
    results.push(['parent private thread, active', pt]);
  } else {
    console.log('    (no class_updates visible — private-thread check skipped; post one to exercise it)');
  }

  if (!MUTATE) {
    console.log('\n  DRY RUN complete. Re-run with --mutate for the withdrawal half.');
  } else {
    console.log('\n  [4] WITHDRAW (by UPDATE — a transition, not an inserted row)');
    restored = false;
    await setStatus(target.enrollment.id, 'withdrawn');
    console.log(`    enrollment ${target.enrollment.id} -> withdrawn\n`);

    console.log('  [5] AFTER WITHDRAWAL (expect 0 rows, fast — NOT a timeout, NOT rows)');
    const pW = await feedRead('parent feed  (withdrawn)', parentToken);
    const sW = await feedRead('student feed (withdrawn)', studentToken);
    results.push(['parent feed, withdrawn', pW], ['student feed, withdrawn', sW]);
    if (firstUpdateId) {
      const ptW = await privateThreadRead('parent private thread (withdrawn)', parentToken, firstUpdateId);
      results.push(['parent private thread, withdrawn', ptW]);
      if (ptW.rows > 0) console.log('    *** FAIL: Decision 1b — withdrawn parent still reads their private thread');
    }
    if (pW.rows > 0) console.log('    *** FAIL: withdrawn parent still sees class updates — is the migration applied?');
    if (sW.rows > 0) console.log('    *** FAIL: withdrawn student still sees class updates');
    if (pW.timedOut || sW.timedOut) console.log('    *** FAIL: 57014 — the #105 risk has materialised on these policies');
  }
} catch (e) {
  console.error(`\n  ERROR: ${e.message}`);
  process.exitCode = 1;
} finally {
  if (!restored && target) {
    console.log('\n  [6] RESTORE');
    try {
      await setStatus(target.enrollment.id, 'active');
      const back = await rest(`enrollments?select=status&id=eq.${target.enrollment.id}`);
      console.log(`    enrollment ${target.enrollment.id} -> ${back.json?.[0]?.status} (verified)`);
    } catch (e) {
      console.error(`    *** RESTORE FAILED: ${e.message}`);
      console.error(`    *** RUN THIS BY HAND:`);
      console.error(`    update enrollments set status='active' where id='${target.enrollment.id}';`);
      process.exitCode = 1;
    }
  }

  if (results.length) {
    console.log('\n  ---- paste into class-update-and-home-feed.md, under the cloud check ----\n');
    console.log(`  Cloud check (${new Date().toISOString().slice(0, 10)}, staging ${REF}):`);
    for (const [label, r] of results) {
      const outcome = r.timedOut ? 'TIMEOUT 57014' : r.rows === null ? `HTTP ${r.status}` : `${r.rows} rows`;
      console.log(`  - ${label}: ${outcome}, ${r.ms}ms`);
    }
    console.log('  - enrollment restored to active: yes');
  }

  console.log(`
  ---- optional EXPLAIN, for Studio's SQL editor (needs the parent's user id) ----

  -- the addendum's "ideally": a recorded number for the added enrollments join
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<parent-user-id>","active_role":"parent","scope_type":"family","scope_id":"<family-id>"}';
  explain (analyze, buffers)
  select id, class_id, posted_by, body, homework, created_at
    from class_updates
   order by created_at desc
   limit 200;
`);
}
