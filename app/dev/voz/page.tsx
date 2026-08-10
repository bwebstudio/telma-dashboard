import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Talking to Telma without a telephone.
 *
 * The public "talk to agent" page on ElevenLabs cannot test this product, and
 * the reason is structural rather than a setting somebody forgot. Tools whose
 * parameters are marked as dynamic variables are validated before a conversation
 * starts, and `clinic_id` only exists after the conversation initiation webhook
 * has run. On that page the webhook never runs at all, which the tunnel's
 * request log settled: not one request from ElevenLabs, ever. Hence the error,
 * and hence this page.
 *
 * What it does is what the telephone does, in the same order: ask
 * /api/voice/init what this clinic's Telma should be told, then hand the answer
 * to the widget as overrides and dynamic variables. Same prompt, same opening
 * line, same voice, same `clinic_id`, and therefore the same tools hitting the
 * same diary. What it does not cover is the phone network itself: 8kHz audio,
 * transfers, and a real caller id.
 *
 * Development only. It answers as any clinic you name, which is exactly the
 * thing the rest of the system is built to make impossible.
 */

export const dynamic = 'force-dynamic'

interface Clinic {
  id: string
  name: string
  assigned_phone: string | null
  status: string
  timezone: string
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ clinic?: string }>
}) {
  if (process.env.NODE_ENV === 'production') notFound()

  const { clinic: wanted } = await searchParams
  const admin = createAdminClient()
  const { data } = await admin
    .from('clinics')
    .select('id, name, assigned_phone, status, timezone')
    .order('created_at')
  const clinics = (data ?? []) as Clinic[]
  const clinic = clinics.find((c) => c.id === wanted) ?? clinics[0]

  const agentId = process.env.ELEVENLABS_AGENT_ID?.trim()
  const init = clinic ? await initFor(clinic.id) : null

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-ink">Hablar con Telma</h1>
      <p className="mt-2 text-base text-ink-mute">
        Lo mismo que hará el teléfono, sin teléfono. El prompt, el saludo, la voz y el{' '}
        <code>clinic_id</code> salen de <code>/api/voice/init</code>, igual que en una llamada real.
      </p>

      <nav className="mt-6 flex flex-wrap gap-2">
        {clinics.map((c) => (
          <a
            key={c.id}
            href={`/dev/voz?clinic=${c.id}`}
            className={`rounded-card border px-4 py-2 text-sm ${
              c.id === clinic?.id ? 'border-ink bg-surface-sunken text-ink' : 'border-line text-ink-mute'
            }`}
          >
            {c.name}
          </a>
        ))}
      </nav>

      {!agentId && <Problem>Falta ELEVENLABS_AGENT_ID en .env.local.</Problem>}
      {!clinic && <Problem>No hay ninguna clínica en la base de datos.</Problem>}
      {clinic && !init && (
        <Problem>
          /api/voice/init no ha sabido responder para esta clínica. Sin eso, hablar con ella no
          probaría nada: la llamada correría con el prompt de emergencia.
        </Problem>
      )}

      {agentId && init && (
        <>
          <dl className="mt-8 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <Row k="clínica" v={`${clinic!.name} (${clinic!.status}, ${clinic!.timezone})`} />
            <Row k="número" v={clinic!.assigned_phone ?? 'sin asignar'} />
            <Row k="clinic_id" v={init.dynamic_variables.clinic_id} />
            <Row k="idioma" v={init.conversation_config_override.agent.language} />
            <Row k="voz" v={init.conversation_config_override.tts?.voice_id ?? 'la del idioma'} />
            <Row k="prompt" v={`${init.conversation_config_override.agent.prompt.prompt.length} caracteres, versión ${init.dynamic_variables.prompt_version}`} />
          </dl>

          <p className="mt-6 rounded-card border border-line bg-surface-sunken p-4 text-sm text-ink-soft">
            Abre el micrófono y pídele cita. Consulta la agenda de verdad y lo que quede te aparece
            en el panel.
          </p>

          {/* The widget is given exactly what the initiation webhook would have
              given it. Passing anything else here would make this page a test of
              this page rather than of the product. */}
          <div className="mt-8">
            <elevenlabs-convai
              agent-id={agentId}
              variant="expanded"
              dynamic-variables={JSON.stringify(init.dynamic_variables)}
              override-prompt={init.conversation_config_override.agent.prompt.prompt}
              override-first-message={init.conversation_config_override.agent.first_message}
              override-language={init.conversation_config_override.agent.language}
            />
          </div>
          <script src="https://unpkg.com/@elevenlabs/convai-widget-embed" async type="text/javascript" />
        </>
      )}
    </main>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="label-caps text-ink-mute">{k}</dt>
      <dd className="text-ink [font-family:ui-monospace,SFMono-Regular,Menlo,monospace]">{v}</dd>
    </>
  )
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-6 rounded-card border border-warn/40 bg-warn/5 p-4 text-sm text-warn">
      {children}
    </p>
  )
}

interface Init {
  conversation_config_override: {
    agent: { prompt: { prompt: string }; first_message: string; language: string }
    tts?: { voice_id?: string }
  }
  dynamic_variables: Record<string, string>
}

/**
 * Asks our own endpoint, over HTTP, on purpose.
 *
 * Importing the builder directly would be faster and would test less: this way
 * a mistake in the route, in the middleware, or in how the clinic is found by
 * number shows up here rather than only once somebody rings.
 */
async function initFor(clinicId: string): Promise<Init | null> {
  const h = await headers()
  const host = h.get('host')
  if (!host) return null
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'

  const admin = createAdminClient()
  const { data } = await admin
    .from('clinics')
    .select('assigned_phone')
    .eq('id', clinicId)
    .maybeSingle()
  const phone = (data as { assigned_phone: string | null } | null)?.assigned_phone

  const res = await fetch(`${proto}://${host}/api/voice/init`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.TELMA_VOICE_INIT_TOKEN
        ? { Authorization: `Bearer ${process.env.TELMA_VOICE_INIT_TOKEN}` }
        : {}),
    },
    // With a number, this takes the same path a real call takes. Without one,
    // it falls through to TELMA_VOICE_INIT_TEST_CLINIC, which is the only reason
    // that variable exists.
    body: JSON.stringify(phone ? { called_number: phone } : {}),
    cache: 'no-store',
  })
  if (!res.ok) return null
  return (await res.json()) as Init
}

// React 19 moved the JSX namespace under the react module, so a custom element
// is declared here rather than on the global one.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'elevenlabs-convai': {
        'agent-id': string
        variant?: string
        'dynamic-variables'?: string
        'override-prompt'?: string
        'override-first-message'?: string
        'override-language'?: string
        'override-voice-id'?: string
      }
    }
  }
}
