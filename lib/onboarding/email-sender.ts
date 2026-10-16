import { copyFor } from './copy'
import { FORWARD_UNDO, forwardCodes, type ForwardType } from '../forwarding'
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
  /** E.164, as it will be dialled. */
  phoneNumber: string
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
  forwardTitle: string
  forwardLead: string
  forwardLabelAll: string
  forwardLabelNoAnswer: string
  forwardLabelBusy: string
  forwardLabelUnreachable: string
  forwardUndo: string
  forwardFixed: string
  accessLabel: string
  passwordNote: string
  openPanel: string
  nextTitle: string
  next: string[]
  footer: string
  htmlLang: string
}

const EMAIL: Record<OnboardingLocale, EmailCopy> = {
  pt: {
    subjectReady: (c) => `A Telma já atende a ${c}`,
    subjectPending: (c) => `A ${c} está quase pronta`,
    headingReady: (c) => `A Telma já atende a ${c}`,
    headingPending: (c) => `A ${c} está quase pronta`,
    leadReady:
      'Está tudo criado. Abaixo ficam o número que a Telma passa a atender e os seus acessos ao painel.',
    leadPending:
      'O painel já é seu e os acessos estão abaixo. Assim que o pagamento for confirmado, a linha entra ao serviço.',
    numberLabel: 'O número que a Telma atende',
    numberTemp:
      'O seu número de sempre fica onde está, na sua operadora. Basta desviá-lo para este.',
    forwardTitle: 'Desviar o seu número, em cinco minutos',
    forwardLead:
      'Marque o código no telefone da clínica, uma vez. Não corta o serviço e desfaz-se quando quiser.',
    forwardLabelAll: 'Todas as chamadas',
    forwardLabelNoAnswer: 'Quando ninguém atende',
    forwardLabelBusy: 'Quando está ocupado',
    forwardLabelUnreachable: 'Quando está sem rede',
    forwardUndo: `Para desfazer, marque ${FORWARD_UNDO} e tudo volta ao que era.`,
    forwardFixed:
      'Se o número é fixo, o desvio pede-se à operadora ou faz-se na área de cliente. Responda a este email e tratamos disso consigo.',
    accessLabel: 'Os seus acessos',
    passwordNote: 'Palavra-passe temporária. Mude-a assim que entrar.',
    openPanel: 'Abrir o painel',
    nextTitle: 'O que acontece a seguir',
    next: [
      'Confirmamos a configuração e ligamos a voz ao seu número.',
      'Fazemos uma chamada de teste consigo, para ouvir como soa.',
      'A partir daí, a Telma atende. Vê tudo no painel, em direto.',
    ],
    footer:
      'Recebeu este email porque inscreveu a sua clínica na Telma. Se não foi você, responda a esta mensagem e tratamos disso.',
    htmlLang: 'pt',
  },
  es: {
    subjectReady: (c) => `Telma ya contesta en ${c}`,
    subjectPending: (c) => `${c} está casi lista`,
    headingReady: (c) => `Telma ya contesta en ${c}`,
    headingPending: (c) => `${c} está casi lista`,
    leadReady:
      'Está todo creado. Abajo tiene el número que pasa a contestar Telma y sus accesos al panel.',
    leadPending:
      'El panel ya es suyo y los accesos están abajo. En cuanto se confirme el pago, la línea entra en servicio.',
    numberLabel: 'El número que contesta Telma',
    numberTemp:
      'Su número de siempre se queda donde está, en su operadora. Solo hay que desviarlo a este.',
    forwardTitle: 'Desviar su número, en cinco minutos',
    forwardLead:
      'Marque el código en el teléfono de la clínica, una vez. No corta el servicio y se deshace cuando quiera.',
    forwardLabelAll: 'Todas las llamadas',
    forwardLabelNoAnswer: 'Cuando no contesta nadie',
    forwardLabelBusy: 'Cuando comunica',
    forwardLabelUnreachable: 'Cuando está sin cobertura',
    forwardUndo: `Para deshacerlo, marque ${FORWARD_UNDO} y todo vuelve a como estaba.`,
    forwardFixed:
      'Si el número es fijo, el desvío se pide a la operadora o se hace en el área de cliente. Responda a este email y lo vemos con usted.',
    accessLabel: 'Sus accesos',
    passwordNote: 'Contraseña temporal. Cámbiela en cuanto entre.',
    openPanel: 'Abrir el panel',
    nextTitle: 'Qué pasa a continuación',
    next: [
      'Confirmamos la configuración y conectamos la voz a su número.',
      'Hacemos una llamada de prueba con usted, para oír cómo suena.',
      'A partir de ahí, Telma contesta. Lo ve todo en el panel, en directo.',
    ],
    footer:
      'Ha recibido este email porque ha dado de alta su clínica en Telma. Si no ha sido usted, responda a este mensaje y lo resolvemos.',
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
        `  │ Número:   ${payload.phoneNumber}${payload.temporaryNumber ? ' (temporário)' : ''}`,
        `  │ Acesso:   ${payload.email}`,
        `  │ Password: ${payload.password}`,
        `  │ Painel:   ${payload.dashboardUrl}`,
        '  └─────────────────────────────────────────────────────────────',
        '',
      ].join('\n')
    )
    return { sent: true, via: 'log' }
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
        to: [payload.email],
        reply_to: REPLY_TO,
        subject,
        html: welcomeHtml(payload),
        text: welcomeText(payload),
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
/** The codes, from the one file that holds them, paired with this email's
 *  own words for them. */
function codeLines(p: WelcomeEmail, t: EmailCopy): { label: string; code: string }[] {
  const label: Record<string, string> = {
    all: t.forwardLabelAll,
    noAnswer: t.forwardLabelNoAnswer,
    busy: t.forwardLabelBusy,
    unreachable: t.forwardLabelUnreachable,
  }
  return forwardCodes(p.phoneNumber, p.forwardType).map((c) => ({
    label: label[c.id] ?? c.id,
    code: c.code,
  }))
}

const INK = '#111111'
const INK_SOFT = '#525252'
const INK_MUTE = '#706E6E'
const LINE = '#E7EAE8'
const SUNKEN = '#F5F5F3'
const MACAW = '#D9EE50'
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"

export function welcomeHtml(p: WelcomeEmail): string {
  const t = emailCopy(p.locale)
  const lead = p.pendingPayment ? t.leadPending : t.leadReady

  // The forwarding block only exists for a clinic that kept its own number.
  // For one that bought a new number there is nothing to forward, and a set of
  // codes it must not dial is worse than no block at all.
  const forwarding = p.temporaryNumber
    ? `
      <h2 style="margin:36px 0 6px;font-size:17px;font-weight:600;color:${INK}">${escapeHtml(t.forwardTitle)}</h2>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK_SOFT}">${escapeHtml(t.forwardLead)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:12px;background:${SUNKEN}">
        ${codeLines(p, t)
          .map(
            (c, i) => `<tr><td style="padding:${i ? '10px' : '16px'} 18px ${i === 0 ? '10px' : '10px'}">
          <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${INK_MUTE}">${escapeHtml(c.label)}</p>
          <p style="margin:4px 0 0;font-size:19px;font-weight:600;font-family:${MONO};color:${INK}">${escapeHtml(c.code)}</p>
        </td></tr>`
          )
          .join('\n        ')}
        <tr><td style="padding:4px 18px 16px">
          <p style="margin:0;font-size:13px;line-height:1.6;color:${INK_MUTE}">${escapeHtml(t.forwardUndo)}</p>
        </td></tr>
      </table>
      <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:${INK_MUTE}">${escapeHtml(t.forwardFixed)}</p>`
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
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid ${LINE};border-radius:12px;overflow:hidden">

        <tr><td style="background:${INK};padding:0;font-size:0;line-height:0">
          <img src="https://app.telmaatende.com/brand/telma-lockup.png" width="240" height="56" alt="Telma"
               style="display:block;border:0;width:240px;height:56px;max-width:240px">
        </td></tr>
        <tr><td style="background:${MACAW};font-size:0;line-height:0;height:3px">&nbsp;</td></tr>

        <tr><td style="padding:32px 24px">
          <h1 style="margin:0 0 12px;font-size:25px;line-height:1.25;font-weight:600;letter-spacing:-0.02em;color:${INK}">${
            p.pendingPayment
              ? escapeHtml(t.headingPending(p.clinicName))
              : escapeHtml(t.headingReady(p.clinicName))
          }</h1>
          <p style="margin:0 0 26px;font-size:16px;line-height:1.6;color:${INK_SOFT}">${escapeHtml(lead)}</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:12px">
            <tr><td style="padding:18px 20px">
              <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${INK_MUTE}">${escapeHtml(t.numberLabel)}</p>
              <p style="margin:6px 0 0;font-size:22px;font-weight:600;color:${INK}">${escapeHtml(p.phoneNumber)}</p>
              ${
                p.temporaryNumber
                  ? `<p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:${INK_MUTE}">${escapeHtml(t.numberTemp)}</p>`
                  : ''
              }
            </td></tr>
            <tr><td style="padding:0 20px"><div style="height:1px;background:${LINE}"></div></td></tr>
            <tr><td style="padding:18px 20px">
              <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${INK_MUTE}">${escapeHtml(t.accessLabel)}</p>
              <p style="margin:6px 0 0;font-size:16px;color:${INK}">${escapeHtml(p.email)}</p>
              <p style="margin:4px 0 0;font-size:17px;font-weight:600;font-family:${MONO};color:${INK}">${escapeHtml(p.password)}</p>
              <p style="margin:8px 0 0;font-size:14px;color:${INK_MUTE}">${escapeHtml(t.passwordNote)}</p>
            </td></tr>
          </table>

          <p style="margin:24px 0 0">
            <a href="${escapeHtml(p.dashboardUrl)}"
               style="display:inline-block;background:${INK};color:#FFFFFF;text-decoration:none;padding:13px 24px;border-radius:8px;font-size:16px;font-weight:500">${escapeHtml(t.openPanel)}</a>
          </p>
${forwarding}

          <h2 style="margin:36px 0 10px;font-size:17px;font-weight:600;color:${INK}">${escapeHtml(t.nextTitle)}</h2>
          <ol style="margin:0;padding-left:20px;font-size:16px;line-height:1.7;color:${INK_SOFT}">
            ${t.next.map((l) => `<li>${escapeHtml(l)}</li>`).join('\n            ')}
          </ol>
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
}

export function welcomeText(p: WelcomeEmail): string {
  const t = emailCopy(p.locale)
  return [
    p.pendingPayment ? t.headingPending(p.clinicName) : t.headingReady(p.clinicName),
    '',
    `${t.numberLabel}: ${p.phoneNumber}`,
    ...(p.temporaryNumber ? [`  ${t.numberTemp}`] : []),
    '',
    `${t.accessLabel}:`,
    `  ${p.email}`,
    `  ${p.password}`,
    `  ${t.passwordNote}`,
    `  ${p.dashboardUrl}`,
    '',
    ...(p.temporaryNumber
      ? [
          '',
          `${t.forwardTitle}:`,
          `  ${t.forwardLead}`,
          ...codeLines(p, t).map((c) => `  ${c.label}: ${c.code}`),
          `  ${t.forwardUndo}`,
          `  ${t.forwardFixed}`,
        ]
      : []),
    '',
    `${t.nextTitle}:`,
    ...t.next.map((l, i) => `  ${i + 1}. ${l}`),
  ].join('\n')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
