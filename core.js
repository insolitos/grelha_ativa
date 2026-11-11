/* Data model and import/export helpers. No DOM or network dependencies. */
(function (root) {
  'use strict';
  const VERSION = 2;
  const KEY = 'grelhaAtiva.v2';
  const LEGACY_KEY = 'grelhaAtivaMultiClassState';
  const TYPES = Object.freeze({
    question: { label: 'Fez uma pergunta', icon: '❓', participation: true },
    correct_answer: { label: 'Deu uma resposta correta', icon: '✓', participation: true },
    difficulty: { label: 'Mostrou dificuldade', icon: '◇', participation: false },
    helped_colleague: { label: 'Ajudou um colega', icon: '↔', participation: true }
  });
  const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const clone = value => JSON.parse(JSON.stringify(value));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const validText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
  const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const studentKey = value => String(value).trim().replace(/^0+(?=\d)/, '').toLocaleLowerCase('pt-PT');
  function newClass(name) {
    return { id: uid(), name: name.trim(), students: [], layout: {}, rows: 6, cols: 6, aisles: [], board: 'top', sessions: [], activeSessionId: null };
  }
  function emptyState() {
    const c = newClass('Minha Primeira Turma');
    return { version: VERSION, activeClassId: c.id, classes: [c] };
  }
  function validate(state) {
    assert(record(state) && state.version === VERSION && Array.isArray(state.classes) && state.classes.length > 0, 'Formato ou versão da cópia de segurança inválidos.');
    const ids = new Set();
    for (const c of state.classes) {
      assert(record(c) && validText(c.id) && !ids.has(c.id) && validText(c.name), 'Turma inválida ou repetida.'); ids.add(c.id);
      assert(Number.isInteger(c.rows) && c.rows >= 1 && c.rows <= 12 && Number.isInteger(c.cols) && c.cols >= 1 && c.cols <= 12, 'Dimensões da sala inválidas.');
      assert(Array.isArray(c.aisles) && new Set(c.aisles).size === c.aisles.length && c.aisles.every(n => Number.isInteger(n) && n >= 0 && n < c.rows * c.cols) && ['top', 'bottom'].includes(c.board), 'Planta da sala inválida.');
      assert(Array.isArray(c.students) && Array.isArray(c.sessions) && record(c.layout), 'Dados da turma incompletos.');
      const students = new Set(), numbers = new Set();
      for (const s of c.students) {
        assert(record(s) && validText(s.id) && !students.has(s.id) && validText(s.name) && validText(s.number) && !numbers.has(studentKey(s.number)) && typeof s.absent === 'boolean', 'Aluno inválido ou número repetido.');
        students.add(s.id); numbers.add(studentKey(s.number));
      }
      const seated = new Set();
      for (const [slot, id] of Object.entries(c.layout)) {
        assert(/^\d+$/.test(slot) && Number(slot) < c.rows * c.cols && !c.aisles.includes(Number(slot)) && students.has(id) && !seated.has(id), 'Lugar inválido ou aluno colocado duas vezes.'); seated.add(id);
      }
      const sessionIds = new Set();
      let activeCount = 0;
      for (const s of c.sessions) {
        assert(record(s) && validText(s.id) && !sessionIds.has(s.id) && typeof s.legacy === 'boolean', 'Aula inválida.'); sessionIds.add(s.id);
        assert((s.startedAt === null && s.legacy) || validDate(s.startedAt), 'Data de início inválida.');
        assert(s.endedAt === null || validDate(s.endedAt), 'Data de fim inválida.');
        assert(s.startedAt === null || s.endedAt === null || Date.parse(s.endedAt) >= Date.parse(s.startedAt), 'A aula termina antes de começar.');
        assert(Array.isArray(s.roster) && Array.isArray(s.events) && Array.isArray(s.drawn) && typeof s.includeDifficulty === 'boolean', 'Registos da aula inválidos.');
        const roster = new Set();
        for (const p of s.roster) {
          assert(record(p) && validText(p.id) && !roster.has(p.id) && validText(p.name) && validText(p.number) && typeof p.present === 'boolean', 'Presença inválida.'); roster.add(p.id);
        }
        const events = new Set();
        for (const e of s.events) {
          assert(record(e) && validText(e.id) && !events.has(e.id) && roster.has(e.studentId) && Object.hasOwn(TYPES, e.type) && Number.isSafeInteger(e.count) && e.count > 0 && e.count <= 1000000 && (validDate(e.at) || (s.legacy && e.at === null)), 'Interação inválida.'); events.add(e.id);
        }
        assert(new Set(s.drawn).size === s.drawn.length && s.drawn.every(id => roster.has(id)), 'Ronda de seleção inválida.');
        if (!s.legacy && s.endedAt === null) { activeCount++; assert(c.activeSessionId === s.id, 'Aula ativa inconsistente.'); }
      }
      assert(activeCount <= 1 && (c.activeSessionId === null || (sessionIds.has(c.activeSessionId) && activeCount === 1)), 'Referência de aula ativa inválida.');
    }
    assert(ids.has(state.activeClassId), 'Turma selecionada inexistente.');
    return state;
  }
  function migrate(old) {
    assert(record(old) && record(old.classes) && Object.keys(old.classes).length > 0, 'Os dados antigos não puderam ser reconhecidos.');
    const state = { version: VERSION, activeClassId: String(old.activeClassId), classes: [] };
    for (const [id, value] of Object.entries(old.classes)) {
      assert(record(value) && validText(value.name) && Array.isArray(value.students) && record(value.classroomLayout || {}) && record(value.interactions || {}), 'Os dados antigos estão incompletos.');
      const c = newClass(value.name); c.id = id;
      c.students = value.students.map(s => ({ id: String(s.id), name: s.name, number: String(s.number), absent: false }));
      for (const [slot, s] of Object.entries(value.classroomLayout || {})) if (s) c.layout[slot] = String(s.id);
      const session = { id: uid(), legacy: true, startedAt: null, endedAt: null, roster: c.students.map(s => ({ id: s.id, name: s.name, number: s.number, present: true })), events: [], drawn: [], includeDifficulty: true };
      for (const [sid, counts] of Object.entries(value.interactions || {})) {
        assert(record(counts), 'Contagens antigas inválidas.');
        for (const [type, count] of Object.entries(counts)) {
          assert(Object.hasOwn(TYPES, type) && Number.isSafeInteger(count) && count >= 0, 'Interação antiga desconhecida.');
          if (count) session.events.push({ id: uid(), studentId: sid, type, count, at: null });
        }
      }
      if (session.events.length || value.isClassActive) c.sessions.push(session);
      state.classes.push(c);
    }
    if (!state.classes.some(c => c.id === state.activeClassId)) state.activeClassId = state.classes[0].id;
    return validate(state);
  }
  function decode(text) {
    const parsed = JSON.parse(text);
    const value = parsed.format === 'grelha-ativa-backup' ? parsed.data : parsed;
    return value.version === VERSION ? validate(value) : migrate(value);
  }
  function openStore(storage) {
    let raw = null, state = null, error = null, migrated = false;
    try {
      raw = storage.getItem(KEY);
      const legacy = raw === null ? storage.getItem(LEGACY_KEY) : null;
      state = raw !== null ? validate(JSON.parse(raw)) : legacy !== null ? migrate(JSON.parse(legacy)) : emptyState();
      migrated = raw === null && legacy !== null;
    } catch (e) { error = e; }
    return {
      state, error, migrated,
      save(next) {
        assert(!error, 'Gravação bloqueada para preservar os dados originais.');
        validate(next);
        assert(storage.getItem(KEY) === raw, 'Os dados mudaram noutro separador. Exporte uma cópia desta sessão e recarregue antes de continuar.');
        const encoded = JSON.stringify(next);
        if (raw !== null) storage.setItem(KEY + '.previous', raw);
        storage.setItem(KEY, encoded); raw = encoded; state = next;
        this.state = next;
      },
      restore(next) {
        validate(next);
        const existing = storage.getItem(KEY);
        assert(existing === raw, 'Os dados mudaram noutro separador. Recarregue antes de restaurar.');
        const legacy = storage.getItem(LEGACY_KEY);
        if (existing !== null || legacy !== null) storage.setItem(KEY + '.beforeRestore', JSON.stringify({ current: existing, legacy }));
        const encoded = JSON.stringify(next);
        storage.setItem(KEY, encoded); raw = encoded; state = next; error = null;
        this.state = next; this.error = null;
      }
    };
  }
  function startSession(c, includeDifficulty = false, now = new Date().toISOString()) {
    assert(!c.activeSessionId, 'Esta turma já tem uma aula ativa.');
    assert(c.students.some(s => !s.absent), 'Adicione pelo menos um aluno presente antes de iniciar.');
    const s = { id: uid(), legacy: false, startedAt: now, endedAt: null, includeDifficulty, drawn: [], events: [], roster: c.students.map(p => ({ id: p.id, name: p.name, number: p.number, present: !p.absent })) };
    c.sessions.push(s); c.activeSessionId = s.id; return s;
  }
  function activeSession(c) { return c.sessions.find(s => s.id === c.activeSessionId); }
  function endSession(c, now = new Date().toISOString()) {
    const s = activeSession(c); assert(s, 'Não há uma aula ativa.'); s.endedAt = now; c.activeSessionId = null; return s;
  }
  function addEvent(c, studentId, type, now = new Date().toISOString()) {
    const s = activeSession(c);
    assert(s && s.roster.some(p => p.id === studentId && p.present) && Object.hasOwn(TYPES, type), 'Escolha um aluno presente e uma interação válida.');
    s.events.push({ id: uid(), studentId, type, count: 1, at: now });
  }
  function totals(s, studentId) {
    const result = { question: 0, correct_answer: 0, difficulty: 0, helped_colleague: 0, participation: 0, total: 0 };
    for (const e of s?.events || []) if (!studentId || e.studentId === studentId) {
      result[e.type] += e.count; result.total += e.count;
      if (TYPES[e.type].participation || s.includeDifficulty) result.participation += e.count;
    }
    return result;
  }
  function drawStudent(c, mode, random = Math.random) {
    const s = activeSession(c); assert(s, 'Inicie uma aula para selecionar um aluno.');
    const present = s.roster.filter(p => p.present); assert(present.length, 'Não há alunos presentes.');
    let pool = present;
    if (mode === 'none') {
      pool = pool.filter(p => totals(s, p.id).participation === 0);
      assert(pool.length, 'Todos os presentes já têm participação registada.');
    }
    let available = pool.filter(p => !s.drawn.includes(p.id));
    if (!available.length) { s.drawn = s.drawn.filter(id => !pool.some(p => p.id === id)); available = pool; }
    if (mode === 'least') {
      const min = Math.min(...available.map(p => totals(s, p.id).participation));
      available = available.filter(p => totals(s, p.id).participation === min);
    }
    const chosen = available[Math.floor(random() * available.length)]; s.drawn.push(chosen.id); return chosen;
  }
  function place(c, studentId, slot) {
    assert(!c.activeSessionId && c.students.some(p => p.id === studentId), 'A planta só pode ser alterada na preparação.');
    assert(Number.isInteger(slot) && slot >= 0 && slot < c.rows * c.cols && !c.aisles.includes(slot), 'Escolha um lugar disponível.');
    const origin = Object.keys(c.layout).find(k => c.layout[k] === studentId), displaced = c.layout[slot];
    if (origin !== undefined) delete c.layout[origin];
    c.layout[slot] = studentId;
    if (displaced && displaced !== studentId && origin !== undefined) c.layout[origin] = displaced;
  }
  function parseCSV(text, header = true, separator = 'auto') {
    text = text.replace(/^\uFEFF/, '');
    if (separator === 'auto') {
      let quoted = false, commas = 0, semicolons = 0;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') { if (quoted && text[i + 1] === '"') i++; else quoted = !quoted; }
        else if (!quoted) { if (ch === '\n' || ch === '\r') break; if (ch === ',') commas++; if (ch === ';') semicolons++; }
      }
      separator = semicolons >= commas ? ';' : ',';
    }
    const rows = []; let row = [], field = '', quoted = false, closed = false;
    for (let i = 0; i <= text.length; i++) {
      const ch = text[i];
      if (quoted) {
        assert(ch !== undefined, 'O CSV tem um campo com aspas por fechar.');
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } } else field += ch;
      } else if (ch === separator || ch === '\r' || ch === '\n' || ch === undefined) {
        row.push(field.trim()); field = ''; closed = false;
        if (ch !== separator) { if (row.some(Boolean)) rows.push(row); row = []; if (ch === '\r' && text[i + 1] === '\n') i++; }
      } else if (ch === '"' && !field && !closed) quoted = true;
      else { assert(!closed || /\s/.test(ch), 'Texto inesperado depois de um campo entre aspas.'); assert(ch !== '"', 'Aspas inválidas no CSV.'); if (!closed) field += ch; }
    }
    return header ? rows.slice(1) : rows;
  }
  function previewCSV(text, students, options = {}) {
    const numbers = new Set(students.map(s => studentKey(s.number)));
    return parseCSV(text, options.header !== false, options.separator || 'auto').map((row, index) => {
      const [name, number] = row; let error = '';
      if (row.length !== 2 || !validText(name) || !validText(number)) error = 'São necessárias duas colunas: nome e número (até 200 caracteres).';
      else if (numbers.has(studentKey(number))) error = 'Número repetido.';
      if (!error) numbers.add(studentKey(number));
      return { line: index + (options.header === false ? 1 : 2), name: name || '', number: number || '', error };
    });
  }
  function csvCell(value) {
    let s = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function reportCSV(c, sessions) {
    const rows = [['Turma', 'Início da aula', 'Fim da aula', 'Aluno', 'Número', 'Presente', 'Perguntas', 'Respostas corretas', 'Dificuldades', 'Entreajuda', 'Participações', 'Dificuldade conta como participação']];
    for (const s of sessions) for (const p of s.roster) {
      const t = totals(s, p.id);
      rows.push([c.name, s.startedAt || 'Registos anteriores — data desconhecida', s.endedAt || '', p.name, p.number, p.present ? 'Sim' : 'Não', t.question, t.correct_answer, t.difficulty, t.helped_colleague, t.participation, s.includeDifficulty ? 'Sim' : 'Não']);
    }
    return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
  }
  const api = { VERSION, KEY, LEGACY_KEY, TYPES, uid, clone, assert, studentKey, newClass, emptyState, validate, migrate, decode, openStore, startSession, activeSession, endSession, addEvent, totals, drawStudent, place, parseCSV, previewCSV, csvCell, reportCSV };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GrelhaCore = api;
})(globalThis);
