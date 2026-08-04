# Telma · Painel de gestão

Aplicação de gestão da Telma (Telma Atende), com três painéis no mesmo código e
no mesmo login. Quem entra vê **só os painéis que lhe pertencem**, e quem tem
mais do que um troca entre eles por um seletor sempre no mesmo sítio.

| Painel | Para quem | O que é | Tabelas |
|---|---|---|---|
| **Clínica** | O dono ou a receção de uma clínica cliente | O dia da própria clínica: marcações, horários, chamadas | `appointments`, `calls`, `availability_slots`, ... |
| **Clientes** | Só `info@bwebstudio.com` | Operação das clínicas que já pagam: planos, minutos, configuração técnica | `clinics`, `usage`, `activity_log` |
| **Comercial** (CRM) | `info@bwebstudio.com` e os comerciais (Domingos, Sonia, ...) | Funil de vendas: clínicas que ainda não são clientes | `crm_prospects`, `crm_activities`, `crm_contacts`, `crm_reps` |

Um prospeto **nunca** é um cliente. São tabelas diferentes, consultas diferentes
e painéis diferentes; a única ligação entre os dois é a conversão explícita
descrita mais abaixo.

### Quem chega a quê

Há três papéis em `users.role`, e é essa coluna — mais nada — que decide o
acesso. A tabela vive em [`lib/access.ts`](lib/access.ts):

| `role` | Painéis | Quem |
|---|---|---|
| `interno` | Clientes, Comercial (+ visita a um painel de clínica) | `info@bwebstudio.com`, e mais ninguém |
| `comercial` | Comercial | Domingos, Sonia |
| `clinica` | Clínica (a sua) | Cada cliente |

Um comercial nunca chega à operação de clientes: não vê minutos, nem números
atribuídos, nem a configuração de voz de ninguém. E o RLS do CRM continua a
mostrar-lhe só os prospetos dele mais os sem dono do seu país.

Quem bate a uma porta que não é sua é reencaminhado para a sua própria, sem
mensagem de erro: não há ecrã "sem permissão", há o painel certo.

### Como o admin vê o painel de uma clínica

Esta é a única forma, e começa sempre numa clínica com nome:
**Clientes > Clínicas > (abrir a ficha) > "Ver o painel desta clínica"**.

A partir daí o painel da clínica abre com uma barra âmbar no topo — *"Está a ver
o painel de X · só leitura"* — e o seletor de painéis passa a mostrar essa
clínica como terceiro separador, para que uma visita aberta nunca passe
despercebida. **Sair desta vista** devolve à ficha.

A visita é **só de leitura**, de propósito. Confirmar uma marcação ou mexer nos
horários é a resposta da clínica ao paciente dela; feito por outra pessoa, é um
paciente mandado para uma porta fechada. Os *server actions* recusam qualquer
escrita que não venha do utilizador da própria clínica, e cada consulta do
painel filtra por `clinic_id` explicitamente — não fica só à espera do RLS.

Stack: Next.js 15 (App Router) + TypeScript + Tailwind + Supabase (auth, Postgres,
Row Level Security e realtime) + PWA. Coerente com a landing da Telma (mesma
paleta e tipografia).

## Começar

```bash
npm install
cp .env.example .env.local   # preencher com os dados do Supabase
npm run dev                  # http://localhost:3000
```

`npm run build` e `npm run lint` correm sem erros.

## Variáveis de ambiente

Ver [.env.example](.env.example):

| Variável | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço, só no servidor. Usada pelos webhooks |
| `TELMA_WEBHOOK_TOKEN` | Segredo partilhado que o sistema de voz envia nos webhooks |

## Base de dados

Esquema em [`supabase/migrations`](supabase/migrations).

### Operação (clientes)

- **clinics**: nome, morada, telefone, email, plano, addon de WhatsApp, estado,
  `minute_limit` e configuração técnica (número atribuído, agente, voz).
  **São os clientes reais.** Nada do CRM escreve aqui sem confirmação humana.
- **users**: ligados ao Supabase Auth, com `role` (interno | clinica | comercial),
  `clinic_id` (só para `clinica`) e `locale` (idioma da interface do utilizador).
- **availability_slots**: os horários que a clínica autoriza a Telma a oferecer.
  Cada linha é uma hora concreta num dia da semana, com capacidade. É o mecanismo
  central: a Telma só oferece estes horários.
- **appointments**: as pré-marcações que a Telma deixa (estado pendente,
  confirmada, rejeitada ou copiada).
- **calls**: registo de cada chamada (resultado, resumo, gravação).
- **slot_locks**: bloqueio temporário de uma hora durante uma chamada, expira aos
  3 minutos. Evita marcações duplicadas em chamadas simultâneas.
- **usage**: consumo mensal por clínica (chamadas e minutos). Os planos são
  medidos em **minutos de conversa**, que é como a Telma custa e como a landing
  os vende; o número de chamadas fica como leitura humana, não como limite.
- **blocked_days**, **activity_log**: dias bloqueados e registo de eventos.

### CRM comercial (funil de vendas)

Todas com o prefixo `crm_`, para que nunca se confundam com a operação:

- **crm_reps**: os comerciais. Chave igual ao `users.id`, portanto **não há
  segundo sistema de login**. Campos: `full_name`, `email`, `country` (PT | ES),
  `territory` (texto livre), `role` (admin | comercial) e `active`. O idioma
  preferido vive em `users.locale`, para haver uma só fonte de verdade.
- **crm_prospects**: as clínicas em fase de venda. `name`, `specialty`
  (dental | aesthetic | other), `country`, `zone`, `address`, `phone`,
  `website`, `origin` (cold | referral) com `origin_note` livre
  ("Mónica, Colgate"), `rep_id` (pode ser `null` = sem dono), `stage`,
  `next_action_text`, `next_action_at`, `last_activity_at` e os campos de
  conversão. `phone_digits` é uma coluna gerada (só dígitos) usada para detetar
  duplicados independentemente de como o número foi escrito.
- **crm_contacts**: as pessoas dentro da clínica (a médica, a recepcionista),
  com `role` (doctor | reception | other) e notas próprias.
- **crm_activities**: **o coração da app.** Uma linha por interação:
  `type` (call | whatsapp | email | visit | note), `result`, `note` (o texto tal
  como o comercial o escreveu), `next_action_at` / `next_action_text` e
  `client_ref`. O `client_ref` é gerado no telemóvel e tem índice único: é o que
  torna inofensiva a repetição de envios da fila offline.

Índices: `crm_activities(prospect_id, created_at desc)` e
`crm_prospects(rep_id, next_action_at)`, porque a consulta mais frequente da app
é "o que tenho de fazer hoje".

**`stage` nunca se escreve à mão.** Um trigger (`crm_apply_activity`) recalcula
`stage`, `next_action_at` e `last_activity_at` a partir da última atividade
registada, para o comercial não ter de atualizar a mesma coisa em dois sítios.
Uma atividade que chega atrasada (fila offline a esvaziar depois de já ter sido
gravada uma mais recente) é guardada mas não faz o estado andar para trás.

**Chaves neutras, etiquetas traduzidas.** Os enums guardam-se em inglês
(`no_answer`, `busy`, `interested`, ...) e só a etiqueta visível é traduzida.
Para exactamente a mesma linha, o Domingos lê "Não atende" e a Sonia lê
"No contesta".

### Row Level Security

- Um utilizador `clinica` só lê e escreve as linhas da sua `clinic_id`.
- Um `comercial` lê e escreve os prospetos com `rep_id = auth.uid()` e os que
  têm `rep_id is null` **no seu país**. Os prospetos de um colega são
  invisíveis. `crm_contacts` e `crm_activities` herdam essa visibilidade
  (`crm_can_see_prospect`). Atividades são um registo append-only: um comercial
  assina as suas e não reescreve o histórico.
- O `interno` acede a tudo, incluindo reatribuir prospetos entre comerciais.
- Exceção deliberada: `crm_find_duplicates()` corre como `security definer` e
  devolve o mínimo (nome, zona, telefone e de quem é) mesmo para linhas que o
  RLS esconderia. Sem isto, dois comerciais podiam trabalhar a mesma clínica
  durante semanas sem saber.
- Os webhooks de voz usam a chave de serviço, que ignora o RLS.

### Aplicar as migrações

Com a CLI do Supabase (recomendado):

```bash
supabase db push          # aplica supabase/migrations em ordem
supabase db execute --file supabase/seed.sql   # opcional: dados de demonstração
```

Ou manualmente, no SQL Editor do Supabase, **por esta ordem**:
`0001_init.sql`, `0002_rls.sql`, `0003_functions.sql`, `0004_crm_role.sql`,
`0005_crm.sql`, `0006_crm_rls.sql`, `0007_crm_stage_no_regress.sql`,
`0007_crm_veterinary.sql`, `0008_crm_geo.sql`, `0009_minute_limits.sql`,
`0010_one_admin.sql`.

> O `0004` está sozinho de propósito: o Postgres recusa usar um valor de enum
> recém-adicionado na mesma transação em que foi criado. Se colar tudo de uma
> vez num só bloco, falha.

### Criar o administrador

Há um só: `info@bwebstudio.com`. É a conta que abre os dois painéis internos e a
única que pode entrar no painel de uma clínica.

1. No Supabase Dashboard, **Authentication > Users > Add user**, com o email
   `info@bwebstudio.com` (marque email como confirmado).
2. Copie o `id` do utilizador criado.
3. No SQL Editor:

   ```sql
   insert into public.users (id, email, full_name, role, locale)
   values ('COLE-AQUI-O-ID', 'info@bwebstudio.com', 'Bweb Studio', 'interno', 'pt');
   ```

4. Entre em `/login`. Cai em **Clientes**, com **Comercial** ao lado no seletor.

A migração `0010_one_admin.sql` fecha a porta pelo outro lado: garante o papel
desta conta, despromove a `comercial` qualquer outro `interno` que também seja
comercial, avisa no log sobre internos inesperados que restem, e recusa correr
se ficasse a base sem nenhum administrador.

### Dar de alta um comercial novo

No painel, **Comercial > Equipa > Novo comercial**. O formulário cria numa só
ação a conta no Supabase Auth, a linha em `users` com `role = 'comercial'` e a
linha em `crm_reps` (país, território, idioma). O comercial entra em `/login`
com esses dados e cai directamente no seu **Hoje**.

Para desativar alguém que saiu, **Desativar** na mesma página: mantém o
histórico e os prospetos, apenas fecha o acesso ao CRM.

#### Porque é que o Domingos não é admin

Ele dirige a equipa e também anda na rua a ligar, e durante algum tempo isso
fez-se com `role = 'interno'`. Mas esse papel não é uma patente, é uma chave:
abre a operação dos clientes que já pagam — minutos, números atribuídos,
configuração de voz de cada clínica — e mostra todos os prospetos de todos os
países. Nada disso é preciso para vender.

Por isso o Domingos e a Sonia são `comercial`, e o **Hoje** deles é o deles. A
gestão da equipa (**Comercial > Equipa**: criar acessos, desativar, reatribuir
prospetos) fica em `info@bwebstudio.com`. Se um dia fizer falta um comercial que
veja a equipa toda **sem** ver a operação de clientes, o sítio para o fazer é a
coluna `crm_reps.role` (que já tem `admin`) e a função `crm_is_admin()` no RLS —
e não `users.role`.

O idioma da interface segue o `users.locale` do utilizador que entrou, sem
selector obrigatório. Quem quiser mudar no momento tem o botão de idioma na
barra lateral, que grava um cookie e passa a mandar naquele browser.

### Dar de alta uma clínica cliente

No painel interno, **Clínicas > Nova clínica**. O formulário cria, num só passo:
a clínica, o primeiro utilizador da clínica (com palavra-passe provisória) e os
horários por defeito (segunda a sexta, 9h às 13h e 14h às 18h). O utilizador da
clínica entra depois em `/login` e cai no painel da sua clínica.

### Converter um prospeto em cliente

Quando um prospeto fica em **Fechado**, a ficha mostra a ação
**Converter em cliente**. Nunca é automático:

- O **interno** abre `/clinicas/nova?prospect=<id>` já preenchido com nome,
  telefone e zona. Falta o que o comercial não tem: plano contratado, horários e
  número de Twilio. Ao gravar, o prospeto passa a apontar para o cliente criado
  (`converted_clinic_id`), sem se misturar com ele.
- O **comercial** só pode **pedir a alta**. Fica `conversion_requested_at`
  marcado e o pedido aparece na ficha para a equipa interna terminar.

## A secção Comercial, ecrã a ecrã

Desenhada para uma mão, de pé, na rua, entre visitas. Se uma ação precisasse de
mais de dois toques, o ecrã estava errado.

| Rota | O que faz |
|---|---|
| `/crm/hoje` | Ecrã inicial do comercial. Clínicas com próxima ação para hoje ou atrasadas, por ordem de hora. Separador **Sem data** para as activas que ficariam no limbo. |
| `/crm/prospetos` | O funil. Cartões no telemóvel, tabela densa no computador. Procura, filtros e exportação. |
| `/crm/prospetos/novo` | Clínica nova. Só o nome é obrigatório. Inclui colar-e-repartir e aviso de duplicados. |
| `/crm/prospetos/[id]` | Ficha: cabeçalho com telefone e WhatsApp, contactos com notas próprias, histórico em fio tipo conversa e **Registar chamada** sempre fixo. |
| `/crm/equipa` | Só interno. Resumo por comercial (activas, atrasadas, fechadas este mês), reatribuição e gestão de acessos. |

### Registar uma interação

O fluxo mais usado de toda a app, em `components/crm/LogSheet.tsx`:

1. Dez resultados em pastilhas, dois por linha, todos visíveis sem scroll num
   telemóvel normal. Um toque escolhe.
2. Um `textarea` normal para a nota — é o que faz o teclado do iOS e do Android
   oferecer ditado por voz. Nada aqui interfere com isso.
3. Próxima ação em quatro atalhos (**Daqui a 2h**, **Amanhã 9h**, **Amanhã 14h**,
   **Escolher**). O selector de data completo é a exceção, não o caminho normal.
4. **Guardar**, fixo em baixo, com 56px de altura. Nunca sai do ecrã.

Sem nota e sem próxima ação, registar uma chamada são dois toques: resultado e
guardar.

### Colar e repartir campos

`lib/crm/parse.ts` recebe um bloco de texto como os que chegam por WhatsApp
("Clínica X, Dra. Fulana, Rua das Flores 12, 912 345 678") e sugere nome,
telefone, morada, zona, especialidade e contacto. Não tenta acertar sempre:
tenta poupar teclado. Tudo aparece em campos normais e editáveis antes de gravar,
e o que não conseguiu encaixar fica guardado como primeira nota da ficha em vez
de se perder.

### Evitar sobreposição entre comerciais

Ao escrever nome ou telefone no formulário de clínica nova, a app pergunta ao
Postgres (`crm_find_duplicates`) se aquilo já existe — no funil **ou** entre os
clientes reais — e mostra a quem está atribuída antes de deixar criar duplicado.
Continua a ser possível criar ("Criar na mesma"), a app avisa, não decide.

### Funcionamento com rede fraca

Os comerciais estão na rua, não sempre com sinal. Cada interação registada é
escrita primeiro em `localStorage` (`lib/crm/queue.ts`) e só sai da fila quando o
servidor confirma. A fila é reenviada ao abrir um ecrã, quando o browser avisa
que voltou a haver rede, e a cada 30 segundos. O `client_ref` com índice único
garante que reenviar dez vezes a mesma nota a grava uma só vez. O contador de
pendentes aparece ao lado do indicador de tempo real.

### Realtime

`components/crm/CrmLive.tsx` subscreve `crm_prospects` e `crm_activities`. Se o
admin reatribuir uma clínica ou outro comercial registar uma chamada partilhada,
o **Hoje** e o histórico actualizam sem recarregar.

### Fusos horários

O servidor da Vercel corre em UTC, o Domingos está em Lisboa e a Sonia em Madrid.
Uma nota que diz "ligar às 14h30" tem de ler 14h30 no telemóvel, por isso todas
as horas são formatadas no fuso do país a que a clínica pertence
(`lib/crm/time.ts`), no servidor. O "hoje" do **Hoje** também acaba à meia-noite
do país do comercial, não à do servidor.

### Exportar para Excel

Botão **Exportar Excel** na lista: gera um `.xlsx` com `exceljs` no servidor
(`/api/crm/export`), com exactamente os filtros que estão no URL. O RLS aplica-se
também aqui, portanto um comercial nunca consegue exportar o funil de um colega.

## Idiomas

Todo o texto de interface vive em ficheiros tipados, um por idioma:
[`content/pt.ts`](content/pt.ts), [`content/es.ts`](content/es.ts),
[`content/en.ts`](content/en.ts), com a forma definida em
[`content/types.ts`](content/types.ts).

Para acrescentar um idioma (por exemplo `fr`):

1. Copie `content/pt.ts` para `content/fr.ts` e traduza os valores.
2. Registe-o em [`content/index.ts`](content/index.ts) (`dictionaries`, `locales`
   e `localeNames`).
3. Se o idioma trouxer um país novo, acrescente o fuso em
   `TZ_BY_COUNTRY` (`lib/crm/time.ts`) e o indicativo em `DIAL_CODE`
   (`lib/crm/phone.ts`).

Nenhum componente precisa de ser tocado: o TypeScript indica exactamente que
chaves faltam. **O que os comerciais escrevem nunca é traduzido** — nomes de
clínicas, nomes de contactos e notas de atividade guardam-se e mostram-se tal e
qual foram redigidos.

## PWA (instalar no telemóvel)

- Manifesto em [`app/manifest.ts`](app/manifest.ts), servido em
  `/manifest.webmanifest`.
- Service worker básico em [`public/sw.js`](public/sw.js): guarda em cache a
  casca (tipos de letra, ícones, assets de build) e **nunca** páginas, porque
  são todas dados pessoais e um "Hoje" de ontem seria pior do que nenhum. As
  navegações sem rede caem num aviso simples.
- Ícones em `public/icons`, gerados por
  [`scripts/generate-icons.mjs`](scripts/generate-icons.mjs)
  (`node scripts/generate-icons.mjs`) a partir das cores da marca, sem
  dependências de imagem.

Para instalar: abrir o painel no telemóvel e **Adicionar ao ecrã principal**
(Safari) ou **Instalar aplicação** (Chrome).

## Modo demo

Sem Supabase configurado (ou com `NEXT_PUBLIC_DEMO=1`), o painel corre com dados
de exemplo em memória e uma barra para trocar entre **Clínica**, **Interno** e
**Comercial**. O modo demo imita o RLS do CRM: como Domingos não vê os prospetos
da Sonia. Serve para navegar tudo antes de haver base de dados; nada é gravado.

## API interna (webhooks do sistema de voz)

Ambos os endpoints exigem o cabeçalho `Authorization: Bearer $TELMA_WEBHOOK_TOKEN`.

### Consultar disponibilidade

Durante a chamada, o agente de voz pergunta que horas pode oferecer.

```http
GET /api/availability?clinic_id=UUID&date=2026-08-03
Authorization: Bearer <TELMA_WEBHOOK_TOKEN>
```

Resposta:

```json
{
  "clinic_id": "UUID",
  "date": "2026-08-03",
  "slots": [
    { "slot_start": "2026-08-03T09:00:00+00:00", "slot_end": "10:00:00", "remaining": 1 },
    { "slot_start": "2026-08-03T10:00:00+00:00", "slot_end": "11:00:00", "remaining": 1 }
  ]
}
```

### Reservar (bloquear) uma hora

Quando o agente propõe uma hora concreta, bloqueia-a durante 3 minutos para que
duas chamadas simultâneas não reservem o mesmo lugar.

```http
POST /api/availability
Authorization: Bearer <TELMA_WEBHOOK_TOKEN>
Content-Type: application/json

{ "clinic_id": "UUID", "slot_start": "2026-08-03T10:00:00Z", "call_ref": "voice-call-123" }
```

Resposta `200`:

```json
{ "ok": true, "hold": { "id": "…", "expires_at": "…" }, "expires_in_seconds": 180 }
```

Se a hora já foi ocupada por outra chamada, devolve `409 { "error": "slot_unavailable" }`.

### Registar o resultado da chamada

No fim de cada chamada, o sistema de voz envia o resultado. Este endpoint, num só
passo: regista a chamada, cria a pré-marcação (se houve marcação), atualiza o
consumo do mês e liberta o bloqueio da hora.

```http
POST /api/webhook/call
Authorization: Bearer <TELMA_WEBHOOK_TOKEN>
Content-Type: application/json

{
  "clinic_id": "UUID",
  "from_phone": "+351912345678",
  "duration_seconds": 95,
  "result": "marcacao",
  "summary": "A Telma marcou uma limpeza para a Ana.",
  "recording_url": "https://…/rec.mp3",
  "external_ref": "voice-call-123",
  "call_ref": "voice-call-123",
  "appointment": {
    "patient_name": "Ana Martins",
    "patient_phone": "+351912345678",
    "reason": "Limpeza",
    "scheduled_at": "2026-08-03T10:00:00Z",
    "origin": "telefone"
  }
}
```

`result` é um de `marcacao | transferida | informacao | nao_resolvida`. O campo
`appointment` é opcional (só quando houve marcação).

Resposta `200`:

```json
{ "ok": true, "call_id": "…", "appointment_id": "…" }
```

## Desenho

Mesma paleta e tipografia da landing: base creme, tinta escura, acento terracota
`#A94A27` e verde pino para as superfícies destacadas. Títulos em Clash Display,
corpo em General Sans (self hosted).

Os três painéis são mobile first e partilham a mesma armação
([`components/Shell.tsx`](components/Shell.tsx)):

- Até `lg` (1024px) — telemóvel e tablet — barra superior fixa e barra de
  separadores em baixo, com o conteúdo a ocupar a largura toda. Num iPad em
  retrato uma barra lateral de 16rem comia um terço do ecrã para mostrar quatro
  links que cabem em baixo.
- A partir de `lg`, barra lateral com os mesmos links, o seletor de painéis, a
  conta, o idioma e a saída.
- O seletor de painéis só aparece a quem tem mais do que um. Um comercial não vê
  seletor nenhum, porque não há para onde ir.
- Zero tabelas largas no telemóvel: **Clínicas** e **Consumo** empilham em
  cartões e a tabela densa só aparece a partir de `md`.

Regras de toque no CRM, porque o contexto é a rua e não uma mesa:

- Ações principais com no mínimo 48px de altura (as de gravar têm 56px) e
  encostadas ao fundo do ecrã, na zona do polegar.
- Filtros e formulários longos ficam dentro de `<details>` nativos, para não
  competirem com a lista pelo espaço.
- Contraste AA com os tokens da marca e nada de cinzas claros: as notas leem-se
  ao sol. Os atrasos destacam-se em âmbar quente (`warn`), não em vermelho
  agressivo. O zoom continua permitido.

## Deploy na Vercel

1. Faça push do repositório.
2. Na Vercel, importe o projeto e defina a **Root Directory**:
   - repositório só do painel (`telma-dashboard`): deixe **vazia**, o `package.json`
     já está na raiz;
   - monorepo (`telmaatende`): defina `dashboard`.
3. Em **Environment Variables**, defina as quatro variáveis do `.env.example`.
   O ficheiro `.env.local` não vai para o Git, por isso estas têm de ser
   preenchidas na Vercel à mão.
4. Aplique as migrações no Supabase (ver acima), incluindo as três do CRM.
5. Deploy. O `middleware.ts` protege as rotas e reencaminha para `/login`.

`npm run build` e `npm run lint` correm sem erros, e o projeto está pronto para
`vercel deploy`.

Depois do deploy, configure o sistema de voz para chamar os dois endpoints acima
com o `TELMA_WEBHOOK_TOKEN`.
