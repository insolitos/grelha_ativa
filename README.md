# Grelha Ativa

Aplicação estática em português para preparar a planta da sala e acompanhar a participação. Sem contas, serviços externos, bibliotecas de interface ou processo de compilação.

## Utilização

1. Crie uma turma em **Gerir turmas**.
2. Adicione alunos ou importe um CSV com as colunas **Nome;Número**. Confirme se existe cabeçalho na pré-visualização. Linhas inválidas e números repetidos são apresentados antes da importação.
3. Marque as ausências e distribua os alunos. Pode selecionar um aluno e depois um lugar, arrastar, ou distribuir por número. Em **Configurar a sala**, altere filas, colunas, quadro e corredores.
4. Inicie uma nova aula. Toque num aluno para registar uma interação ou corrigir a presença. A vista **Lista** também inclui alunos sem lugar atribuído.
5. Use **Desfazer registo** ou **Ver todos** para corrigir as interações da aula em curso.
6. Termine a aula para abrir o relatório. O botão **Histórico e relatórios** permanece disponível e permite filtrar aulas, datas e alunos, e exportar CSV.

Por defeito, as dificuldades são acompanhadas separadamente da participação. A opção de as contar como participação é escolhida antes da aula e fica registada nessa sessão. A seleção de alunos considera apenas os presentes e não repete os elegíveis antes de completar uma ronda; pode privilegiar quem ainda não participou ou quem participou menos.

## Dados e cópias de segurança

- Os dados ficam exclusivamente no armazenamento local do navegador, sob a chave `grelhaAtiva.v2`. Não existe sincronização nem autenticação.
- Faça cópias regulares através de **Cópias de segurança → Descarregar cópia de segurança**. O JSON contém todas as turmas, plantas e aulas. Proteja-o como qualquer documento com dados de alunos.
- A restauração mostra um resumo e exige confirmação. Valida o ficheiro antes de substituir os dados e preserva os valores anteriores em `grelhaAtiva.v2.beforeRestore`.
- Cada gravação preserva a versão imediatamente anterior em `grelhaAtiva.v2.previous`. Esta é uma recuperação curta, não um substituto da cópia descarregada.
- Erros de leitura bloqueiam as gravações e apresentam opções de recuperação. O ficheiro de diagnóstico bruto destina-se a recuperação técnica; não é uma cópia normal para importação direta.
- Duas páginas abertas não podem sobrescrever silenciosamente os dados uma da outra: a página desatualizada pede recarregamento.
- O navegador tem limites de armazenamento. Se uma gravação falhar, a alteração não é aplicada e o estado anterior mantém-se. Para históricos muito extensos, uma evolução futura poderá usar IndexedDB.

### Compatibilidade com a versão anterior

A chave original `grelhaAtivaMultiClassState` é lida, mas nunca alterada. Turmas, alunos, lugares e contagens são migrados. As contagens acumuladas ficam numa sessão identificada como **Registos anteriores · data desconhecida**, porque a versão antiga não distinguia aulas nem guardava datas. A regra antiga que conta dificuldades como participação é preservada nesses registos. A versão anterior não guardava ausências; os alunos migrados começam marcados como presentes, devendo as presenças ser confirmadas antes da próxima aula.

Para restaurar os dados da v2 depois de uma reversão do código, volte à v2 e importe a cópia JSON. A versão antiga não lê as novas sessões.

## Publicação

Copie `index.html`, `styles.css`, `core.js` e `app.js` para a raiz do GitHub Pages existente. Mantenha o mesmo endereço e navegador para que a migração encontre os dados locais anteriores. Não é necessária qualquer chave ou configuração de servidor.

Antes de publicar, descarregue uma cópia dos dados no dispositivo utilizado e verifique a migração com uma cópia representativa. Os testes realizados usam exclusivamente dados fictícios.

## Desenvolvimento e verificação

Requer Node.js 22 ou superior apenas para executar os testes:

```sh
node --test tests/core.test.js
node --check core.js
node --check app.js
```

Para pré-visualizar:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Abra `http://127.0.0.1:8765`. As alterações são visíveis depois de recarregar.

- `core.js`: validação, migração, gravação, CSV, sessões e seleção de alunos.
- `app.js`: interface e ações. Dados introduzidos pelo utilizador são sempre inseridos como texto.
- `styles.css`: apresentação, vistas móvel/computador, impressão e movimento reduzido.
- `tests/core.test.js`: regressões de dados, importação e lógica de aulas.

## Entrega em três fases

1. **Fiabilidade:** armazenamento validado, recuperação, migração, CSV robusto e apresentação segura de nomes.
2. **Aulas:** sessões independentes, histórico, desfazer/corrigir, presenças e seleção sem repetições por ronda.
3. **Utilização:** preparação separada da aula, planta configurável, alternativa tátil/teclado, vista de lista, relatórios por aluno/período e atualização apenas do aluno afetado.

### Verificação realizada

28 testes automáticos, incluindo erros de armazenamento, conflitos entre separadores, migração, contagens, ausências, CSV e trocas de lugares. Verificação no navegador: criação de aluno com caracteres HTML tratados como texto, iniciar/registar/desfazer, dificuldade separada, recarregar e recuperar sessão, terminar e consultar relatório, iniciar nova aula com contadores a zero, restaurar uma turma fictícia de 24 alunos e inspecionar as vistas em computador e telemóvel. Sem erros de consola no fluxo verificado.

Não foi realizada uma auditoria formal de acessibilidade nem testes em dispositivos físicos iOS/Android. Não existem medições comparativas de desempenho.
