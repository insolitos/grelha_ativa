const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const time = '2026-11-11T09:00:00.000Z';
const later = '2026-11-11T10:00:00.000Z';
function fixture() {
  const state = C.emptyState(), c = state.classes[0];
  c.students = [{ id: 'a', name: 'Ana', number: '1', absent: false }, { id: 'b', name: 'Bruno', number: '2', absent: false }, { id: 'c', name: 'Carla', number: '3', absent: true }];
  return { state, c };
}
function memory(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), values };
}
function legacy() {
  return { activeClassId: 'class_1', classes: { class_1: { name: '7.º A', students: [{ id: 1, name: 'Ana', number: '1' }], classroomLayout: { 0: { id: 1, name: 'Ana', number: '1' } }, interactions: { 1: { question: 2, difficulty: 1 } }, isClassActive: true } } };
}
test('a new lesson starts empty and preserves the previous lesson', () => {
  const { state, c } = fixture(); const s = C.startSession(c, false, time);
  C.addEvent(c, 'a', 'question', time); C.endSession(c, later); const second = C.startSession(c, false, later);
  assert.equal(s.events.length, 1); assert.equal(second.events.length, 0); assert.equal(c.sessions.length, 2); C.validate(state);
});
test('reload roundtrip preserves an active lesson and its events', () => {
  const { state, c } = fixture(); C.startSession(c, false, time); C.addEvent(c, 'a', 'question', time);
  const storage = memory(); C.openStore(storage).save(state);
  const reloaded = C.openStore(storage).state; assert.deepEqual(reloaded, state); assert.equal(C.activeSession(reloaded.classes[0]).events.length, 1);
});
test('absence and difficulty are separate from participation by default', () => {
  const { c } = fixture(); const s = C.startSession(c, false, time);
  C.addEvent(c, 'a', 'difficulty', time); assert.equal(C.totals(s, 'a').participation, 0); assert.equal(C.totals(s).difficulty, 1);
  assert.throws(() => C.addEvent(c, 'c', 'question', time));
});
test('the optional difficulty rule belongs to each lesson', () => {
  const { c } = fixture(); const old = C.startSession(c, true, time); C.addEvent(c, 'a', 'difficulty', time);
  C.endSession(c, later); const next = C.startSession(c, false, later); C.addEvent(c, 'a', 'difficulty', later);
  assert.equal(C.totals(old).participation, 1); assert.equal(C.totals(next).participation, 0);
});
test('cannot start with no students or only absentees, or start twice', () => {
  const c = C.newClass('Test'); assert.throws(() => C.startSession(c));
  c.students = [{ id: 'x', name: 'X', number: '1', absent: true }]; assert.throws(() => C.startSession(c));
  c.students[0].absent = false; C.startSession(c); assert.throws(() => C.startSession(c));
});
test('undo removes only the last event; editing does not change earlier events', () => {
  const { c } = fixture(); const s = C.startSession(c, false, time);
  C.addEvent(c, 'a', 'question', time); C.addEvent(c, 'b', 'correct_answer', time); s.events.pop();
  assert.equal(C.totals(s).question, 1); assert.equal(C.totals(s).correct_answer, 0);
  s.events[0].type = 'helped_colleague'; assert.equal(C.totals(s).question, 0); assert.equal(C.totals(s).helped_colleague, 1);
});
test('historical rosters survive student renaming and deletion', () => {
  const { state, c } = fixture(); const s = C.startSession(c, false, time); C.addEvent(c, 'a', 'question', time); C.endSession(c, later);
  c.students[0].name = 'Changed'; c.students = []; assert.equal(s.roster[0].name, 'Ana'); C.validate(state);
});
test('migration preserves totals, legacy difficulty policy and no invented dates', () => {
  const migrated = C.migrate(legacy()), c = migrated.classes[0], s = c.sessions[0];
  assert.equal(c.layout[0], '1'); assert.equal(s.startedAt, null); assert.equal(s.legacy, true); assert.equal(c.activeSessionId, null);
  assert.equal(C.totals(s).participation, 3); assert.equal(C.totals(s).question, 2);
});
test('migration keeps original local storage untouched', () => {
  const raw = JSON.stringify(legacy()), storage = memory({ [C.LEGACY_KEY]: raw }); const store = C.openStore(storage);
  assert.equal(store.migrated, true); assert.equal(storage.getItem(C.KEY), null); store.save(store.state); assert.equal(storage.getItem(C.LEGACY_KEY), raw);
});
test('corrupt saved state blocks writes rather than resetting', () => {
  const storage = memory({ [C.KEY]: '{broken' }), store = C.openStore(storage);
  assert.ok(store.error); assert.equal(store.state, null); assert.throws(() => store.save(C.emptyState())); assert.equal(storage.getItem(C.KEY), '{broken');
});
test('wrong schema and invalid legacy data cannot silently reset', () => {
  for (const raw of ['null', '{}', '{"version":99}', '{"classes":[]}']) {
    const storage = memory({ [C.KEY]: raw }); assert.ok(C.openStore(storage).error); assert.equal(storage.getItem(C.KEY), raw);
  }
  const old = legacy(); old.classes.class_1.students = null; assert.throws(() => C.migrate(old));
});
test('previous version is preserved before save', () => {
  const { state } = fixture(), raw = JSON.stringify(state), storage = memory({ [C.KEY]: raw }), store = C.openStore(storage);
  const next = C.clone(state); next.classes[0].name = 'New'; store.save(next); assert.equal(storage.getItem(C.KEY + '.previous'), raw);
});
test('storage quota failure does not advance the stored state', () => {
  const { state } = fixture(), raw = JSON.stringify(state), storage = memory({ [C.KEY]: raw }), store = C.openStore(storage);
  storage.setItem = () => { throw new Error('QuotaExceeded'); }; const next = C.clone(state); next.classes[0].name = 'New';
  assert.throws(() => store.save(next)); assert.equal(storage.getItem(C.KEY), raw); assert.equal(store.state.classes[0].name, state.classes[0].name);
});
test('two tabs cannot overwrite one another', () => {
  const storage = memory(), first = C.openStore(storage), second = C.openStore(storage);
  first.save(first.state); assert.throws(() => second.save(second.state), /separador/);
  assert.throws(() => second.restore(second.state), /separador/);
});
test('restore validates first and preserves damaged raw data', () => {
  const storage = memory({ [C.KEY]: '{broken' }), store = C.openStore(storage);
  assert.throws(() => store.restore({ version: 2 })); assert.equal(storage.getItem(C.KEY), '{broken');
  store.restore(C.emptyState()); assert.equal(JSON.parse(storage.getItem(C.KEY + '.beforeRestore')).current, '{broken'); assert.equal(store.error, null);
});
test('backup decode roundtrips state and accepts legacy', () => {
  const { state } = fixture(); assert.deepEqual(C.decode(JSON.stringify({ format: 'grelha-ativa-backup', data: state })), state);
  assert.equal(C.decode(JSON.stringify(legacy())).version, 2); assert.throws(() => C.decode('{bad'));
});
test('CSV handles quoted separators, quotes, newlines, BOM and CRLF', () => {
  const text = '\uFEFFNome;Número\r\n"Silva; Ana";1\r\n"Bruno ""B""";2\r\n"Carla\nMaria";3';
  assert.deepEqual(C.parseCSV(text), [['Silva; Ana', '1'], ['Bruno "B"', '2'], ['Carla\nMaria', '3']]);
  assert.deepEqual(C.parseCSV('Nome,Número\n"Ana, Maria",1'), [['Ana, Maria', '1']]);
});
test('CSV can keep its first row without a header', () => { assert.deepEqual(C.parseCSV('Ana;1\nBruno;2', false), [['Ana', '1'], ['Bruno', '2']]); });
test('malformed quotes are rejected, not silently imported', () => {
  assert.throws(() => C.parseCSV('Nome;Número\n"Ana;1')); assert.throws(() => C.parseCSV('Nome;Número\n"Ana"x;1'));
});
test('CSV preview detects duplicate numbers across file and existing roster', () => {
  const rows = C.previewCSV('Nome;Número\nAna;01\nBruno;2\nCarla;02\nMissing;\nToo;many;columns', [{ number: '1' }]);
  assert.equal(rows.filter(p => !p.error).length, 1); assert.equal(rows[0].error, 'Número repetido.'); assert.equal(rows[2].error, 'Número repetido.');
});
test('CSV export escapes formula prefixes, quotes, separators and uses session date', () => {
  const { c } = fixture(); c.students[0].name = '=HYPERLINK("bad")'; const s = C.startSession(c, false, time);
  const csv = C.reportCSV(c, [s]); assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes(time)); assert.ok(csv.includes("'=HYPERLINK")); assert.ok(csv.includes('""bad""'));
  assert.equal(C.csvCell('A;B'), '"A;B"'); assert.equal(C.csvCell('  +sum(1)'), '"\'  +sum(1)"');
});
test('random selection excludes absentees and completes rounds without repeats', () => {
  const { c } = fixture(); C.startSession(c, false, time);
  const first = C.drawStudent(c, 'all', () => 0), second = C.drawStudent(c, 'all', () => 0), third = C.drawStudent(c, 'all', () => 0);
  assert.equal(first.id, 'a'); assert.equal(second.id, 'b'); assert.equal(third.id, 'a');
});
test('no-participation selection uses the lesson rule and reports exhausted eligibility', () => {
  const { c } = fixture(); C.startSession(c, false, time); C.addEvent(c, 'a', 'question', time); C.addEvent(c, 'b', 'difficulty', time);
  assert.equal(C.drawStudent(c, 'none', () => 0).id, 'b'); C.addEvent(c, 'b', 'question', time); assert.throws(() => C.drawStudent(c, 'none'), /Todos/);
});
test('least-participation draw still respects the current round', () => {
  const { c } = fixture(); C.startSession(c, false, time); C.addEvent(c, 'a', 'question', time);
  assert.equal(C.drawStudent(c, 'least', () => 0).id, 'b'); assert.equal(C.drawStudent(c, 'least', () => 0).id, 'a');
});
test('moving from seat zero swaps occupants and cannot duplicate students', () => {
  const { state, c } = fixture(); C.place(c, 'a', 0); C.place(c, 'b', 1); C.place(c, 'a', 1);
  assert.equal(c.layout[0], 'b'); assert.equal(c.layout[1], 'a'); C.validate(state);
  C.place(c, 'c', 1); assert.equal(c.layout[1], 'c'); assert.equal(Object.values(c.layout).includes('a'), false);
});
test('corridors and active lessons reject seat placement', () => {
  const { c } = fixture(); c.aisles = [2]; assert.throws(() => C.place(c, 'a', 2)); assert.throws(() => C.place(c, 'a', -1)); C.startSession(c, false, time); assert.throws(() => C.place(c, 'a', 0));
});
test('backup validation rejects invalid references, duplicate seats and unknown types', () => {
  const { state, c } = fixture(); c.layout = { 0: 'a', 1: 'a' }; assert.throws(() => C.validate(state));
  c.layout = {}; const s = C.startSession(c, false, time); C.addEvent(c, 'a', 'question', time); s.events[0].type = '__proto__'; assert.throws(() => C.validate(state));
});
test('backup validation rejects multiple open lessons and impossible dates', () => {
  const { state, c } = fixture(); const s = C.startSession(c, false, time); s.endedAt = '2020-01-01T00:00:00Z'; assert.throws(() => C.validate(state));
  s.endedAt = null; const extra = C.clone(s); extra.id = 'extra'; c.sessions.push(extra); assert.throws(() => C.validate(state));
});
