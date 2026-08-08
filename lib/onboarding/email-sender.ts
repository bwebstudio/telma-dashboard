import { copyFor } from './copy'
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
  /** True when the number is a placeholder while porting completes. */
  temporaryNumber: boolean
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
      'Número temporário. Avisamos assim que a portabilidade do seu número estiver concluída.',
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
      'Número temporal. Le avisamos en cuanto la portabilidad de su número esté terminada.',
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
const FROM = process.env.ONBOARDING_EMAIL_FROM || 'Telma <ola@telmaatende.com>'

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
function welcomeHtml(p: WelcomeEmail): string {
  const t = emailCopy(p.locale)
  const numberNote = p.temporaryNumber
    ? `<p style="margin:8px 0 0;font-size:14px;color:#5F6B66">${escapeHtml(t.numberTemp)}</p>`
    : ''

  return `<!doctype html>
<html lang="${t.htmlLang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(p.clinicName)}</title></head>
<body style="margin:0;padding:32px 16px;background:#FCFCFA;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111827">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto">
    <tr><td>
      <p style="margin:0 0 28px;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:#3E7B73">Telma</p>

      <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;font-weight:600;letter-spacing:-0.02em">${
        p.pendingPayment
          ? escapeHtml(t.headingPending(p.clinicName))
          : escapeHtml(t.headingReady(p.clinicName))
      }</h1>
      <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#4B5563">
        ${
          escapeHtml(p.pendingPayment ? t.leadPending : t.leadReady)
        }
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E7EAE8;border-radius:12px;background:#FFFFFF">
        <tr><td style="padding:20px 22px">
          <p style="margin:0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#5F6B66">${escapeHtml(t.numberLabel)}</p>
          <p style="margin:6px 0 0;font-size:22px;font-weight:600">${escapeHtml(p.phoneNumber)}</p>
          ${numberNote}
        </td></tr>
        <tr><td style="padding:0 22px"><div style="height:1px;background:#E7EAE8"></div></td></tr>
        <tr><td style="padding:20px 22px">
          <p style="margin:0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#5F6B66">${escapeHtml(t.accessLabel)}</p>
          <p style="margin:6px 0 0;font-size:16px">${escapeHtml(p.email)}</p>
          <p style="margin:4px 0 0;font-size:16px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${escapeHtml(
            p.password
          )}</p>
          <p style="margin:8px 0 0;font-size:14px;color:#5F6B66">${escapeHtml(t.passwordNote)}</p>
        </td></tr>
      </table>

      <p style="margin:28px 0">
        <a href="${escapeHtml(
          p.dashboardUrl
        )}" style="display:inline-block;background:#183C37;color:#FFFFFF;text-decoration:none;padding:14px 26px;border-radius:999px;font-size:16px;font-weight:500">${escapeHtml(t.openPanel)}</a>
      </p>

      <h2 style="margin:32px 0 10px;font-size:17px;font-weight:600">${escapeHtml(t.nextTitle)}</h2>
      <ol style="margin:0;padding-left:20px;font-size:16px;line-height:1.7;color:#4B5563">
        ${t.next.map((l) => `<li>${escapeHtml(l)}</li>`).join('\n        ')}
      </ol>

      <div style="height:1px;background:#E7EAE8;margin:36px 0 16px"></div>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#5F6B66">
        ${escapeHtml(t.footer)}
      </p>
    </td></tr>
  </table>
</body></html>`
}

function welcomeText(p: WelcomeEmail): string {
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
