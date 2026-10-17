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
  headingReady: (c: string) => string
  headingPending: (c: string) => string
  leadReady: string
  leadPending: string
  numberLabel: string
  numberTemp: string
  /** Shown instead of a number while the line is being bought. */
  numberPendingLabel: string
  numberPendingBody: string
  /** The contracted summary at the top of the first email. */
  summaryLabel: string
  summaryPlanLine: (plan: string, cycle: string) => string
  summaryWhatsapp: string
  summaryCycleMonthly: string
  summaryCycleAnnual: string
  summaryTotal: string
  summaryTaxExcluded: string
  summaryRenewMonthly: string
  summaryRenewAnnual: string
  summaryInvoice: string
  summaryNoCommitment: string
  numberSectionLabel: string
  numberKeepPending: (own: string) => string
  numberNewPending: string
  /** The forward is the last step, not the first, so the email explains it
   *  and does not hand over the codes. Those live in the panel, behind the
   *  moment the clinic turns Telma on. */
  forwardTitle: string
  forwardWhat: string
  forwardNotYet: string
  /** Steps for a clinic that kept its number: three, ending in the forward.
   *  `next` stays for one that bought a new number and has nothing to forward. */
  nextKeep: Array<{ title: string; body: string }>
  accessLabel: string
  passwordNote: string
  openPanel: string
  /** The second email: the line is live. */
  readySubject: (c: string) => string
  readyHeading: string
  readyLeadKeep: string
  readyLeadNew: string
  readyNumberLabel: string
  readyNumberLabelNew: string
  readyStepsLabel: string
  readyStepsKeep: Array<{ title: string; body: string }>
  readyStepsNew: Array<{ title: string; body: string }>
  nextTitle: string
  /** A title and one line each: a step with a name is a thing somebody can
   *  decide to do, and a sentence on its own is a sentence. */
  next: Array<{ title: string; body: string }>
  footer: string
  footerTagline: string
  support: string
  stepsLabel: string
  htmlLang: string
}

const EMAIL: Record<OnboardingLocale, EmailCopy> = {
  pt: {
    // Nem uma nem outra diz que a Telma já atende, porque não atende: a
    // clínica acabou de pagar e ainda não lhe disse nada. Dizia-o, e era a
    // primeira frase que lhe mandávamos.
    subjectReady: (c) => `Subscrição confirmada — ${c}`,
    subjectPending: (c) => `Subscrição confirmada — ${c}`,
    headingReady: () => 'Obrigado. A sua subscrição está confirmada.',
    headingPending: () => 'Obrigado. A sua subscrição está confirmada.',
    leadReady:
      'Estamos a activar o serviço da sua clínica. Costuma demorar entre um e cinco dias úteis, e avisamos por email assim que a linha estiver pronta. Entretanto o painel já é seu: pode deixar a Telma preparada para o primeiro dia.',
    leadPending:
      'Estamos a activar o serviço da sua clínica. Assim que o pagamento for confirmado e a linha estiver pronta, avisamos por email. Entretanto o painel já é seu: pode deixar a Telma preparada para o primeiro dia.',
    numberLabel: 'O número que a Telma atende',
    numberPendingLabel: 'O número',
    numberPendingBody:
      'Estamos a tratar do número da Telma junto da operadora. Costuma demorar entre um e cinco dias úteis e avisamos por email assim que estiver activo. Não tem de fazer nada entretanto.',
    summaryLabel: 'O que contratou',
    summaryPlanLine: (plan, cycle) => `Plano ${plan}, ${cycle}`,
    summaryWhatsapp: 'WhatsApp',
    summaryCycleMonthly: 'mensal',
    summaryCycleAnnual: 'anual',
    summaryTotal: 'Total',
    summaryTaxExcluded: 'mais IVA',
    summaryRenewMonthly: 'Cobrança mensal. Renova todos os meses pelo mesmo valor, a contar de hoje.',
    summaryRenewAnnual: 'Cobrança anual. Renova todos os anos pelo mesmo valor, a contar de hoje.',
    summaryInvoice: 'As facturas ficam no painel, em Conta, prontas a descarregar.',
    summaryNoCommitment: 'Sem permanência: pode cancelar a partir do painel.',
    numberSectionLabel: 'O seu número',
    numberKeepPending: (own) =>
      `Fica com o ${own}, o número que já tem. Estamos a tratar do número da Telma para onde o vai desviar: costuma demorar entre um e cinco dias úteis e avisamos assim que estiver pronto.`,
    numberNewPending:
      'Estamos a tratar do seu número novo junto da operadora. Costuma demorar entre um e cinco dias úteis e avisamos por email assim que for seu.',
    numberTemp:
      'O seu número de sempre fica onde está, na sua operadora. No fim, será desviado para este.',
    forwardTitle: 'E por fim, desviar o seu número',
    forwardWhat:
      'O seu número de sempre, {own}, continua a ser o seu e não muda. No fim, diz-se à sua operadora que passe para a Telma as chamadas que não conseguir atender. São três códigos marcados no telefone da clínica e demora um minuto.',
    forwardNotYet:
      'Ainda não, por esta ordem: primeiro diga à Telma quando abre e o que faz, e ligue-a. Antes disso ela não conhece a clínica e não conseguiria atender quem liga. Os códigos aparecem no painel, já preenchidos, assim que a ligar.',
    accessLabel: 'Os seus acessos',
    passwordNote: 'Palavra-passe temporária. Mude-a assim que entrar.',
    openPanel: 'Abrir o painel',
    readySubject: (c) => `O serviço da ${c} já está activo`,
    readyHeading: 'O seu serviço já está activo.',
    readyLeadKeep:
      'A linha da Telma está pronta. O seu número de sempre não muda: o que falta é dizer à sua operadora que lhe passe as chamadas que não conseguir atender. São três códigos, marcados uma vez no telefone da clínica, e estão no painel já preenchidos.',
    readyLeadNew:
      'O número da sua clínica está pronto. É este que pode pôr nos cartões, no Google e na porta: a Telma atende nele assim que a ligar no painel.',
    readyNumberLabel: 'O número da Telma',
    readyNumberLabelNew: 'O seu número',
    readyStepsLabel: 'O que falta',
    readyStepsKeep: [
      { title: 'Ligue a Telma', body: 'Se ainda não o fez. O painel indica quando está pronta.' },
      { title: 'Marque os códigos', body: 'Estão no painel, já com este número.' },
      { title: 'Faça uma chamada', body: 'Ligue para o seu próprio número e ouça-a atender.' },
    ],
    readyStepsNew: [
      { title: 'Ligue a Telma', body: 'Se ainda não o fez. O painel indica quando está pronta.' },
      { title: 'Divulgue o número', body: 'Nos cartões, no Google e na porta.' },
      { title: 'Faça uma chamada', body: 'Ligue para o número e ouça-a atender.' },
    ],
    nextTitle: 'O que acontece a seguir',
    next: [
      { title: 'Configure a clínica', body: 'Horários, serviços e idiomas. São alguns minutos no painel.' },
      { title: 'Ligue a Telma', body: 'Quando o painel indicar que está pronta para atender.' },
      { title: 'Divulgue o número', body: 'Assim que for seu, nos cartões e no Google.' },
    ],
    nextKeep: [
      { title: 'Configure a clínica', body: 'Horários, serviços e idiomas. São alguns minutos no painel.' },
      { title: 'Ligue a Telma', body: 'Quando o painel indicar que está pronta para atender.' },
      { title: 'Desvie o seu número', body: 'Os códigos esperam no painel, já preenchidos.' },
    ],
    footer:
      'Recebeu este email porque inscreveu a sua clínica na Telma. Se não foi você, responda a esta mensagem e tratamos disso.',
    footerTagline: 'A Telma atende quando ninguém pode.',
    support: 'Qualquer dúvida, responda a este email. Lê-o uma pessoa.',
    stepsLabel: 'O que acontece a seguir',
    htmlLang: 'pt',
  },
  es: {
    subjectReady: (c) => `Suscripción confirmada — ${c}`,
    subjectPending: (c) => `Suscripción confirmada — ${c}`,
    headingReady: () => 'Gracias. Su suscripción está confirmada.',
    headingPending: () => 'Gracias. Su suscripción está confirmada.',
    leadReady:
      'Estamos activando el servicio de su clínica. Suele tardar entre uno y cinco días laborables, y le avisamos por email en cuanto la línea esté lista. Mientras tanto el panel ya es suyo: puede dejar a Telma preparada para el primer día.',
    leadPending:
      'Estamos activando el servicio de su clínica. En cuanto se confirme el pago y la línea esté lista, le avisamos por email. Mientras tanto el panel ya es suyo: puede dejar a Telma preparada para el primer día.',
    numberLabel: 'El número que contesta Telma',
    numberPendingLabel: 'El número',
    numberPendingBody:
      'Estamos tramitando el número de Telma con la operadora. Suele tardar entre uno y cinco días laborables y le avisamos por email en cuanto esté activo. Mientras tanto no tiene que hacer nada.',
    summaryLabel: 'Lo que ha contratado',
    summaryPlanLine: (plan, cycle) => `Plan ${plan}, ${cycle}`,
    summaryWhatsapp: 'WhatsApp',
    summaryCycleMonthly: 'mensual',
    summaryCycleAnnual: 'anual',
    summaryTotal: 'Total',
    summaryTaxExcluded: 'más IVA',
    summaryRenewMonthly: 'Cobro mensual. Se renueva cada mes por el mismo importe, a partir de hoy.',
    summaryRenewAnnual: 'Cobro anual. Se renueva cada año por el mismo importe, a partir de hoy.',
    summaryInvoice: 'Las facturas quedan en el panel, en Cuenta, listas para descargar.',
    summaryNoCommitment: 'Sin permanencia: puede cancelar desde el panel.',
    numberSectionLabel: 'Su número',
    numberKeepPending: (own) =>
      `Se queda con el ${own}, el número que ya tiene. Estamos tramitando el número de Telma al que lo desviará: suele tardar entre uno y cinco días laborables y le avisamos en cuanto esté listo.`,
    numberNewPending:
      'Estamos tramitando su número nuevo con la operadora. Suele tardar entre uno y cinco días laborables y le avisamos por email en cuanto sea suyo.',
    numberTemp:
      'Su número de siempre se queda donde está, en su operadora. Al final lo desviará a este.',
    forwardTitle: 'Y por último, desviar su número',
    forwardWhat:
      'Su número de siempre, {own}, sigue siendo suyo y no cambia. Al final se le dice a su operadora que pase a Telma las llamadas que usted no pueda atender. Son tres códigos que se marcan en el teléfono de la clínica y se tarda un minuto.',
    forwardNotYet:
      'Todavía no, y en este orden: primero dígale a Telma cuándo abre y qué hace, y actívela. Antes de eso no conoce la clínica y no podría atender a quien llame. Los códigos aparecen en el panel, ya rellenos, en cuanto la active.',
    accessLabel: 'Sus accesos',
    passwordNote: 'Contraseña temporal. Cámbiela en cuanto entre.',
    openPanel: 'Abrir el panel',
    readySubject: (c) => `El servicio de ${c} ya está activo`,
    readyHeading: 'Su servicio ya está activo.',
    readyLeadKeep:
      'La línea de Telma ya está lista. Su número de siempre no cambia: lo que falta es decirle a su operadora que le pase las llamadas que usted no pueda atender. Son tres códigos, marcados una vez en el teléfono de la clínica, y están en el panel ya rellenos.',
    readyLeadNew:
      'El número de su clínica ya está listo. Es el que puede poner en las tarjetas, en Google y en la puerta: Telma contesta en él en cuanto la active en el panel.',
    readyNumberLabel: 'El número de Telma',
    readyNumberLabelNew: 'Su número',
    readyStepsLabel: 'Lo que falta',
    readyStepsKeep: [
      { title: 'Active a Telma', body: 'Si aún no lo ha hecho. El panel le indica cuándo está lista.' },
      { title: 'Marque los códigos', body: 'Están en el panel, ya con este número.' },
      { title: 'Haga una llamada', body: 'Llame a su propio número y escúchela contestar.' },
    ],
    readyStepsNew: [
      { title: 'Active a Telma', body: 'Si aún no lo ha hecho. El panel le indica cuándo está lista.' },
      { title: 'Difunda el número', body: 'En las tarjetas, en Google y en la puerta.' },
      { title: 'Haga una llamada', body: 'Llame al número y escúchela contestar.' },
    ],
    nextTitle: 'Qué pasa a continuación',
    next: [
      { title: 'Configure la clínica', body: 'Horarios, servicios e idiomas. Son unos minutos en el panel.' },
      { title: 'Active a Telma', body: 'Cuando el panel le indique que está lista para atender.' },
      { title: 'Difunda el número', body: 'En cuanto sea suyo, en sus tarjetas y en Google.' },
    ],
    nextKeep: [
      { title: 'Configure la clínica', body: 'Horarios, servicios e idiomas. Son unos minutos en el panel.' },
      { title: 'Active a Telma', body: 'Cuando el panel le indique que está lista para atender.' },
      { title: 'Desvíe su número', body: 'Los códigos le esperan en el panel, ya rellenos.' },
    ],
    footer:
      'Ha recibido este email porque ha dado de alta su clínica en Telma. Si no ha sido usted, responda a este mensaje y lo resolvemos.',
    footerTagline: 'Telma atiende cuando nadie puede.',
    support: 'Cualquier duda, responda a este email. Lo lee una persona.',
    stepsLabel: 'Qué pasa a continuación',
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
  const heading = p.pendingPayment
    ? t.headingPending(p.clinicName)
    : t.headingReady(p.clinicName)
  const steps = p.temporaryNumber ? t.nextKeep : t.next

  // No codes here, on purpose. They used to be printed in full, and a clinic
  // that dialled them the day it signed up pointed a real telephone at a Telma
  // who had not been told the opening hours yet: she answers anyway, with
  // `can_book: false`, so patients got a receptionist who could not say when
  // the clinic opens and took a message instead. Silently, because nothing
  // tells the clinic that is what happened.
  //
  // So the email explains the step and withholds the digits. They are in the
  // panel, behind the moment the clinic turns her on, which is also the only
  // place they can stay correct if the number ever changes.
  const forwarding = p.temporaryNumber
    ? `
          <h2 style="margin:38px 0 10px;font-size:19px;font-weight:600;letter-spacing:-0.01em;color:${INK}">${escapeHtml(t.forwardTitle)}</h2>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${INK_SOFT}">${escapeHtml(
            t.forwardWhat.replace('{own}', p.ownNumber ?? '—')
          )}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MACAW_WASH};border-left:4px solid ${MACAW};border-radius:0 10px 10px 0">
            <tr><td style="padding:16px 20px">
              <p style="margin:0;font-size:15px;line-height:1.65;color:${INK}">${escapeHtml(t.forwardNotYet)}</p>
            </td></tr>
          </table>`
    : ''

  return `<!doctype html>
<html lang="${t.htmlLang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(p.clinicName)}</title></head>
<body style="margin:0;padding:0;background:${SUNKEN};font-family:${SANS};color:${INK};-webkit-font-smoothing:antialiased">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(lead)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SUNKEN}">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden">

        <!-- ── THE HEAD CARRIES THE SENTENCE, NOT JUST THE MARK ──────────
             A strip with a logo on it is a letterhead. The clinic's own name
             in display type on the brand's black, with the mark above it and
             the cloud of letters behind, is the product introducing itself. -->
        <tr><td style="background:${INK};padding:0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:28px 0 30px 24px;vertical-align:top">
                <img src="${ASSETS}/telma-lockup.png" width="118" height="28" alt="Telma"
                     style="display:block;border:0;width:118px;height:28px">
                <p style="margin:22px 0 0;font-size:26px;line-height:1.2;font-weight:600;letter-spacing:-0.02em;color:#FFFFFF">${escapeHtml(heading)}</p>
              </td>
              <!-- Decorative. Mail clients that block images show nothing
                   here, and nothing is what it is worth. -->
              <td width="150" style="padding:0;font-size:0;line-height:0;vertical-align:top" align="right">
                <img src="${ASSETS}/telma-letters.png" width="150" height="82" alt=""
                     style="display:block;border:0;width:150px;height:82px">
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="background:${MACAW};font-size:0;line-height:0;height:4px">&nbsp;</td></tr>

        <tr><td style="padding:30px 24px 8px">
          <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:${INK_SOFT}">${escapeHtml(lead)}</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:12px">
            ${
              // ── WHAT THEY BOUGHT, FIRST ─────────────────────────────────
              // This used to open with "the number Telma answers" and a
              // telephone number. For a clinic that kept its own, that is a
              // number it has never seen, presented as if it were theirs,
              // above the one that is. The question somebody has just after
              // paying is what they bought and when it charges again.
              p.summary
                ? `<tr><td style="padding:18px 20px">
              <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${INK_MUTE}">${escapeHtml(t.summaryLabel)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${p.summary.lines
                  .map(
                    (l) => `<tr>
                  <td style="padding:5px 0;font-size:15px;color:${INK}">${escapeHtml(l.label)}</td>
                  <td align="right" style="padding:5px 0;font-size:15px;color:${INK}">${money(l.amount, p.summary!.currency, p.locale)}</td>
                </tr>`
                  )
                  .join('\n                ')}
                <tr><td colspan="2" style="padding:8px 0 0"><div style="height:1px;background:${LINE}"></div></td></tr>
                <tr>
                  <td style="padding:10px 0 0;font-size:16px;font-weight:600;color:${INK}">${escapeHtml(t.summaryTotal)}</td>
                  <td align="right" style="padding:10px 0 0;font-size:16px;font-weight:600;color:${INK}">${money(p.summary.total, p.summary.currency, p.locale)}${
                    p.summary.taxPercentage === null || p.summary.taxPercentage === 0
                      ? ` <span style="font-weight:400;font-size:13px;color:${INK_MUTE}">${escapeHtml(t.summaryTaxExcluded)}</span>`
                      : ''
                  }</td>
                </tr>
              </table>
              <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:${INK_MUTE}">${escapeHtml(
                p.summary.cycle === 'annual' ? t.summaryRenewAnnual : t.summaryRenewMonthly
              )}<br>${escapeHtml(t.summaryInvoice)}<br>${escapeHtml(t.summaryNoCommitment)}</p>
            </td></tr>
            <tr><td style="padding:0 20px"><div style="height:1px;background:${LINE}"></div></td></tr>`
                : ''
            }
            <tr><td style="padding:18px 20px">
              <p style="margin:0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${INK_MUTE}">${escapeHtml(
                // A clinic that kept its own number is being shown ours, and
                // calling that "your number" over the top of it is the exact
                // confusion this section was rewritten to remove.
                p.temporaryNumber ? t.numberLabel : t.numberSectionLabel
              )}</p>
              ${
                p.phoneNumber
                  ? `<p style="margin:7px 0 0;font-size:24px;font-weight:600;letter-spacing:-0.01em;color:${INK}">${escapeHtml(p.phoneNumber)}</p>
              ${
                p.temporaryNumber
                  ? `<p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:${INK_MUTE}">${escapeHtml(t.numberTemp)}</p>`
                  : ''
              }`
                  : `<p style="margin:7px 0 0;font-size:15px;line-height:1.65;color:${INK}">${escapeHtml(
                      p.temporaryNumber
                        ? t.numberKeepPending(p.ownNumber ?? '')
                        : t.numberNewPending
                    )}</p>`
              }
            </td></tr>
            <tr><td style="padding:0 20px"><div style="height:1px;background:${LINE}"></div></td></tr>
            <tr><td style="padding:18px 20px">
              <p style="margin:0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${INK_MUTE}">${escapeHtml(t.accessLabel)}</p>
              <p style="margin:7px 0 0;font-size:16px;color:${INK}">${escapeHtml(p.email)}</p>
              <p style="margin:4px 0 0;font-size:17px;font-weight:600;font-family:${MONO};letter-spacing:0.01em;color:${INK}">${escapeHtml(p.password)}</p>
              <p style="margin:8px 0 0;font-size:14px;color:${INK_MUTE}">${escapeHtml(t.passwordNote)}</p>
            </td></tr>
          </table>

          <p style="margin:24px 0 0">
            <a href="${escapeHtml(p.dashboardUrl)}"
               style="display:inline-block;background:${INK};color:#FFFFFF;text-decoration:none;padding:14px 26px;border-radius:8px;font-size:16px;font-weight:500">${escapeHtml(t.openPanel)}</a>
          </p>
${forwarding}
        </td></tr>

        <!-- ── THE THREE STEPS, AS THREE THINGS ───────────────────────────
             A numbered list runs down the page and reads as instructions. In
             a row, under a macaw rule each, they read as a short path with an
             end, which is the thing somebody needs to see before they start. -->
        <tr><td style="padding:34px 24px 0">
          <p style="margin:0 0 16px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${INK_MUTE}">${escapeHtml(t.stepsLabel)}</p>
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
        </td></tr>

        <tr><td style="padding:30px 24px 26px">
          <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:${INK_SOFT}">${escapeHtml(t.support)}</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:${INK_MUTE}">${escapeHtml(t.footer)}</p>
        </td></tr>

        <tr><td style="background:${INK};padding:22px 24px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="vertical-align:middle">
                <img src="${ASSETS}/telma-lockup.png" width="100" height="23" alt="Telma"
                     style="display:block;border:0;width:100px;height:23px">
                <p style="margin:10px 0 0;font-size:13px;color:rgba(255,255,255,0.62)">${escapeHtml(t.footerTagline)}</p>
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

export function welcomeText(p: WelcomeEmail): string {
  const t = emailCopy(p.locale)
  return [
    p.pendingPayment ? t.headingPending(p.clinicName) : t.headingReady(p.clinicName),
    '',
    ...(p.summary
      ? [
          '',
          `${t.summaryLabel}:`,
          ...p.summary.lines.map(
            (l) => `  ${l.label}: ${money(l.amount, p.summary!.currency, p.locale)}`
          ),
          `  ${t.summaryTotal}: ${money(p.summary.total, p.summary.currency, p.locale)}`,
          `  ${p.summary.cycle === 'annual' ? t.summaryRenewAnnual : t.summaryRenewMonthly}`,
          `  ${t.summaryInvoice}`,
          `  ${t.summaryNoCommitment}`,
        ]
      : []),
    '',
    `${t.numberSectionLabel}:`,
    ...(p.phoneNumber
      ? [`  ${p.phoneNumber}`, ...(p.temporaryNumber ? [`  ${t.numberTemp}`] : [])]
      : [
          `  ${p.temporaryNumber ? t.numberKeepPending(p.ownNumber ?? '') : t.numberNewPending}`,
        ]),
    '',
    `${t.accessLabel}:`,
    `  ${p.email}`,
    `  ${p.password}`,
    `  ${t.passwordNote}`,
    `  ${p.dashboardUrl}`,
    '',
    ...(p.temporaryNumber && p.phoneNumber
      ? [
          '',
          `${t.forwardTitle}:`,
          `  ${t.forwardWhat.replace('{own}', p.ownNumber ?? '-')}`,
          `  ${t.forwardNotYet}`,
        ]
      : []),
    '',
    `${t.nextTitle}:`,
    ...(p.temporaryNumber ? t.nextKeep : t.next).map(
      (s, i) => `  ${i + 1}. ${s.title}: ${s.body}`
    ),
  ].join('\n')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * The second email: the line exists now.
 *
 * Two messages and not one, because the two facts arrive days apart. The
 * payment is instant and the number is not: Portuguese lines are ordered
 * through Twilio support and quoted at three to five working days. Holding
 * the welcome back until the number lands would leave a clinic that has just
 * paid with silence; naming a number in it that does not exist yet is worse.
 *
 * So the first email confirms the payment and opens the panel, and this one
 * says the line is live and what to do with it. Whether that is "forward your
 * number here" or "this is the number to hand out" depends on what they chose,
 * and getting it the wrong way round would send a clinic to publish a number
 * nobody should dial.
 */
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
                p.forwarding ? t.readyNumberLabel : t.readyNumberLabelNew
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
    `${p.forwarding ? t.readyNumberLabel : t.readyNumberLabelNew}: ${p.phoneNumber}`,
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
