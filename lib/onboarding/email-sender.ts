import { copyFor } from './copy'
import type { ForwardType } from '../forwarding'
import { DEFAULT_ONBOARDING_LOCALE, type OnboardingLocale } from './locale'

/**
 * The one email a new clinic gets.
 *
 * It carries a temporary password, which is the reason it is written carefully
 * rather than generated from a template service. Provider is Resend if the key
 * is there; otherwise it prints to the server log, which is what makes the
 * whole sign-up demonstrable end to end without an email account existing.
 *
 * The log fallback prints the password. That is correct in development and
 * would be a leak in production, so it refuses to print outside development and
 * says so instead.
 */

export interface WelcomeEmail {
  clinicName: string
  email: string
  password: string
  /**
   * What they just contracted, for the summary that opens the email.
   *
   * The first message used to lead with "the number Telma answers" and a
   * telephone number. For a clinic that kept its own, that is a number it has
   * never seen, presented as if it were theirs, above the one that is. What
   * somebody wants to see straight after paying is what they bought: the
   * plan, the cycle, the amount and when it is charged again.
   */
  summary?: {
    planName: string
    cycle: 'monthly' | 'annual'
    lines: Array<{ label: string; amount: number }>
    subtotal: number
    taxPercentage: number | null
    taxAmount: number
    total: number
    currency: string
  }
  /**
   * E.164, as it will be dialled, or null while there is not one yet.
   *
   * Null is the ordinary case on the day of the sign-up. Portuguese numbers
   * are ordered through Twilio support and take days, so the email that
   * confirms the payment cannot name the line. It used to name one anyway:
   * the placeholder the provisioner invents to keep the rest of the system
   * working, printed under "the number Telma answers", in the first message
   * a paying clinic receives.
   */
  phoneNumber: string | null
  /**
   * True when the clinic kept its own number, so the one above is the number
   * it has to forward to. Not "a placeholder while porting completes", which
   * is what this used to say and what the email used to announce: nobody
   * ports anything here, and telling a clinic to wait for a portability that
   * is not happening is how it ends up waiting instead of forwarding.
   */
  temporaryNumber: boolean
  /** Which calls they chose to send over, from step 3. Decides which codes
   *  the email prints. */
  forwardType?: ForwardType
  /** The clinic's own public number, when it kept it. Named beside ours so
   *  the reader can tell which of the two numbers on the page is theirs. */
  ownNumber?: string | null
  dashboardUrl: string
  /** The language the sign-up was filled in. The clinic reads this email in
   *  the language it just spent six steps typing in, not in ours. */
  locale: OnboardingLocale
  /**
   * True when the clinic exists but the first payment has not landed yet. The
   * panel works, the line does not, and the email has to say which. Promising
   * "a Telma já atende" to somebody who abandoned checkout is the one thing
   * this email must never do.
   */
  pendingPayment: boolean
}

export interface EmailResult {
  sent: boolean
  /** 'resend' | 'log' | 'suppressed'. Written to the activity log so the team
   *  can tell "the client never got it" from "we never sent it". */
  via: 'resend' | 'log' | 'suppressed'
  error?: string
}

// The email's own words. Not in copy.ts because none of these appear on a
// screen: an email says things a form never has to, like why you are receiving
// it at all.
interface EmailCopy {
  subjectReady: (c: string) => string
  subjectPending: (c: string) => string
  heading: string
  leadReady: string
  leadPending: string

  // ── O QUE CONTRATOU ──────────────────────────────────────────────────
  planLabel: string
  whatsapp: string
  perMonth: string
  perYear: string
  totalLabel: string
  taxExcluded: string
  billingMonthly: string
  billingAnnual: string
  invoices: string
  noCommitment: string

  // ── O NÚMERO ─────────────────────────────────────────────────────────
  telmaNumberLabel: string
  telmaNumberKeep: string
  telmaNumberNew: string
  numberPendingLabel: string
  numberPendingBody: string

  // ── ACESSO ───────────────────────────────────────────────────────────
  accessLabel: string
  accessEmail: string
  accessPassword: string
  accessNote: string
  openPanel: string

  // ── AINDA NÃO DESVIE ─────────────────────────────────────────────────
  forwardTitle: string
  forwardFirst: string
  forwardThen: string

  // ── OS PASSOS ────────────────────────────────────────────────────────
  stepsLabel: string
  stepsKeep: Array<{ title: string; body: string }>
  stepsNew: Array<{ title: string; body: string }>
  stepsPendingKeep: Array<{ title: string; body: string }>
  stepsPendingNew: Array<{ title: string; body: string }>

  // ── O SEGUNDO EMAIL ──────────────────────────────────────────────────
  readySubject: (c: string) => string
  readyHeading: string
  readyLeadKeep: string
  readyLeadNew: string
  readyStepsLabel: string
  readyStepsKeep: Array<{ title: string; body: string }>
  readyStepsNew: Array<{ title: string; body: string }>

  support: string
  footer: string
  footerTagline: string
  htmlLang: string
}

const EMAIL: Record<OnboardingLocale, EmailCopy> = {
  pt: {
    subjectReady: (c) => `Subscrição confirmada — ${c}`,
    subjectPending: (c) => `Subscrição confirmada — ${c}`,
    heading: 'A sua subscrição está confirmada.',
    leadReady:
      'Estamos a activar a linha da sua clínica. O processo costuma demorar entre um e cinco dias úteis e avisamos por email assim que estiver pronta. Entretanto, o painel já está disponível: pode configurar a Telma e deixá-la preparada para atender desde o primeiro dia.',
    leadPending:
      'Estamos a activar a linha da sua clínica. Assim que o pagamento estiver confirmado e a linha pronta, avisamos por email. Entretanto, o painel já está disponível: pode configurar a Telma e deixá-la preparada para atender desde o primeiro dia.',

    planLabel: 'O seu plano',
    whatsapp: 'WhatsApp',
    perMonth: '/mês',
    perYear: '/ano',
    totalLabel: 'Total',
    taxExcluded: 'mais IVA',
    billingMonthly: 'A cobrança é mensal, pelo mesmo valor, a contar de hoje.',
    billingAnnual: 'A cobrança é anual, pelo mesmo valor, a contar de hoje.',
    invoices: 'Pode consultar e descarregar as suas facturas em Conta, no painel.',
    noCommitment: 'Sem permanência. Pode cancelar a subscrição a partir do painel quando quiser.',

    telmaNumberLabel: 'O número da Telma',
    telmaNumberKeep:
      'Este é o número para o qual serão desviadas as chamadas atendidas pela Telma. O número habitual da sua clínica não muda e continuará a ser o seu número de contacto.',
    telmaNumberNew:
      'Este é o número da sua clínica. A Telma atende nele assim que a activar no painel.',
    numberPendingLabel: 'A sua linha',
    numberPendingBody:
      'Estamos a activá-la junto da operadora. Costuma demorar entre um e cinco dias úteis e avisamos por email assim que estiver pronta.',

    accessLabel: 'Acesso ao painel',
    accessEmail: 'Email',
    accessPassword: 'Palavra-passe temporária',
    accessNote: 'Use esta palavra-passe para entrar da primeira vez. Depois pode alterá-la no painel.',
    openPanel: 'Abrir o painel',

    forwardTitle: 'Ainda não desvie as suas chamadas',
    forwardFirst:
      'Primeiro, configure a Telma com as informações da sua clínica e active-a quando estiver pronta. Assim poderá atender os seus doentes correctamente desde a primeira chamada.',
    forwardThen:
      'Quando chegar o momento, encontrará no painel os códigos necessários para activar o desvio. Só terá de os marcar no telefone da clínica e demora menos de um minuto.',

    stepsLabel: 'O que acontece a seguir',
    stepsKeep: [
      { title: 'Configure a sua clínica', body: 'Adicione os horários, serviços e idiomas. Demora apenas alguns minutos.' },
      { title: 'Active a Telma', body: 'Quando terminar, o painel indica que está pronta para começar a atender.' },
      { title: 'Desvie as suas chamadas', body: 'Encontrará no painel os códigos necessários, já preparados para o seu número.' },
    ],
    stepsNew: [
      { title: 'Configure a sua clínica', body: 'Adicione os horários, serviços e idiomas. Demora apenas alguns minutos.' },
      { title: 'Active a Telma', body: 'O painel indica quando está pronta para começar a atender.' },
      { title: 'Comece a usar o seu número', body: 'Pode acrescentá-lo ao site, ao Google, aos cartões e aos restantes contactos.' },
    ],
    stepsPendingKeep: [
      { title: 'Configure a sua clínica', body: 'Adicione os horários, serviços e idiomas. Demora apenas alguns minutos.' },
      { title: 'Deixe a Telma preparada', body: 'Pode concluir toda a configuração enquanto activamos a sua linha.' },
      { title: 'Active o desvio', body: 'Quando a linha estiver pronta, avisamos. Os códigos ficam à sua espera no painel.' },
    ],
    stepsPendingNew: [
      { title: 'Configure a sua clínica', body: 'Adicione os horários, serviços e idiomas. Demora apenas alguns minutos.' },
      { title: 'Deixe a Telma preparada', body: 'Pode concluir toda a configuração enquanto activamos a sua linha.' },
      { title: 'Comece a usar o número', body: 'Quando estiver pronto, avisamos por email para o poder divulgar.' },
    ],

    readySubject: (c) => `O serviço da ${c} já está activo`,
    readyHeading: 'O seu serviço já está activo.',
    readyLeadKeep:
      'A linha da Telma está pronta. O número habitual da sua clínica não muda: falta apenas indicar à sua operadora que lhe passe as chamadas que não conseguir atender.',
    readyLeadNew:
      'O número da sua clínica está pronto. A Telma atende nele assim que a activar no painel.',
    readyStepsLabel: 'O que falta',
    readyStepsKeep: [
      { title: 'Active a Telma', body: 'Se ainda não o fez. O painel indica quando está pronta.' },
      { title: 'Marque os códigos', body: 'Encontra-os no painel, já preparados para este número.' },
      { title: 'Faça uma chamada', body: 'Ligue para o número da clínica e ouça-a atender.' },
    ],
    readyStepsNew: [
      { title: 'Active a Telma', body: 'Se ainda não o fez. O painel indica quando está pronta.' },
      { title: 'Comece a usar o número', body: 'No site, no Google, nos cartões e nos restantes contactos.' },
      { title: 'Faça uma chamada', body: 'Ligue para o número e ouça-a atender.' },
    ],

    support: 'Qualquer dúvida, responda a este email. Lê-o uma pessoa.',
    footer:
      'Recebeu este email porque inscreveu a sua clínica na Telma. Se não foi você, responda a esta mensagem e tratamos disso.',
    footerTagline: 'A Telma atende quando ninguém pode.',
    htmlLang: 'pt',
  },
  es: {
    subjectReady: (c) => `Suscripción confirmada — ${c}`,
    subjectPending: (c) => `Suscripción confirmada — ${c}`,
    heading: 'Su suscripción está confirmada.',
    leadReady:
      'Estamos activando la línea de su clínica. El proceso suele tardar entre uno y cinco días laborables y le avisaremos por email en cuanto esté lista. Mientras tanto, su panel ya está disponible: puede configurar a Telma y dejarla preparada para atender desde el primer día.',
    leadPending:
      'Estamos activando la línea de su clínica. En cuanto se confirme el pago y la línea esté lista, le avisaremos por email. Mientras tanto, su panel ya está disponible: puede configurar a Telma y dejarla preparada para atender desde el primer día.',

    planLabel: 'Su plan',
    whatsapp: 'WhatsApp',
    perMonth: '/mes',
    perYear: '/año',
    totalLabel: 'Total',
    taxExcluded: 'más IVA',
    billingMonthly: 'El cobro se realiza cada mes por el mismo importe, a partir de hoy.',
    billingAnnual: 'El cobro se realiza cada año por el mismo importe, a partir de hoy.',
    invoices: 'Puede consultar y descargar sus facturas desde Cuenta, en el panel.',
    noCommitment: 'Sin permanencia. Puede cancelar su suscripción desde el panel cuando quiera.',

    telmaNumberLabel: 'El número de Telma',
    telmaNumberKeep:
      'Este es el número al que se desviarán las llamadas que atienda Telma. Su número habitual no cambia y seguirá siendo el número de contacto de su clínica.',
    telmaNumberNew:
      'Este es el número de su clínica. Telma contesta en él en cuanto la active en el panel.',
    numberPendingLabel: 'Su línea',
    numberPendingBody:
      'La estamos activando con la operadora. Suele tardar entre uno y cinco días laborables y le avisaremos por email en cuanto esté lista.',

    accessLabel: 'Acceso al panel',
    accessEmail: 'Email',
    accessPassword: 'Contraseña temporal',
    accessNote: 'Utilice esta contraseña para acceder por primera vez. Podrá cambiarla después desde el panel.',
    openPanel: 'Abrir el panel',

    forwardTitle: 'Todavía no desvíe sus llamadas',
    forwardFirst:
      'Antes, configure a Telma con la información de su clínica y actívela cuando esté lista. Así podrá atender a sus pacientes correctamente desde la primera llamada.',
    forwardThen:
      'Cuando llegue el momento, encontrará en el panel los códigos necesarios para activar el desvío. Solo tendrá que marcarlos desde el teléfono de la clínica y tardará menos de un minuto.',

    stepsLabel: 'Qué pasa a continuación',
    stepsKeep: [
      { title: 'Configure su clínica', body: 'Añada sus horarios, servicios e idiomas. Solo le llevará unos minutos.' },
      { title: 'Active a Telma', body: 'Cuando haya terminado, el panel le indicará que está lista para empezar a atender.' },
      { title: 'Desvíe sus llamadas', body: 'Encontrará en el panel los códigos necesarios, ya preparados para su número.' },
    ],
    stepsNew: [
      { title: 'Configure su clínica', body: 'Añada sus horarios, servicios e idiomas. Solo le llevará unos minutos.' },
      { title: 'Active a Telma', body: 'El panel le indicará cuándo está lista para empezar a atender.' },
      { title: 'Empiece a utilizar su número', body: 'Puede añadirlo a su web, a Google, a sus tarjetas y al resto de canales.' },
    ],
    stepsPendingKeep: [
      { title: 'Configure su clínica', body: 'Añada sus horarios, servicios e idiomas. Solo le llevará unos minutos.' },
      { title: 'Deje a Telma preparada', body: 'Puede completar toda la configuración mientras activamos su línea.' },
      { title: 'Active el desvío', body: 'Cuando la línea esté lista, le avisaremos. Los códigos le esperan en el panel.' },
    ],
    stepsPendingNew: [
      { title: 'Configure su clínica', body: 'Añada sus horarios, servicios e idiomas. Solo le llevará unos minutos.' },
      { title: 'Deje a Telma preparada', body: 'Puede completar toda la configuración mientras activamos su línea.' },
      { title: 'Empiece a utilizar su número', body: 'Cuando esté listo, le avisaremos por email para que pueda difundirlo.' },
    ],

    readySubject: (c) => `El servicio de ${c} ya está activo`,
    readyHeading: 'Su servicio ya está activo.',
    readyLeadKeep:
      'La línea de Telma ya está lista. Su número habitual no cambia: solo falta indicarle a su operadora que le pase las llamadas que usted no pueda atender.',
    readyLeadNew:
      'El número de su clínica ya está listo. Telma contesta en él en cuanto la active en el panel.',
    readyStepsLabel: 'Lo que falta',
    readyStepsKeep: [
      { title: 'Active a Telma', body: 'Si aún no lo ha hecho. El panel le indica cuándo está lista.' },
      { title: 'Marque los códigos', body: 'Los encontrará en el panel, ya preparados para este número.' },
      { title: 'Haga una llamada', body: 'Llame al número de su clínica y escúchela contestar.' },
    ],
    readyStepsNew: [
      { title: 'Active a Telma', body: 'Si aún no lo ha hecho. El panel le indica cuándo está lista.' },
      { title: 'Empiece a utilizar su número', body: 'En su web, en Google, en sus tarjetas y en el resto de canales.' },
      { title: 'Haga una llamada', body: 'Llame al número y escúchela contestar.' },
    ],

    support: 'Cualquier duda, responda a este email. Lo lee una persona.',
    footer:
      'Ha recibido este email porque ha dado de alta su clínica en Telma. Si no ha sido usted, responda a este mensaje y lo resolvemos.',
    footerTagline: 'Telma atiende cuando nadie puede.',
    htmlLang: 'es',
  },
}

function emailCopy(locale: OnboardingLocale): EmailCopy {
  return EMAIL[locale] ?? EMAIL[DEFAULT_ONBOARDING_LOCALE]
}

const RESEND_KEY = process.env.RESEND_API_KEY

/**
 * Sent from the subdomain, answered at the main one.
 *
 * Transactional mail goes out through `notificacoes.telmaatende.com`, which is
 * the domain verified at Resend and deliberately not the main one: the main
 * one carries the company's real mail through another provider, and putting
 * both in one SPF record is how a sign-up email takes the inbox down with it.
 *
 * Nobody reads that subdomain, though, and this email invites a reply twice --
 * once in the footer and once about forwarding a landline. So replies are
 * pointed at the address a person actually opens. Without this they went to a
 * mailbox that does not exist, which is worse than not asking: the clinic
 * writes, nothing bounces for days, and it believes it is waiting on us.
 */
const FROM = process.env.ONBOARDING_EMAIL_FROM || 'Telma <ola@notificacoes.telmaatende.com>'
const REPLY_TO = process.env.ONBOARDING_EMAIL_REPLY_TO || 'ola@telmaatende.com'

export async function sendWelcomeEmail(payload: WelcomeEmail): Promise<EmailResult> {
  const t = emailCopy(payload.locale)
  const subject = payload.pendingPayment
    ? t.subjectPending(payload.clinicName)
    : t.subjectReady(payload.clinicName)

  if (!RESEND_KEY) {
    if (process.env.NODE_ENV === 'production') {
      // Refusing rather than logging: a temporary password in a production log
      // is a credential in a place nobody treats as a credential store.
      return { sent: false, via: 'suppressed', error: 'RESEND_API_KEY não configurada.' }
    }
    console.info(
      [
        '',
        '  ┌─ EMAIL DE BOAS-VINDAS (modo demo, não enviado) ─────────────',
        `  │ Para:     ${payload.email}`,
        `  │ Assunto:  ${subject}`,
        `  │ Clínica:  ${payload.clinicName}`,
        `  │ Número:   ${payload.phoneNumber ?? '(por atribuir)'}`,
        `  │ Acesso:   ${payload.email}`,
        `  │ Password: ${payload.password}`,
        `  │ Painel:   ${payload.dashboardUrl}`,
        '  └─────────────────────────────────────────────────────────────',
        '',
      ].join('\n')
    )
    return { sent: true, via: 'log' }
  }

  return send({
    to: payload.email,
    subject,
    html: welcomeHtml(payload),
    text: welcomeText(payload),
  })
}

/**
 * One way out, for every email this file sends.
 *
 * The welcome used to carry the fetch inline, so the second message would
 * have carried its own copy of the headers, the error handling and the
 * reply-to. Two copies of a sender is two places to forget a header, and the
 * one people forget is reply_to.
 */
async function send(m: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<EmailResult> {
  if (!RESEND_KEY) {
    return { sent: false, via: 'suppressed', error: 'RESEND_API_KEY não configurada.' }
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [m.to],
        reply_to: REPLY_TO,
        subject: m.subject,
        html: m.html,
        text: m.text,
      }),
      cache: 'no-store',
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { sent: false, via: 'resend', error: detail.slice(0, 300) || `HTTP ${res.status}` }
    }
    return { sent: true, via: 'resend' }
  } catch (e) {
    return { sent: false, via: 'resend', error: e instanceof Error ? e.message : 'unknown' }
  }
}

// The email itself ----------------------------------------------------------
// Tables and inline styles, because that is what mail clients render. The
// palette is the brand's, taken from globals.css by hand: an email cannot read
// a custom property, so these are the only literal colours in the project and
// they are here for that reason.
const INK = '#111111'
const INK_SOFT = '#525252'
const INK_MUTE = '#706E6E'
const LINE = '#E7EAE8'
const SUNKEN = '#F5F5F3'
const MACAW = '#D9EE50'
const MACAW_WASH = '#F7FDD0'
const ASSETS = 'https://app.telmaatende.com/brand'

/** Amounts as the clinic's own country writes them. */
function money(cents: number, currency: string, locale: OnboardingLocale): string {
  return new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'pt-PT', {
    style: 'currency',
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)
}
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"


/**
 * The envelope both emails arrive in.
 *
 * Extracted the moment there were two. A second message with its own copy of
 * the head, the macaw rule and the footer is a second place for the brand to
 * drift, and it drifts in the direction of whoever edited last. Only the
 * middle differs, which is the only part that should.
 */
function shell(o: {
  lang: string
  title: string
  preheader: string
  heading: string
  body: string
  footer: string
  tagline: string
  support?: string
}): string {
  return `<!doctype html>
<html lang="${o.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(o.title)}</title></head>
<body style="margin:0;padding:0;background:${SUNKEN};font-family:${SANS};color:${INK};-webkit-font-smoothing:antialiased">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(o.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SUNKEN}">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden">

        <tr><td style="background:${INK};padding:0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:28px 0 30px 24px;vertical-align:top">
                <img src="${ASSETS}/telma-lockup.png" width="118" height="28" alt="Telma"
                     style="display:block;border:0;width:118px;height:28px">
                <p style="margin:22px 0 0;font-size:26px;line-height:1.2;font-weight:600;letter-spacing:-0.02em;color:#FFFFFF">${escapeHtml(o.heading)}</p>
              </td>
              <td width="150" style="padding:0;font-size:0;line-height:0;vertical-align:top" align="right">
                <img src="${ASSETS}/telma-letters.png" width="150" height="82" alt=""
                     style="display:block;border:0;width:150px;height:82px">
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="background:${MACAW};font-size:0;line-height:0;height:4px">&nbsp;</td></tr>

${o.body}

        <tr><td style="padding:30px 24px 26px">
          ${o.support ? `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:${INK_SOFT}">${escapeHtml(o.support)}</p>` : ''}
          <p style="margin:0;font-size:13px;line-height:1.6;color:${INK_MUTE}">${escapeHtml(o.footer)}</p>
        </td></tr>

        <tr><td style="background:${INK};padding:22px 24px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="vertical-align:middle">
                <img src="${ASSETS}/telma-lockup.png" width="100" height="23" alt="Telma"
                     style="display:block;border:0;width:100px;height:23px">
                <p style="margin:10px 0 0;font-size:13px;color:rgba(255,255,255,0.62)">${escapeHtml(o.tagline)}</p>
              </td>
              <td align="right" style="vertical-align:middle">
                <a href="https://www.telmaatende.com" style="font-size:13px;color:rgba(255,255,255,0.62);text-decoration:none">telmaatende.com</a>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

/** The three steps, in a row under macaw rules. */
function stepsBlock(label: string, steps: Array<{ title: string; body: string }>): string {
  return `        <tr><td style="padding:34px 24px 0">
          <p style="margin:0 0 16px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${INK_MUTE}">${escapeHtml(label)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${steps
                .map(
                  (step, i) => `<td width="33%" style="padding:0 ${i === 2 ? '0' : '14px'} 0 0;vertical-align:top">
                <div style="height:3px;background:${MACAW};border-radius:2px"></div>
                <p style="margin:10px 0 0;font-size:12px;font-weight:600;font-family:${MONO};color:${INK_MUTE}">0${i + 1}</p>
                <p style="margin:5px 0 0;font-size:15px;font-weight:600;line-height:1.35;color:${INK}">${escapeHtml(step.title)}</p>
                <p style="margin:3px 0 0;font-size:14px;line-height:1.5;color:${INK_SOFT}">${escapeHtml(step.body)}</p>
              </td>`
                )
                .join('\n              ')}
            </tr>
          </table>
        </td></tr>`
}

export function welcomeHtml(p: WelcomeEmail): string {
  const t = emailCopy(p.locale)
  const lead = p.pendingPayment ? t.leadPending : t.leadReady
  const per = p.summary?.cycle === 'annual' ? t.perYear : t.perMonth

  // Four shapes, because the right third step depends on two things: whether
  // the line exists yet, and whether they kept their own number. Telling a
  // clinic to turn Telma on before there is a line to turn on is an
  // instruction it cannot follow.
  const steps = p.phoneNumber
    ? p.temporaryNumber
      ? t.stepsKeep
      : t.stepsNew
    : p.temporaryNumber
      ? t.stepsPendingKeep
      : t.stepsPendingNew

  const row = (label: string, value: string) => `<tr>
                  <td style="padding:5px 0;font-size:15px;color:${INK}">${escapeHtml(label)}</td>
                  <td align="right" style="padding:5px 0;font-size:15px;color:${INK}">${value}</td>
                </tr>`

  const plan = p.summary
    ? `<tr><td style="padding:18px 20px">
              <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${INK_MUTE}">${escapeHtml(t.planLabel)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${p.summary.lines
                  .map((l) =>
                    row(l.label, `${money(l.amount, p.summary!.currency, p.locale)}${escapeHtml(per)}`)
                  )
                  .join('\n                ')}
                <tr><td colspan="2" style="padding:8px 0 0"><div style="height:1px;background:${LINE}"></div></td></tr>
                <tr>
                  <td style="padding:10px 0 0;font-size:16px;font-weight:600;color:${INK}">${escapeHtml(t.totalLabel)}</td>
                  <td align="right" style="padding:10px 0 0;font-size:16px;font-weight:600;color:${INK}">${money(p.summary.total, p.summary.currency, p.locale)}${escapeHtml(per)}${
                    p.summary.taxPercentage === null || p.summary.taxPercentage === 0
                      ? ` <span style="font-weight:400;font-size:13px;color:${INK_MUTE}">${escapeHtml(t.taxExcluded)}</span>`
                      : ''
                  }</td>
                </tr>
              </table>
              <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:${INK_MUTE}">${escapeHtml(
                p.summary.cycle === 'annual' ? t.billingAnnual : t.billingMonthly
              )} ${escapeHtml(t.invoices)}<br>${escapeHtml(t.noCommitment)}</p>
            </td></tr>
            <tr><td style="padding:0 20px"><div style="height:1px;background:${LINE}"></div></td></tr>`
    : ''

  const number = p.phoneNumber
    ? `<p style="margin:0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${INK_MUTE}">${escapeHtml(t.telmaNumberLabel)}</p>
              <p style="margin:7px 0 0;font-size:24px;font-weight:600;letter-spacing:-0.01em;color:${INK}">${escapeHtml(p.phoneNumber)}</p>
              <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:${INK_MUTE}">${escapeHtml(
                p.temporaryNumber ? t.telmaNumberKeep : t.telmaNumberNew
              )}</p>`
    : `<p style="margin:0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${INK_MUTE}">${escapeHtml(t.numberPendingLabel)}</p>
              <p style="margin:7px 0 0;font-size:15px;line-height:1.65;color:${INK}">${escapeHtml(t.numberPendingBody)}</p>`

  // Only for a clinic that kept its own number, and only once the line
  // exists. Before that the number section already says we are arranging it,
  // and a second block about not forwarding yet is a warning about something
  // they could not do anyway.
  const forwarding =
    p.temporaryNumber && p.phoneNumber
      ? `
          <h2 style="margin:38px 0 10px;font-size:19px;font-weight:600;letter-spacing:-0.01em;color:${INK}">${escapeHtml(t.forwardTitle)}</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MACAW_WASH};border-left:4px solid ${MACAW};border-radius:0 10px 10px 0">
            <tr><td style="padding:16px 20px">
              <p style="margin:0;font-size:15px;line-height:1.65;color:${INK}">${escapeHtml(t.forwardFirst)}</p>
              <p style="margin:10px 0 0;font-size:15px;line-height:1.65;color:${INK}">${escapeHtml(t.forwardThen)}</p>
            </td></tr>
          </table>`
      : ''

  return shell({
    lang: t.htmlLang,
    title: p.clinicName,
    preheader: lead,
    heading: t.heading,
    footer: t.footer,
    tagline: t.footerTagline,
    support: t.support,
    body: `        <tr><td style="padding:30px 24px 8px">
          <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:${INK_SOFT}">${escapeHtml(lead)}</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:12px">
            ${plan}
            <tr><td style="padding:18px 20px">
              ${number}
            </td></tr>
            <tr><td style="padding:0 20px"><div style="height:1px;background:${LINE}"></div></td></tr>
            <tr><td style="padding:18px 20px">
              <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${INK_MUTE}">${escapeHtml(t.accessLabel)}</p>
              <p style="margin:0;font-size:13px;color:${INK_MUTE}">${escapeHtml(t.accessEmail)}</p>
              <p style="margin:2px 0 0;font-size:16px;color:${INK}">${escapeHtml(p.email)}</p>
              <p style="margin:12px 0 0;font-size:13px;color:${INK_MUTE}">${escapeHtml(t.accessPassword)}</p>
              <p style="margin:2px 0 0;font-size:17px;font-weight:600;font-family:${MONO};letter-spacing:0.01em;color:${INK}">${escapeHtml(p.password)}</p>
              <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:${INK_MUTE}">${escapeHtml(t.accessNote)}</p>
            </td></tr>
          </table>

          <p style="margin:24px 0 0">
            <a href="${escapeHtml(p.dashboardUrl)}"
               style="display:inline-block;background:${INK};color:#FFFFFF;text-decoration:none;padding:14px 26px;border-radius:8px;font-size:16px;font-weight:500">${escapeHtml(t.openPanel)}</a>
          </p>
${forwarding}
        </td></tr>
${stepsBlock(t.stepsLabel, steps)}`,
  })
}

export function welcomeText(p: WelcomeEmail): string {
  const t = emailCopy(p.locale)
  const per = p.summary?.cycle === 'annual' ? t.perYear : t.perMonth
  const steps = p.phoneNumber
    ? p.temporaryNumber
      ? t.stepsKeep
      : t.stepsNew
    : p.temporaryNumber
      ? t.stepsPendingKeep
      : t.stepsPendingNew

  return [
    t.heading,
    '',
    p.pendingPayment ? t.leadPending : t.leadReady,
    ...(p.summary
      ? [
          '',
          `${t.planLabel}:`,
          ...p.summary.lines.map(
            (l) => `  ${l.label}: ${money(l.amount, p.summary!.currency, p.locale)}${per}`
          ),
          `  ${t.totalLabel}: ${money(p.summary.total, p.summary.currency, p.locale)}${per}`,
          `  ${p.summary.cycle === 'annual' ? t.billingAnnual : t.billingMonthly}`,
          `  ${t.invoices}`,
          `  ${t.noCommitment}`,
        ]
      : []),
    '',
    ...(p.phoneNumber
      ? [
          `${t.telmaNumberLabel}: ${p.phoneNumber}`,
          `  ${p.temporaryNumber ? t.telmaNumberKeep : t.telmaNumberNew}`,
        ]
      : [`${t.numberPendingLabel}: ${t.numberPendingBody}`]),
    '',
    `${t.accessLabel}:`,
    `  ${t.accessEmail}: ${p.email}`,
    `  ${t.accessPassword}: ${p.password}`,
    `  ${t.accessNote}`,
    `  ${p.dashboardUrl}`,
    ...(p.temporaryNumber && p.phoneNumber
      ? ['', `${t.forwardTitle}:`, `  ${t.forwardFirst}`, `  ${t.forwardThen}`]
      : []),
    '',
    `${t.stepsLabel}:`,
    ...steps.map((x, i) => `  ${i + 1}. ${x.title}: ${x.body}`),
  ].join('\n')
}

export interface NumberReadyEmail {
  clinicName: string
  email?: string
  phoneNumber: string
  /** True when the clinic kept its own number and forwards to this one. */
  forwarding: boolean
  dashboardUrl: string
  locale: OnboardingLocale
}

export function numberReadyHtml(p: NumberReadyEmail): string {
  const t = emailCopy(p.locale)
  const lead = p.forwarding ? t.readyLeadKeep : t.readyLeadNew

  const steps = p.forwarding ? t.readyStepsKeep : t.readyStepsNew
  const html = shell({
    lang: t.htmlLang,
    title: p.clinicName,
    preheader: lead,
    heading: t.readyHeading,
    footer: t.footer,
    tagline: t.footerTagline,
    support: t.support,
    body: `        <tr><td style="padding:30px 24px 8px">
          <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:${INK_SOFT}">${escapeHtml(lead)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:12px">
            <tr><td style="padding:18px 20px">
              <p style="margin:0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${INK_MUTE}">${escapeHtml(
                // The clinic that kept its own number is being shown ours.
                // Calling that "your number" over the head of the one that is
                // theirs is the confusion the first email was rewritten to
                // remove, and it would arrive here instead.
                t.telmaNumberLabel
              )}</p>
              <p style="margin:7px 0 0;font-size:24px;font-weight:600;letter-spacing:-0.01em;color:${INK}">${escapeHtml(p.phoneNumber)}</p>
            </td></tr>
          </table>
          <p style="margin:24px 0 0">
            <a href="${escapeHtml(p.dashboardUrl)}"
               style="display:inline-block;background:${INK};color:#FFFFFF;text-decoration:none;padding:14px 26px;border-radius:8px;font-size:16px;font-weight:500">${escapeHtml(t.openPanel)}</a>
          </p>
        </td></tr>
${stepsBlock(t.readyStepsLabel, steps)}`,
  })

  return html
}

export async function sendNumberReadyEmail(
  p: NumberReadyEmail & { email: string }
): Promise<EmailResult> {
  const t = emailCopy(p.locale)
  const lead = p.forwarding ? t.readyLeadKeep : t.readyLeadNew
  const steps = p.forwarding ? t.readyStepsKeep : t.readyStepsNew
  const text = [
    t.readyHeading,
    '',
    lead,
    '',
    `${t.telmaNumberLabel}: ${p.phoneNumber}`,
    '',
    `${t.readyStepsLabel}:`,
    ...steps.map((x, i) => `  ${i + 1}. ${x.title}: ${x.body}`),
    '',
    p.dashboardUrl,
  ].join('\n')

  return send({
    to: p.email,
    subject: t.readySubject(p.clinicName),
    html: numberReadyHtml(p),
    text,
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
