import { describe, it, expect } from 'vitest';
import {
  parseAdr,
  validateAdr,
  validateAll,
  findDuplicateIds,
  expectedIdForFilename,
  buildIndexBlock,
  renderReadme,
  START,
  END,
} from '../_adr-index.mjs';

// A well-formed ADR file body for parse tests.
const adrText = (
  id: string,
  title: string,
  { status = 'Closed', category = 'Data', date = '2026-07-23' } = {},
) => `# ${id}: ${title}\n**Status:** ${status} · **Category:** ${category} · **Date:** ${date} · **Deciders:** X\n\n## Context\nbody\n`;

// A valid parsed-ADR object for validate/build tests.
const adr = (over: Record<string, unknown> = {}) => ({
  file: '0030-teacher-roster.md',
  id: 'ADR-0030',
  title: 'Teacher roster read',
  status: 'Closed',
  category: 'Data',
  date: '2026-07-23',
  ...over,
});

describe('parseAdr — happy path', () => {
  it('extracts id, title, status, category, date from a well-formed ADR', () => {
    const p = parseAdr('0030-teacher-roster.md', adrText('ADR-0030', 'Teacher roster read'));
    expect(p).toMatchObject({
      file: '0030-teacher-roster.md',
      id: 'ADR-0030',
      title: 'Teacher roster read',
      status: 'Closed',
      category: 'Data',
      date: '2026-07-23',
    });
  });

  it('accepts a free-text / linked Status without mangling it (no over-rejection — the "bouncer")', () => {
    const p = parseAdr('0020-x.md', adrText('ADR-0020', 'Old trigger', { status: 'Superseded by [ADR-0021](0021-x.md)' }));
    expect(p.status).toBe('Superseded by [ADR-0021](0021-x.md)');
    expect(validateAdr({ ...p, file: '0020-x.md' })).toEqual([]); // valid: Status wording is free
  });

  it('leaves fields empty (no placeholders) when the header is missing them', () => {
    const p = parseAdr('0030-x.md', '# ADR-0030: Title only\n\n## Context\n');
    expect(p.status).toBe('');
    expect(p.category).toBe('');
    expect(p.date).toBe('');
  });

  it('returns id=null when there is no "# ADR-…" heading', () => {
    expect(parseAdr('0030-x.md', 'no heading here\n').id).toBeNull();
  });
});

describe('expectedIdForFilename — the naming scheme is ENFORCED, not just documented', () => {
  it('accepts a known legacy number (ADR-0030)', () => {
    expect(expectedIdForFilename('0030-teacher-roster.md')).toEqual({ expectedId: 'ADR-0030', kind: 'legacy' });
  });
  it('accepts the grandfathered in-flight numbers up to the 0038 cutover', () => {
    expect(expectedIdForFilename('0038-class-meetings-generated-by-trigger.md')).toEqual({ expectedId: 'ADR-0038', kind: 'legacy' });
  });
  it('accepts a date-based id (full stem)', () => {
    expect(expectedIdForFilename('2026-08-21-adr-identifier-scheme.md')).toEqual({
      expectedId: 'ADR-2026-08-21-adr-identifier-scheme',
      kind: 'dated',
    });
  });
  it('REJECTS a newly-minted sequential number past the cutover (0039-sneaky)', () => {
    expect(expectedIdForFilename('0039-sneaky.md').error).toMatch(/not a known legacy id/);
  });
  it('REJECTS a stray four-digit-prefixed file (1999-notes)', () => {
    expect(expectedIdForFilename('1999-notes.md').error).toMatch(/not a known legacy id/);
  });
  it('REJECTS a file that is not an ADR name at all (notes.md)', () => {
    expect(expectedIdForFilename('notes.md').error).toMatch(/not a valid ADR name/);
  });
  it('REJECTS a date-based id with an impossible date', () => {
    expect(expectedIdForFilename('2026-13-40-foo.md').error).toMatch(/invalid date/);
  });
});

describe('validateAdr — loud failures, never silent degrade', () => {
  it('passes a fully valid legacy ADR', () => {
    expect(validateAdr(adr())).toEqual([]);
  });
  it('passes a fully valid date-based ADR', () => {
    expect(
      validateAdr(adr({ file: '2026-08-21-adr-identifier-scheme.md', id: 'ADR-2026-08-21-adr-identifier-scheme', category: 'Infra/Process', date: '2026-08-21' })),
    ).toEqual([]);
  });

  it('flags an id that does not match its filename', () => {
    expect(validateAdr(adr({ file: '0030-teacher-roster.md', id: 'ADR-0031' })).join()).toMatch(/doesn't match the filename/);
  });
  it('flags a missing "# ADR-…" heading', () => {
    expect(validateAdr(adr({ id: null })).join()).toMatch(/missing "# ADR/);
  });
  it('flags a missing title', () => {
    expect(validateAdr(adr({ title: '' })).join()).toMatch(/missing title/);
  });
  it('flags a missing Status', () => {
    expect(validateAdr(adr({ status: '' })).join()).toMatch(/missing \*\*Status/);
  });
  it('flags a missing Date', () => {
    expect(validateAdr(adr({ date: '' })).join()).toMatch(/missing \*\*Date/);
  });
  it('flags a malformed Date', () => {
    expect(validateAdr(adr({ date: 'July 2026' })).join()).toMatch(/invalid \*\*Date/);
  });
  it('flags a missing Category', () => {
    expect(validateAdr(adr({ category: '' })).join()).toMatch(/missing \*\*Category/);
  });
  it('flags an unknown/typo’d Category (case-sensitive)', () => {
    expect(validateAdr(adr({ category: 'infra/process' })).join()).toMatch(/unknown \*\*Category/);
  });
  it('names the offending file in every error', () => {
    expect(validateAdr(adr({ file: '0030-teacher-roster.md', category: '' }))[0]).toMatch(/^0030-teacher-roster\.md:/);
  });
});

describe('findDuplicateIds — the collision this whole scheme exists to prevent', () => {
  it('passes when every id is unique', () => {
    expect(findDuplicateIds([adr({ file: '0030-a.md', id: 'ADR-0030' }), adr({ file: '0031-b.md', id: 'ADR-0031' })])).toEqual([]);
  });
  it('flags two files claiming the same id', () => {
    const errs = findDuplicateIds([adr({ file: '0030-alpha.md', id: 'ADR-0030' }), adr({ file: '0030-beta.md', id: 'ADR-0030' })]);
    expect(errs.join()).toMatch(/duplicate id "ADR-0030".*0030-alpha\.md.*0030-beta\.md/);
  });
});

describe('validateAll — aggregates per-file + duplicate errors', () => {
  it('is empty for a clean set', () => {
    expect(validateAll([adr({ file: '0030-a.md', id: 'ADR-0030' }), adr({ file: '0031-b.md', id: 'ADR-0031' })])).toEqual([]);
  });
  it('collects multiple problems at once', () => {
    const errs = validateAll([adr({ file: '0030-a.md', id: 'ADR-0030', category: 'bogus' }), adr({ file: '0031-b.md', id: 'ADR-0031', date: '' })]);
    expect(errs.length).toBeGreaterThanOrEqual(2);
  });
});

describe('buildIndexBlock — deterministic, byte-stable output', () => {
  const set = [
    adr({ file: '0031-b.md', id: 'ADR-0031', title: 'Later', date: '2026-07-24' }),
    adr({ file: '0030-a.md', id: 'ADR-0030', title: 'Earlier', date: '2026-07-23' }),
  ];

  it('wraps the table between the markers with a decision count', () => {
    const block = buildIndexBlock(set);
    expect(block.startsWith(START)).toBe(true);
    expect(block.endsWith(END)).toBe(true);
    expect(block).toMatch(/2 decisions/);
  });

  it('sorts within a category by date then id (Earlier before Later)', () => {
    const block = buildIndexBlock(set);
    expect(block.indexOf('Earlier')).toBeLessThan(block.indexOf('Later'));
  });

  it('is idempotent — same input yields byte-identical output', () => {
    expect(buildIndexBlock(set)).toBe(buildIndexBlock(set));
  });

  it('escapes pipe characters in titles so the table cannot break', () => {
    expect(buildIndexBlock([adr({ title: 'a | b' })])).toMatch(/a \\\| b/);
  });
});

describe('renderReadme — fail-closed on missing markers (the blocker)', () => {
  const readme = `# ADRs\n\n## Index\n\n${START}\n\nOLD CONTENT\n\n${END}\n\n## Footer\n`;
  const block = `${START}\n\nNEW CONTENT\n\n${END}`;

  it('splices the new block between the markers and leaves surrounding prose intact', () => {
    const { readme: out, error } = renderReadme(readme, block);
    expect(error).toBeUndefined();
    expect(out).toContain('NEW CONTENT');
    expect(out).not.toContain('OLD CONTENT');
    expect(out).toContain('# ADRs');
    expect(out).toContain('## Footer');
  });

  it('is idempotent — rendering twice is byte-identical', () => {
    const once = renderReadme(readme, block).readme!;
    const twice = renderReadme(once, block).readme!;
    expect(twice).toBe(once);
  });

  it('returns a NAMED error when the markers are missing (never a silent no-op)', () => {
    const { readme: out, error } = renderReadme('# ADRs\n\n## Index\n\njust prose, no markers\n', block);
    expect(out).toBeUndefined();
    expect(error).toMatch(/ADR-INDEX markers/);
  });

  it('returns an error when only one marker is present', () => {
    expect(renderReadme(`# ADRs\n${START}\nno end marker\n`, block).error).toMatch(/ADR-INDEX markers/);
  });

  it('fails closed on INVERTED markers (END before START) — the narrowed fail-open (thread 1)', () => {
    // both markers present, but out of order: a regex .replace() would no-op and pass; slicing must error.
    const inverted = `# ADRs\n\n## Index\n\n${END}\n\nstuff\n\n${START}\n\n## Footer\n`;
    const { readme: out, error } = renderReadme(inverted, block);
    expect(out).toBeUndefined();
    expect(error).toMatch(/out-of-order/);
  });

  it('inserts a title containing `$&` LITERALLY, without corrupting the README (thread 2)', () => {
    // buildIndexBlock is the real source of `block`; a `$&` in a title must not expand as a replace pattern.
    const dollarBlock = buildIndexBlock([adr({ title: 'Cost $& savings review' })]);
    const { readme: out, error } = renderReadme(readme, dollarBlock);
    expect(error).toBeUndefined();
    expect(out).toContain('Cost $& savings review'); // literal, not expanded
    expect(out!.match(new RegExp(START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))!.length).toBe(1); // marker not duplicated
  });
});

describe('validateAdr — date-agreement (thread 3: immutable authoring date is enforced)', () => {
  it('passes when a dated ADR’s Date field matches the date in its id', () => {
    expect(validateAdr(adr({ file: '2026-08-21-x.md', id: 'ADR-2026-08-21-x', category: 'Infra/Process', date: '2026-08-21' }))).toEqual([]);
  });
  it('flags a dated ADR whose Date field disagrees with the date in its id', () => {
    expect(
      validateAdr(adr({ file: '2026-08-21-x.md', id: 'ADR-2026-08-21-x', category: 'Infra/Process', date: '2026-09-01' })).join(),
    ).toMatch(/must match the date in the id/);
  });
});

describe('isValidYmd tightening + slug-format errors', () => {
  it('rejects an impossible calendar date (2026-02-31) in the Date field', () => {
    expect(validateAdr(adr({ date: '2026-02-31' })).join()).toMatch(/invalid \*\*Date/);
  });
  it('rejects an impossible date in a dated filename', () => {
    expect(expectedIdForFilename('2026-02-31-foo.md').error).toMatch(/invalid date/);
  });
  it('accepts a leap-day (2028-02-29)', () => {
    expect(expectedIdForFilename('2028-02-29-foo.md')).toEqual({ expectedId: 'ADR-2028-02-29-foo', kind: 'dated' });
  });
  it('gives a slug-format error (not "not a legacy id") for an uppercase slug on a dated file', () => {
    expect(expectedIdForFilename('2026-09-02-Foo.md').error).toMatch(/lowercase kebab-case/);
  });
});
