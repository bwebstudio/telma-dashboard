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
  nextKeep: string[]
  accessLabel: string
  passwordNote: string
  openPanel: string
  /** The second email: the line is live. */
  readySubject: (c: string) => string
  readyHeading: string
  readyLeadKeep: string
  readyLeadNew: string
  readyNumberLabel: string
  nextTitle: string
  next: string[]
  footer: string
  footerTagline: string
  stepsLabel: string
  htmlLang: string
}

const EMAIL: Record<OnboardingLocale, EmailCopy> = {
  pt: {
    // Nem uma nem outra diz que a Telma já atende, porque não atende: a
    // clínica acabou de pagar e ainda não lhe disse nada. Dizia-o, e era a
    // primeira frase que lhe mandávamos.
    subjectReady: (c) => `A ${c} está quase pronta`,
    subjectPending: (c) => `A ${c} está quase pronta`,
    headingReady: (c) => `A ${c} está quase pronta`,
    headingPending: (c) => `A ${c} está quase pronta`,
    leadReady:
      'Está tudo criado. Abaixo fica o resumo do que contratou e os seus acessos ao painel.',
    leadPending:
      'O painel já é seu e os acessos estão abaixo. Assim que o pagamento for confirmado, a linha entra ao serviço.',
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
    summaryRenewMonthly: 'Renova todos os meses pelo mesmo valor, a contar de hoje.',
    summaryRenewAnnual: 'Renova todos os anos pelo mesmo valor, a contar de hoje.',
    summaryInvoice: 'As facturas ficam sempre no seu painel, em Conta, e pode descarregá-las quando quiser.',
    summaryNoCommitment: 'Sem permanência. Pode cancelar quando quiser a partir do painel.',
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
    readySubject: (c) => `O número da ${c} já está activo`,
    readyHeading: 'O seu número já está activo',
    readyLeadKeep:
      'Já temos o número da Telma. Falta um passo seu: desviar para aqui as chamadas que não conseguir atender. Os códigos estão no painel, já preenchidos, assim que a ligar.',
    readyLeadNew:
      'Já temos o seu número. É este que pode pôr nos cartões, no Google e na porta. A Telma atende nele assim que a ligar no painel.',
    readyNumberLabel: 'O seu número',
    nextTitle: 'O que acontece a seguir',
    next: [
      'Diga à Telma quando a clínica abre e o que faz. São duas respostas no painel.',
      'Ligue-a quando quiser. O painel diz-lhe quando está pronta.',
      'A partir daí, a Telma atende. Vê tudo no painel, em direto.',
    ],
    nextKeep: [
      'Diga à Telma quando a clínica abre e o que faz. São duas respostas no painel.',
      'Ligue-a quando quiser. O painel diz-lhe quando está pronta.',
      'Só então desvie o seu número. Os códigos estão no painel, já preenchidos.',
    ],
    footer:
      'Recebeu este email porque inscreveu a sua clínica na Telma. Se não foi você, responda a esta mensagem e tratamos disso.',
    footerTagline: 'A Telma atende quando ninguém pode.',
    stepsLabel: 'O que acontece a seguir',
    htmlLang: 'pt',
  },
  es: {
    subjectReady: (c) => `${c} está casi lista`,
    subjectPending: (c) => `${c} está casi lista`,
    headingReady: (c) => `${c} está casi lista`,
    headingPending: (c) => `${c} está casi lista`,
    leadReady:
      'Está todo creado. Abajo tiene el resumen de lo que ha contratado y sus accesos al panel.',
    leadPending:
      'El panel ya es suyo y los accesos están abajo. En cuanto se confirme el pago, la línea entra en servicio.',
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
    summaryRenewMonthly: 'Se renueva cada mes por el mismo importe, a partir de hoy.',
    summaryRenewAnnual: 'Se renueva cada año por el mismo importe, a partir de hoy.',
    summaryInvoice: 'Las facturas están siempre en su panel, en Cuenta, y puede descargarlas cuando quiera.',
    summaryNoCommitment: 'Sin permanencia. Puede cancelar cuando quiera desde el panel.',
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
    readySubject: (c) => `El número de ${c} ya está activo`,
    readyHeading: 'Su número ya está activo',
    readyLeadKeep:
      'Ya tenemos el número de Telma. Queda un paso suyo: desviar aquí las llamadas que no pueda atender. Los códigos están en el panel, ya rellenos, en cuanto la active.',
    readyLeadNew:
      'Ya tenemos su número. Es el que puede poner en las tarjetas, en Google y en la puerta. Telma contesta en él en cuanto la active en el panel.',
    readyNumberLabel: 'Su número',
    nextTitle: 'Qué pasa a continuación',
    next: [
      'Dígale a Telma cuándo abre la clínica y qué hace. Son dos respuestas en el panel.',
      'Enciéndala cuando quiera. El panel le dirá cuándo está lista.',
      'A partir de ahí, Telma contesta. Lo ve todo en el panel, en directo.',
    ],
    nextKeep: [
      'Dígale a Telma cuándo abre la clínica y qué hace. Son dos respuestas en el panel.',
      'Enciéndala cuando quiera. El panel le dirá cuándo está lista.',
      'Solo entonces desvíe su número. Los códigos están en el panel, ya rellenos.',
    ],
    footer:
      'Ha recibido este email porque ha dado de alta su clínica en Telma. Si no ha sido usted, responda a este mensaje y lo resolvemos.',
    footerTagline: 'Telma atiende cuando nadie puede.',
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
                  (line, i) => `<td width="33%" style="padding:0 ${i === 2 ? '0' : '14px'} 0 0;vertical-align:top">
                <div style="height:3px;background:${MACAW};border-radius:2px"></div>
                <p style="margin:10px 0 0;font-size:13px;font-weight:600;font-family:${MONO};color:${INK_MUTE}">0${i + 1}</p>
                <p style="margin:4px 0 0;font-size:14px;line-height:1.5;color:${INK}">${escapeHtml(line)}</p>
              </td>`
                )
                .join('\n              ')}
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:30px 24px 26px">
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
    ...(p.temporaryNumber ? t.nextKeep : t.next).map((l, i) => `  ${i + 1}. ${l}`),
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
export async function sendNumberReadyEmail(p: {
  clinicName: string
  email: string
  phoneNumber: string
  /** True when the clinic kept its own number and forwards to this one. */
  forwarding: boolean
  dashboardUrl: string
  locale: OnboardingLocale
}): Promise<EmailResult> {
  const t = emailCopy(p.locale)
  const subject = t.readySubject(p.clinicName)
  const lead = p.forwarding ? t.readyLeadKeep : t.readyLeadNew

  const html = `<!doctype html>
<html lang="${t.htmlLang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(p.clinicName)}</title></head>
<body style="margin:0;padding:0;background:${SUNKEN};font-family:${SANS};color:${INK};-webkit-font-smoothing:antialiased">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(lead)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SUNKEN}">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid ${LINE};border-radius:12px;overflow:hidden">
        <tr><td style="background:${INK};padding:0;font-size:0;line-height:0">
          <img src="https://app.telmaatende.com/brand/telma-lockup.png" width="240" height="56" alt="Telma"
               style="display:block;border:0;width:240px;height:56px;max-width:240px">
        </td></tr>
        <tr><td style="background:${MACAW};font-size:0;line-height:0;height:3px">&nbsp;</td></tr>
        <tr><td style="padding:32px 24px">
          <h1 style="margin:0 0 12px;font-size:25px;line-height:1.25;font-weight:600;letter-spacing:-0.02em;color:${INK}">${escapeHtml(t.readyHeading)}</h1>
          <p style="margin:0 0 26px;font-size:16px;line-height:1.6;color:${INK_SOFT}">${escapeHtml(lead)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:12px">
            <tr><td style="padding:18px 20px">
              <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${INK_MUTE}">${escapeHtml(t.readyNumberLabel)}</p>
              <p style="margin:6px 0 0;font-size:22px;font-weight:600;color:${INK}">${escapeHtml(p.phoneNumber)}</p>
            </td></tr>
          </table>
          <p style="margin:24px 0 0">
            <a href="${escapeHtml(p.dashboardUrl)}"
               style="display:inline-block;background:${INK};color:#FFFFFF;text-decoration:none;padding:13px 24px;border-radius:8px;font-size:16px;font-weight:500">${escapeHtml(t.openPanel)}</a>
          </p>
        </td></tr>
        <tr><td style="padding:0 24px"><div style="height:1px;background:${LINE}"></div></td></tr>
        <tr><td style="padding:18px 24px 24px">
          <p style="margin:0;font-size:13px;line-height:1.6;color:${INK_MUTE}">${escapeHtml(t.footer)}</p>
          <p style="margin:10px 0 0;font-size:13px;color:${INK_MUTE}">Telma, de Bweb Studio</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const text = [t.readyHeading, '', lead, '', `${t.readyNumberLabel}: ${p.phoneNumber}`, '', p.dashboardUrl].join('\n')

  return send({ to: p.email, subject, html, text })
}
