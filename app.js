(function () {
  'use strict';
  const C = GrelhaCore, $ = id => document.getElementById(id);
  let store, state, selectedStudent = null, aisleMode = false, view = matchMedia('(max-width: 600px)').matches ? 'list' : 'grid';
  let dialogOpener = null, toastTimer, selectedSessionId = null;
  try { store = C.openStore(localStorage); state = store.state; }
  catch (error) { store = { error }; state = null; }
  const current = () => state?.classes.find(c => c.id === state.activeClassId);
  const session = () => current() && C.activeSession(current());
  const dateTime = value => value ? new Date(value).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : 'Registos anteriores · data desconhecida';
  const shortTime = value => value ? new Date(value).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : 'Anterior';
  const localDay = value => { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key in node && !key.startsWith('aria')) node[key] = value;
      else node.setAttribute(key, value);
    }
    for (const child of children.flat()) if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    return node;
  }
  const button = (text, action, attrs = {}) => el('button', { type: 'button', onclick: action, ...attrs }, text);
  function toast(message, error = false) {
    if ($('dialog').open) {
      let notice = $('dialog-notice');
      if (!notice) { notice = el('p', { id: 'dialog-notice', role: 'status', class: 'dialog-notice' }); $('dialog-body').prepend(notice); }
      notice.textContent = message; notice.classList.toggle('error', error);
      return;
    }
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 9000 : 4500);
  }
  function banner(message) { $('storage-banner').textContent = message; $('storage-banner').hidden = false; }
  function mutate(action, render = true) {
    try {
      C.assert(state, 'Recupere os dados antes de continuar.');
      const next = C.clone(state), c = next.classes.find(c => c.id === next.activeClassId);
      const result = action(c, next);
      store.save(next); state = next; $('save-status').textContent = 'Guardado neste dispositivo';
      if (render) renderAll(); return { ok: true, result };
    } catch (e) {
      toast(e.message, true);
      if (/armazen|quota|storage|separador|grava|persist/i.test(e.message + e.name)) {
        $('save-status').textContent = 'Alteração não guardada';
        banner('A última alteração não foi aplicada: ' + e.message + ' Os dados anteriores foram preservados.');
      }
      return { ok: false };
    }
  }
  function closeDialog() { $('dialog').close(); }
  function modal(title, ...content) {
    if (!$('dialog').open) dialogOpener = document.activeElement;
    $('dialog-title').textContent = title; $('dialog-body').replaceChildren(...content.flat());
    if (!$('dialog').open) $('dialog').showModal();
    const focusable = $('dialog-body').querySelector('input:not([type=checkbox]), select, button, textarea');
    (focusable || $('close-dialog')).focus();
  }
  function confirmAction(title, message, action, label = 'Confirmar') {
    modal(title, el('p', {}, message), el('div', { class: 'dialog-actions' }, button('Cancelar', closeDialog), button(label, () => { closeDialog(); action(); }, { class: 'primary' })));
  }
  function download(content, name, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = el('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function backup() {
    if (!state) return exportRecovery();
    download(JSON.stringify({ format: 'grelha-ativa-backup', exportedAt: new Date().toISOString(), data: state }, null, 2), `grelha-ativa-${localDay(new Date())}.json`, 'application/json');
    toast('Cópia de segurança descarregada. Guarde-a num local seguro.');
  }
  function exportRecovery() {
    try {
      const raw = { current: localStorage.getItem(C.KEY), previous: localStorage.getItem(C.KEY + '.previous'), legacy: localStorage.getItem(C.LEGACY_KEY), beforeRestore: localStorage.getItem(C.KEY + '.beforeRestore') };
      download(JSON.stringify(raw, null, 2), 'grelha-ativa-recuperacao.json', 'application/json');
    } catch (e) { toast('Não foi possível ler o armazenamento: ' + e.message, true); }
  }
  function dataModal() {
    const items = [el('p', {}, 'Os nomes, presenças e registos ficam neste navegador. Limpar os dados do site pode apagá-los. Faça cópias regulares e proteja os ficheiros exportados.'), el('div', { class: 'stack' }, button('Descarregar cópia de segurança', backup, { class: 'primary', disabled: !state }), button('Restaurar de um ficheiro JSON', () => $('backup-file').click()), button('Recuperar a versão anterior guardada', recoverPrevious), button('Descarregar dados originais para recuperação', exportRecovery))];
    modal('Cópias de segurança e dados', items);
  }
  function restorePreview(next, source) {
    const classes = next.classes.length, students = next.classes.reduce((n, c) => n + c.students.length, 0), lessons = next.classes.reduce((n, c) => n + c.sessions.length, 0);
    confirmAction('Restaurar cópia de segurança', `${source}: ${classes} turma(s), ${students} aluno(s) e ${lessons} aula(s). A restauração substitui os dados atuais. Uma cópia do estado atual será preservada neste navegador; recomendamos também descarregá-la antes.`, () => {
      try { store.restore(next); state = next; selectedStudent = null; $('storage-banner').hidden = true; renderAll(); toast('Cópia restaurada com sucesso.'); }
      catch (e) { banner('Não foi possível restaurar. Os dados existentes foram preservados. ' + e.message); }
    }, 'Restaurar dados');
  }
  function recoverPrevious() {
    try {
      const raw = localStorage.getItem(C.KEY + '.previous'); C.assert(raw, 'Ainda não existe uma versão anterior guardada.');
      restorePreview(C.decode(raw), 'Última versão anterior');
    } catch (e) { toast(e.message, true); }
  }
  function renderAll() {
    const c = current();
    if (!c) {
      $('main').querySelectorAll('button, input, select').forEach(n => { n.disabled = true; });
      $('class-select').disabled = true; $('manage-class').disabled = true;
      banner('Não foi possível carregar os dados. A gravação está bloqueada para preservar os originais. Abra “Cópias de segurança” para recuperar. ' + (store.error?.message || ''));
      return;
    }
    $('main').querySelectorAll('button, input, select').forEach(n => { n.disabled = false; });
    $('class-select').disabled = false; $('manage-class').disabled = false;
    const s = session();
    document.body.classList.toggle('lesson-active', !!s);
    $('class-select').replaceChildren(...state.classes.map(c => el('option', { value: c.id, selected: c.id === state.activeClassId }, c.name)));
    $('class-title').textContent = c.name; $('student-total').textContent = c.students.length;
    $('mode-label').textContent = s ? 'A AULA ESTÁ A DECORRER' : 'PREPARAR A AULA';
    $('session-subtitle').textContent = s ? `Início: ${dateTime(s.startedAt)} · Os registos são guardados automaticamente.` : 'Organize os lugares e confirme as presenças.';
    $('session-toggle').textContent = s ? 'Terminar aula' : 'Iniciar nova aula'; $('session-toggle').disabled = !s && !c.students.some(p => !p.absent);
    $('session-badge').textContent = s ? '● Aula ativa' : 'Preparação';
    $('onboarding').hidden = c.students.length > 0; $('preparation-panel').hidden = !!s;
    $('rows').value = c.rows; $('cols').value = c.cols; $('board-position').value = c.board;
    if (selectedStudent && !c.students.some(p => p.id === selectedStudent)) selectedStudent = null;
    renderStudents(); renderRoom(); renderStats();
  }
  function renderStudents() {
    const c = current(), search = $('student-search').value.trim().toLocaleLowerCase('pt-PT');
    const list = c.students.filter(p => (p.name + ' ' + p.number).toLocaleLowerCase('pt-PT').includes(search));
    $('student-list').replaceChildren(...list.map(p => {
      const placed = Object.values(c.layout).includes(p.id);
      const pick = button('', () => { selectedStudent = p.id; aisleMode = false; renderStudents(); renderRoom(); }, { class: 'student-pick', 'aria-pressed': String(selectedStudent === p.id), draggable: true });
      pick.append(el('span', { class: 'avatar', 'aria-hidden': 'true' }, p.number), el('span', {}, el('strong', {}, p.name), el('small', {}, placed ? 'Na planta da sala' : 'Por colocar')));
      pick.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move'; });
      const absence = el('input', { type: 'checkbox', checked: p.absent, onchange: e => mutate(c => { c.students.find(s => s.id === p.id).absent = e.target.checked; }) });
      return el('li', { class: p.absent ? 'student absent' : 'student' }, pick, el('div', { class: 'student-tools' }, el('label', { class: 'checkbox-label' }, absence, 'Ausente'), button('Editar', () => studentModal(p.id), { 'aria-label': `Editar ${p.name}` })));
    }));
    if (!list.length) $('student-list').append(el('li', { class: 'empty-message' }, c.students.length ? 'Nenhum aluno encontrado.' : 'A lista está pronta para os seus alunos.'));
  }
  function roomCell(p, slot, s) {
    const c = current(), isAisle = c.aisles.includes(slot), t = C.totals(s, p?.id);
    const present = s ? s.roster.find(r => r.id === p?.id)?.present : p && !p.absent;
    const label = p ? `${p.name}, número ${p.number}${present ? '' : ', ausente'}${s ? `, ${t.participation} participações, ${t.difficulty} dificuldades` : ', selecionar lugar'}` : isAisle ? `Corredor, lugar ${slot + 1}` : `Lugar ${slot + 1} vazio`;
    const cell = button('', () => onCell(p, slot), { class: `seat ${p ? 'occupied' : 'empty'} ${isAisle ? 'aisle' : ''} ${p && !present ? 'absent' : ''} ${p && t.participation ? 'participated' : ''} ${p?.id === selectedStudent ? 'selected' : ''}`, 'aria-label': label, 'data-slot': String(slot), 'data-student': p?.id || '' });
    if (p) {
      cell.append(el('span', { class: 'seat-number' }, `N.º ${p.number}`), el('strong', { class: 'seat-name' }, p.name), el('span', { class: 'seat-meta' }, !present ? 'Ausente' : s ? `${t.participation ? '●' : '○'} ${t.participation} participações${t.difficulty ? ` · ◇ ${t.difficulty}` : ''}` : 'Toque para mover'));
      if (!s) { cell.draggable = true; cell.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move'; }); }
    } else cell.append(el('span', { class: 'empty-symbol', 'aria-hidden': 'true' }, isAisle ? '·' : '+'), el('span', { class: 'small' }, isAisle ? 'Corredor' : String(slot + 1)));
    cell.disabled = !!s && !p;
    return cell;
  }
  function renderRoom() {
    const c = current(), s = session(), room = $('classroom');
    const selected = c.students.find(p => p.id === selectedStudent);
    $('selection-notice').hidden = !selected && !aisleMode;
    $('selection-text').textContent = aisleMode ? 'Toque num lugar vazio para criar ou retirar um corredor.' : selected ? `${selected.name}: escolha o novo lugar.` : '';
    $('aisle-mode').setAttribute('aria-pressed', String(aisleMode));
    $('grid-view').setAttribute('aria-pressed', String(view === 'grid')); $('list-view').setAttribute('aria-pressed', String(view === 'list'));
    $('room-hint').textContent = s ? 'Toque num aluno para registar uma interação ou atualizar a presença.' : 'Selecione um aluno e depois o lugar. Toque novamente para editar.';
    room.classList.toggle('list-view', view === 'list'); room.style.setProperty('--cols', c.cols);
    const board = $('board'); board.hidden = view === 'list'; board.parentElement.classList.toggle('board-bottom', c.board === 'bottom');
    const nodes = [];
    if (view === 'list') {
      for (const p of [...c.students].sort((a, b) => a.number.localeCompare(b.number, 'pt-PT', { numeric: true }))) {
        const slot = Object.keys(c.layout).find(key => c.layout[key] === p.id);
        const cell = roomCell(p, slot === undefined ? -1 : Number(slot), s);
        if (!s) { const row = el('div', { class: 'list-seat-row' }, cell, button('Editar', () => studentModal(p.id))); nodes.push(row); }
        else nodes.push(cell);
      }
    } else {
      for (let i = 0; i < c.rows * c.cols; i++) nodes.push(roomCell(c.students.find(p => p.id === c.layout[i]), i, s));
      if (s) {
        const unplaced = c.students.filter(p => !Object.values(c.layout).includes(p.id));
        if (unplaced.length) { nodes.push(el('p', { class: 'unplaced-label' }, 'Presentes ou ausentes sem lugar atribuído')); for (const p of unplaced) nodes.push(roomCell(p, -1, s)); }
      }
    }
    room.replaceChildren(...nodes);
  }
  function onCell(p, slot) {
    if (session()) { if (p) interactionModal(p.id); return; }
    if (aisleMode && slot >= 0) {
      if (p) return toast('Mova o aluno antes de transformar este lugar num corredor.');
      mutate(c => { c.aisles = c.aisles.includes(slot) ? c.aisles.filter(n => n !== slot) : [...c.aisles, slot]; }); return;
    }
    if (selectedStudent && p?.id === selectedStudent) { studentModal(p.id); return; }
    if (selectedStudent && slot >= 0) { if (mutate(c => C.place(c, selectedStudent, slot), false).ok) { selectedStudent = null; renderAll(); } return; }
    if (p) { selectedStudent = p.id; renderStudents(); renderRoom(); }
    else toast('Selecione primeiro um aluno na lista.');
  }
  function renderStats() {
    const s = session(), totals = C.totals(s), present = s?.roster.filter(p => p.present) || [];
    const participants = present.filter(p => C.totals(s, p.id).participation > 0).length;
    $('participation-count').textContent = `${participants} / ${present.length}`;
    $('participation-progress').max = present.length || 1; $('participation-progress').value = participants;
    $('interaction-count').textContent = totals.total; $('difficulty-count').textContent = totals.difficulty;
    $('rule-note').textContent = s ? s.includeDifficulty ? 'Nesta aula, dificuldades também contam como participação.' : 'Dificuldades são acompanhadas separadamente da participação.' : 'Inicie uma aula para acompanhar a participação.';
    $('draw-button').disabled = !s; $('draw-mode').disabled = !s; $('undo-button').disabled = !s?.events.length; $('event-log').disabled = !s;
    const events = (s?.events || []).slice(-5).reverse();
    $('recent-events').replaceChildren(...events.map(e => el('li', {}, el('strong', {}, s.roster.find(p => p.id === e.studentId)?.name || ''), el('span', {}, `${C.TYPES[e.type].icon} ${C.TYPES[e.type].label}`), el('small', {}, shortTime(e.at)))));
    if (!events.length) $('recent-events').append(el('li', { class: 'empty-message' }, 'Os próximos registos aparecem aqui.'));
  }
  function refreshStudent(id) {
    const focused = document.activeElement, c = current(), s = session();
    for (const cell of [...$('classroom').querySelectorAll('[data-student]')]) if (cell.dataset.student === id) {
      const replacement = roomCell(c.students.find(p => p.id === id), Number(cell.dataset.slot), s);
      const restoreFocus = focused === cell || dialogOpener === cell;
      cell.replaceWith(replacement); if (restoreFocus) { dialogOpener = replacement; if (!$('dialog').open) replacement.focus(); }
    }
    renderStats();
  }
  function studentModal(id = null) {
    if (session()) return;
    const c = current(), p = c.students.find(p => p.id === id);
    const name = el('input', { required: true, maxLength: 200, value: p?.name || '', autocomplete: 'off' });
    const number = el('input', { required: true, maxLength: 200, value: p?.number || '', inputMode: 'numeric', autocomplete: 'off' });
    const form = el('form', { class: 'stack', onsubmit: e => {
      e.preventDefault(); const n = name.value.trim(), num = number.value.trim();
      const result = mutate(c => {
        C.assert(n && num, 'Preencha o nome e o número.');
        C.assert(!c.students.some(s => s.id !== id && C.studentKey(s.number) === C.studentKey(num)), 'Já existe um aluno com este número.');
        if (id) Object.assign(c.students.find(s => s.id === id), { name: n, number: num });
        else c.students.push({ id: C.uid(), name: n, number: num, absent: false });
      });
      if (result.ok) { closeDialog(); toast('Aluno guardado.'); }
    } }, el('label', {}, 'Nome', name), el('label', {}, 'Número', number), el('button', { type: 'submit', class: 'primary' }, p ? 'Guardar alterações' : 'Adicionar aluno'));
    const extra = [];
    if (p) {
      extra.push(button('Retirar da planta', () => { if (mutate(c => { for (const [slot, value] of Object.entries(c.layout)) if (value === id) delete c.layout[slot]; }).ok) { selectedStudent = null; closeDialog(); renderAll(); } }));
      extra.push(button('Remover da turma', () => confirmAction('Remover aluno', `Remover ${p.name} da lista atual? O histórico de aulas anteriores será preservado.`, () => mutate(c => { c.students = c.students.filter(p => p.id !== id); for (const [slot, value] of Object.entries(c.layout)) if (value === id) delete c.layout[slot]; }), 'Remover aluno'), { class: 'danger' }));
    }
    modal(p ? 'Editar aluno' : 'Adicionar aluno', form, el('div', { class: 'dialog-actions' }, extra));
  }
  function interactionModal(id) {
    const s = session(), p = s?.roster.find(p => p.id === id); if (!p) return;
    const actions = Object.entries(C.TYPES).map(([type, data]) => button(`${data.icon} ${data.label}`, () => {
      if (mutate(c => C.addEvent(c, id, type), false).ok) { closeDialog(); refreshStudent(id); toast(`${data.label}: ${p.name}`); }
    }, { class: 'interaction-choice', disabled: !p.present }));
    const presence = button(p.present ? 'Marcar como ausente' : 'Marcar como presente', () => {
      if (mutate(c => { C.activeSession(c).roster.find(p => p.id === id).present = !p.present; }, false).ok) { closeDialog(); refreshStudent(id); toast('Presença atualizada; os registos existentes foram preservados.'); }
    });
    modal(p.name, el('p', { class: 'muted' }, p.present ? 'Escolha a interação que observou.' : 'Aluno ausente. Marque a presença para registar interações.'), el('div', { class: 'stack' }, actions), el('hr'), presence);
  }
  function toggleSession() {
    if (session()) confirmAction('Terminar esta aula?', 'Os registos ficam guardados no histórico. A próxima aula começa com novos contadores.', () => {
      const result = mutate(c => C.endSession(c)); if (result.ok) { selectedSessionId = result.result.id; $('draw-result').textContent = 'Sem repetições até completar a ronda.'; historyModal(); }
    }, 'Terminar e ver relatório');
    else {
      const result = mutate(c => C.startSession(c, $('difficulty-rule').checked));
      if (result.ok) { selectedStudent = null; aisleMode = false; renderRoom(); $('draw-result').textContent = 'Sem repetições até completar a ronda.'; toast('Nova aula iniciada. Os registos anteriores estão no histórico.'); }
    }
  }
  function undo() {
    const s = session(), last = s?.events.at(-1); if (!last) return;
    if (mutate(c => C.activeSession(c).events.pop(), false).ok) { refreshStudent(last.studentId); toast('Último registo desfeito.'); }
  }
  function eventLog() {
    const s = session(); if (!s) return;
    const list = el('ol', { class: 'event-list' });
    for (const e of [...s.events].reverse()) {
      const name = s.roster.find(p => p.id === e.studentId)?.name;
      const select = el('select', { 'aria-label': `Tipo de interação de ${name} às ${shortTime(e.at)}` }, ...Object.entries(C.TYPES).map(([type, t]) => el('option', { value: type, selected: type === e.type }, t.label)));
      list.append(el('li', {}, el('strong', {}, name), el('small', {}, shortTime(e.at)), select, button('Guardar', () => { if (mutate(c => { C.activeSession(c).events.find(x => x.id === e.id).type = select.value; }, false).ok) { refreshStudent(e.studentId); toast('Registo corrigido.'); } }), button('Remover', () => confirmAction('Remover registo?', `${name}: ${C.TYPES[e.type].label}.`, () => { if (mutate(c => { const s = C.activeSession(c); s.events = s.events.filter(x => x.id !== e.id); }, false).ok) { refreshStudent(e.studentId); eventLog(); } }, 'Remover'))));
    }
    modal('Registos desta aula', list.children.length ? list : el('p', {}, 'Ainda não foram registadas interações.'));
  }
  function manageClasses() {
    const c = current(); if (!c) return;
    const name = el('input', { value: c.name, required: true, maxLength: 200 });
    const newName = el('input', { required: true, maxLength: 200, placeholder: 'Ex.: 7.º A · Ciências' });
    modal('Gerir turmas', el('form', { class: 'stack', onsubmit: e => { e.preventDefault(); if (mutate(c => { C.assert(name.value.trim(), 'Indique o nome.'); c.name = name.value.trim(); }).ok) closeDialog(); } }, el('label', {}, 'Nome da turma atual', name), el('button', { type: 'submit' }, 'Renomear')), el('hr'), el('form', { class: 'stack', onsubmit: e => { e.preventDefault(); if (mutate((c, state) => { C.assert(newName.value.trim(), 'Indique o nome.'); const created = C.newClass(newName.value); state.classes.push(created); state.activeClassId = created.id; }).ok) { selectedStudent = null; closeDialog(); renderAll(); } } }, el('label', {}, 'Criar nova turma', newName), el('button', { type: 'submit', class: 'primary' }, 'Criar turma')), el('hr'), button('Apagar esta turma e o respetivo histórico', () => confirmAction('Apagar turma?', `Esta ação apaga ${c.name} e todas as suas aulas. Descarregue uma cópia de segurança antes de continuar.`, () => mutate((c, state) => { C.assert(!c.activeSessionId, 'Termine a aula antes de apagar a turma.'); state.classes = state.classes.filter(x => x.id !== c.id); if (!state.classes.length) state.classes.push(C.newClass('Minha Primeira Turma')); state.activeClassId = state.classes[0].id; }), 'Apagar turma'), { class: 'danger', disabled: !!session() }));
  }
  function csvPreview(text) {
    const header = el('input', { type: 'checkbox', checked: true });
    const separator = el('select', {}, el('option', { value: 'auto' }, 'Detetar separador'), el('option', { value: ';' }, 'Ponto e vírgula'), el('option', { value: ',' }, 'Vírgula'));
    const preview = el('div', { class: 'csv-preview' }), summary = el('p', { role: 'status' }); let rows = [];
    const apply = button('Importar alunos válidos', () => {
      const result = mutate(c => { C.assert(!c.activeSessionId, 'Termine a aula antes de importar.'); const fresh = C.previewCSV(text, c.students, { header: header.checked, separator: separator.value }); let count = 0; for (const p of fresh.filter(p => !p.error)) { c.students.push({ id: C.uid(), name: p.name, number: p.number, absent: false }); count++; } return count; });
      if (result.ok) { closeDialog(); toast(`${result.result} aluno(s) importado(s).`); }
    }, { class: 'primary' });
    function refresh() {
      try {
        rows = C.previewCSV(text, current().students, { header: header.checked, separator: separator.value });
        const valid = rows.filter(p => !p.error).length; summary.textContent = `${valid} válidos · ${rows.length - valid} com erros (não serão importados). Pré-visualização dos primeiros 100 registos.`; apply.disabled = !valid;
        preview.replaceChildren(...rows.slice(0, 100).map(p => el('div', { class: p.error ? 'preview-error' : '' }, `${p.line}. ${p.name} · ${p.number}${p.error ? ' — ' + p.error : ''}`)));
      } catch (e) { rows = []; preview.replaceChildren(); summary.textContent = e.message; apply.disabled = true; }
    }
    header.addEventListener('change', refresh); separator.addEventListener('change', refresh);
    modal('Importar alunos', el('p', {}, 'Duas colunas, nesta ordem: Nome e Número. Confirme o cabeçalho e os dados antes de importar.'), el('label', { class: 'checkbox-label' }, header, 'A primeira linha contém os títulos das colunas'), el('label', {}, 'Separador', separator), summary, preview, apply); refresh();
  }
  function historyModal() {
    const c = current(); if (!c) return;
    const choose = el('select', { 'aria-label': 'Aula a consultar' }, el('option', { value: 'all' }, 'Todas as aulas do período'), ...[...c.sessions].reverse().map(s => el('option', { value: s.id, selected: s.id === selectedSessionId }, `${dateTime(s.startedAt)}${s.id === c.activeSessionId ? ' · em curso' : ''}`)));
    const from = el('input', { type: 'date', 'aria-label': 'Data inicial' }), to = el('input', { type: 'date', 'aria-label': 'Data final' });
    const student = el('select', { 'aria-label': 'Aluno do relatório' }, el('option', { value: '' }, 'Todos os alunos'));
    const roster = new Map(); for (const s of c.sessions) for (const p of s.roster) roster.set(p.id, p);
    for (const p of [...roster.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-PT'))) student.append(el('option', { value: p.id }, p.name));
    const content = el('div'), explanation = el('p', { class: 'small muted' }); let filtered = [];
    const exportButton = button('Exportar CSV', () => download(C.reportCSV(c, filtered.map(s => ({ ...s, roster: s.roster.filter(p => !student.value || p.id === student.value) }))), `relatorio-grelha-${localDay(new Date())}.csv`, 'text/csv;charset=utf-8'), { class: 'primary' });
    function refresh() {
      selectedSessionId = choose.value;
      const invalidRange = from.value && to.value && from.value > to.value;
      filtered = invalidRange ? [] : c.sessions.filter(s => (choose.value === 'all' || s.id === choose.value) && ((!from.value && !to.value) || (s.startedAt && (!from.value || localDay(s.startedAt) >= from.value) && (!to.value || localDay(s.startedAt) <= to.value))));
      exportButton.disabled = !filtered.length;
      explanation.textContent = invalidRange ? 'A data inicial deve ser anterior ou igual à data final.' : `${filtered.length} aula(s). Os registos antigos sem data só aparecem quando não há filtro de datas. Dificuldades seguem a regra definida em cada aula.`;
      const summary = new Map();
      for (const s of filtered) for (const p of s.roster) if (!student.value || student.value === p.id) {
        const prev = summary.get(p.id) || { name: p.name, number: p.number, lessons: 0, present: 0, participated: 0, question: 0, correct_answer: 0, difficulty: 0, helped_colleague: 0, participation: 0 };
        const t = C.totals(s, p.id); prev.lessons++; if (p.present) { prev.present++; if (t.participation) prev.participated++; }
        for (const key of ['question', 'correct_answer', 'difficulty', 'helped_colleague', 'participation']) prev[key] += t[key]; summary.set(p.id, prev);
      }
      const table = el('table', {}, el('caption', {}, 'Participação por aluno nas aulas selecionadas'), el('thead', {}, el('tr', {}, ...['Aluno', 'Presenças', 'Aulas com participação¹', 'Perguntas', 'Respostas', 'Dificuldades', 'Entreajuda'].map(t => el('th', { scope: 'col' }, t)))));
      const body = el('tbody');
      for (const p of [...summary.values()].sort((a, b) => a.number.localeCompare(b.number, 'pt-PT', { numeric: true }))) body.append(el('tr', {}, el('th', { scope: 'row' }, `${p.number} · ${p.name}`), ...[`${p.present}/${p.lessons}`, `${p.participated}/${p.present}`, p.question, p.correct_answer, p.difficulty, p.helped_colleague].map(v => el('td', {}, v))));
      table.append(body);
      const notes = [];
      if (filtered.length === 1) {
        const s = filtered[0], missing = s.roster.filter(p => p.present && C.totals(s, p.id).participation === 0 && (!student.value || student.value === p.id));
        notes.push(el('p', {}, s.roster.some(p => p.present) ? missing.length ? `Sem participação registada nesta aula: ${missing.map(p => p.name).join(', ')}.` : 'Todos os presentes da seleção têm participação registada.' : 'Não existem presenças registadas nesta aula.'));
      }
      content.replaceChildren(summary.size ? el('div', { class: 'table-scroll', tabIndex: 0, 'aria-label': 'Tabela de participação, deslocável horizontalmente' }, table) : el('p', { class: 'empty-message' }, 'Não existem registos para esta seleção.'), ...notes, el('p', { class: 'small muted' }, '¹ Considera apenas aulas em que o aluno está marcado como presente. Os totais de interações preservam todos os registos, mesmo após uma correção de presença.'));
    }
    for (const control of [choose, from, to, student]) control.addEventListener('change', refresh);
    modal('Histórico e relatórios', el('div', { class: 'report-filters' }, el('label', {}, 'Aula', choose), el('label', {}, 'Aluno', student), el('label', {}, 'De', from), el('label', {}, 'Até', to)), explanation, content, el('div', { class: 'dialog-actions' }, exportButton)); refresh();
  }
  $('close-dialog').addEventListener('click', closeDialog);
  $('dialog').addEventListener('close', () => {
    if ($('dialog').open) return;
    if (dialogOpener?.isConnected && dialogOpener.getClientRects().length && !dialogOpener.disabled) dialogOpener.focus();
    else if (!$('session-toggle').disabled) $('session-toggle').focus();
    else $('data-button').focus();
  });
  $('class-select').addEventListener('change', e => { selectedStudent = null; aisleMode = false; selectedSessionId = null; mutate((c, s) => { s.activeClassId = e.target.value; }); $('draw-result').textContent = 'Sem repetições até completar a ronda.'; });
  $('manage-class').addEventListener('click', manageClasses); $('data-button').addEventListener('click', dataModal);
  $('privacy-button').addEventListener('click', dataModal);
  $('add-student').addEventListener('click', () => studentModal()); $('first-student').addEventListener('click', () => studentModal());
  $('student-search').addEventListener('input', renderStudents);
  $('session-toggle').addEventListener('click', toggleSession); $('undo-button').addEventListener('click', undo);
  $('history-button').addEventListener('click', () => { selectedSessionId = session()?.id || null; historyModal(); }); $('event-log').addEventListener('click', eventLog);
  $('grid-view').addEventListener('click', () => { view = 'grid'; renderRoom(); }); $('list-view').addEventListener('click', () => { view = 'list'; aisleMode = false; renderRoom(); });
  $('cancel-selection').addEventListener('click', () => { selectedStudent = null; aisleMode = false; renderStudents(); renderRoom(); });
  $('aisle-mode').addEventListener('click', () => { aisleMode = !aisleMode; selectedStudent = null; view = 'grid'; renderRoom(); });
  $('room-form').addEventListener('submit', e => {
    e.preventDefault(); const rows = Number($('rows').value), cols = Number($('cols').value), board = $('board-position').value;
    const apply = () => mutate(c => {
      C.assert(!c.activeSessionId, 'Termine a aula antes de alterar a sala.');
      const layout = {}, aisles = [];
      for (const [slot, id] of Object.entries(c.layout)) { const row = Math.floor(Number(slot) / c.cols), col = Number(slot) % c.cols; if (row < rows && col < cols) layout[row * cols + col] = id; }
      for (const slot of c.aisles) { const row = Math.floor(slot / c.cols), col = slot % c.cols; if (row < rows && col < cols) aisles.push(row * cols + col); }
      Object.assign(c, { rows, cols, layout, aisles, board });
    });
    if (rows < current().rows || cols < current().cols) confirmAction('Reduzir a planta?', 'Alunos em lugares fora das novas dimensões voltam à lista de alunos por colocar. Os registos são preservados.', apply, 'Aplicar dimensões'); else apply();
  });
  $('auto-layout').addEventListener('click', () => confirmAction('Distribuir alunos por número?', 'A disposição atual será substituída. Os corredores são preservados. Se faltarem lugares, os restantes alunos ficam disponíveis na vista Lista.', () => mutate(c => {
    C.assert(!c.activeSessionId, 'Termine a aula antes de reorganizar.');
    const students = [...c.students].sort((a, b) => a.number.localeCompare(b.number, 'pt-PT', { numeric: true })); c.layout = {};
    for (let i = 0, j = 0; i < c.rows * c.cols && j < students.length; i++) if (!c.aisles.includes(i)) c.layout[i] = students[j++].id;
  }), 'Distribuir'));
  $('classroom').addEventListener('dragover', e => { if (!session()) e.preventDefault(); });
  $('classroom').addEventListener('drop', e => { e.preventDefault(); const target = e.target.closest('[data-slot]'); if (!session() && target && Number(target.dataset.slot) >= 0) mutate(c => C.place(c, e.dataTransfer.getData('text/plain'), Number(target.dataset.slot))); });
  $('draw-button').addEventListener('click', () => {
    const result = mutate(c => C.drawStudent(c, $('draw-mode').value), false);
    if (result.ok) {
      const p = result.result; $('draw-result').textContent = `É a vez de ${p.name}.`;
      $('classroom').querySelectorAll('.drawn').forEach(n => n.classList.remove('drawn'));
      const cell = [...$('classroom').querySelectorAll('[data-student]')].find(n => n.dataset.student === p.id);
      if (cell) { cell.classList.add('drawn'); cell.focus({ preventScroll: true }); cell.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
    }
  });
  $('import-students').addEventListener('click', () => $('csv-file').click());
  $('csv-file').addEventListener('change', async e => { const file = e.target.files[0]; e.target.value = ''; if (!file) return; try { C.assert(file.size <= 2 * 1024 * 1024, 'O CSV deve ter no máximo 2 MB.'); csvPreview(await file.text()); } catch (e) { toast(e.message, true); } });
  $('backup-file').addEventListener('change', async e => { const file = e.target.files[0]; e.target.value = ''; if (!file) return; try { C.assert(file.size <= 10 * 1024 * 1024, 'A cópia deve ter no máximo 10 MB.'); restorePreview(C.decode(await file.text()), file.name); } catch (e) { toast('O ficheiro não foi importado: ' + e.message, true); } });
  window.addEventListener('storage', e => { if (e.key === C.KEY || e.key === null) banner('Os dados foram alterados noutro separador. As gravações ficam protegidas contra sobreposição. Recarregue esta página para obter a versão mais recente.'); });
  renderAll();
  if (state && store.migrated) banner('Os dados da versão anterior foram recuperados. As contagens antigas estão no histórico, sem uma data inventada. Os originais foram preservados. Descarregue uma cópia de segurança.');
})();
