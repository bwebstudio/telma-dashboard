# Telma · Painel de gestão

Aplicação de gestão da Telma (Telma Atende), com dois tipos de utilizador no
mesmo código:

- **Clínica**: o dono ou a receção de uma clínica cliente. Vê apenas os seus dados.
- **Interno**: a equipa da Bweb Studio. Vê e gere todas as clínicas.

Stack: Next.js 15 (App Router) + TypeScript + Tailwind + Supabase (auth, Postgres,
Row Level Security e realtime). Coerente com a landing da Telma (mesma paleta e
tipografia).

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

Esquema em [`supabase/migrations`](supabase/migrations):

- **clinics**: nome, morada, telefone, email, plano, addon de WhatsApp, estado,
  limite de chamadas e configuração técnica (número atribuído, agente, voz).
- **users**: ligados ao Supabase Auth, com `role` (interno | clinica) e `clinic_id`.
- **availability_slots**: os horários que a clínica autoriza a Telma a oferecer.
  Cada linha é uma hora concreta num dia da semana, com capacidade. É o mecanismo
  central: a Telma só oferece estes horários.
- **appointments**: as pré-marcações que a Telma deixa (estado pendente,
  confirmada, rejeitada ou copiada).
- **calls**: registo de cada chamada (resultado, resumo, gravação).
- **slot_locks**: bloqueio temporário de uma hora durante uma chamada, expira aos
  3 minutos. Evita marcações duplicadas em chamadas simultâneas.
- **usage**: consumo mensal por clínica (chamadas e minutos).
- **blocked_days**, **activity_log**: dias bloqueados e registo de eventos.

Row Level Security: um utilizador `clinica` só lê e escreve as linhas da sua
`clinic_id`; o `interno` acede a tudo. Os webhooks usam a chave de serviço, que
ignora o RLS.

### Aplicar as migrações

Com a CLI do Supabase (recomendado):

```bash
supabase db push          # aplica supabase/migrations em ordem
supabase db execute --file supabase/seed.sql   # opcional: dados de demonstração
```

Ou manualmente: cole o conteúdo de `0001_init.sql`, `0002_rls.sql` e
`0003_functions.sql` (por esta ordem) no SQL Editor do Supabase e execute.

### Criar o primeiro utilizador interno

1. No Supabase Dashboard, **Authentication > Users > Add user**, defina email e
   palavra-passe (marque email como confirmado).
2. Copie o `id` do utilizador criado.
3. No SQL Editor:

   ```sql
   insert into public.users (id, email, full_name, role)
   values ('COLE-AQUI-O-ID', 'equipa@bwebstudio.com', 'Equipa Bweb', 'interno');
   ```

4. Entre em `/login`. Como é interno, cai no painel de clínicas.

### Dar de alta uma clínica

No painel interno, **Clínicas > Nova clínica**. O formulário cria, num só passo:
a clínica, o primeiro utilizador da clínica (com palavra-passe provisória) e os
horários por defeito (segunda a sexta, 9h às 13h e 14h às 18h). O utilizador da
clínica entra depois em `/login` e cai no painel da sua clínica.

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
corpo em General Sans (self hosted). Painel de clínica mobile first, com barra de
navegação inferior e áreas de toque amplas; painel interno pensado para desktop.

## Deploy na Vercel

1. Faça push do repositório.
2. Na Vercel, importe o projeto e defina a **Root Directory** como `dashboard`.
3. Em **Environment Variables**, defina as quatro variáveis do `.env.example`.
4. Deploy. O `middleware.ts` protege as rotas e reencaminha para `/login`.

Depois do deploy, configure o sistema de voz para chamar os dois endpoints acima
com o `TELMA_WEBHOOK_TOKEN`.
