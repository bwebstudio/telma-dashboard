#!/usr/bin/env node
//
// Writes the welcome email to a file so it can be looked at in a browser.
//
//   npx tsx scripts/email-preview.mjs        # las cuatro variantes
//   open /tmp/telma-email/es-keep.html
//
// It sends nothing and touches no database. It exists because the only other
// way to see this email was to sign a clinic up, pay with a test card and wait
// for Resend, which is four minutes per punctuation change.
//
// The logotype loads from app.telmaatende.com, so it only appears once that is
// deployed. Everything else renders offline.

import { mkdirSync, writeFileSync } from 'node:fs'
import { welcomeHtml, welcomeText, numberReadyHtml } from '../lib/onboarding/email-sender.ts'

const OUT = '/tmp/telma-email'
mkdirSync(OUT, { recursive: true })

// O resumo que o alta calcula a partir dos preços reais da Stripe. Aqui vai
// escrito à mão, porque esta previsualização não fala com a Stripe.
const summary = {
  planName: 'Clínica',
  cycle: 'monthly',
  lines: [
    { label: 'Clínica', amount: 24900 },
    { label: 'WhatsApp', amount: 4900 },
  ],
  subtotal: 29800,
  taxPercentage: 0,
  taxAmount: 0,
  total: 29800,
  currency: 'EUR',
}

const base = {
  summary,
  clinicName: 'Clínica Miranda',
  email: 'ola@clinicamiranda.pt',
  password: 'Telma-4812-Rx',
  dashboardUrl: 'https://app.telmaatende.com',
  pendingPayment: false,
}

const variants = [
  { name: 'pt-desvio-no-atendidas', locale: 'pt', phoneNumber: '+351 300 500 900', ownNumber: '+351 220 123 456', temporaryNumber: true, forwardType: 'no_answer' },
  { name: 'pt-desvio-todas', locale: 'pt', phoneNumber: '+351 300 500 900', ownNumber: '+351 220 123 456', temporaryNumber: true, forwardType: 'all' },
  { name: 'es-desvio-no-atendidas', locale: 'es', phoneNumber: '+34 910 555 020', ownNumber: '+34 663 886 113', temporaryNumber: true, forwardType: 'no_answer' },
  { name: 'es-pendiente-numero', locale: 'es', phoneNumber: null, ownNumber: '+34 663 886 113', temporaryNumber: true, forwardType: 'no_answer' },
  { name: 'es-numero-nuevo', locale: 'es', phoneNumber: '+34 910 000 000', temporaryNumber: false },
  { name: 'es-pago-pendiente', locale: 'es', phoneNumber: '+34 910 000 000', temporaryNumber: false, pendingPayment: true },
]

for (const v of variants) {
  const p = { ...base, ...v }
  writeFileSync(`${OUT}/${v.name}.html`, welcomeHtml(p))
  writeFileSync(`${OUT}/${v.name}.txt`, welcomeText(p))
  console.log(`  ${OUT}/${v.name}.html`)
}
// O segundo email, que chega dias depois com a linha pronta.
for (const v of [
  { name: 'es-activo-desvio', locale: 'es', forwarding: true, phoneNumber: '+34 910 555 020' },
  { name: 'es-activo-numero-novo', locale: 'es', forwarding: false, phoneNumber: '+34 910 555 020' },
  { name: 'pt-activo-desvio', locale: 'pt', forwarding: true, phoneNumber: '+351 300 602 615' },
]) {
  writeFileSync(
    `${OUT}/${v.name}.html`,
    numberReadyHtml({
      clinicName: 'Clínica Miranda',
      phoneNumber: v.phoneNumber,
      forwarding: v.forwarding,
      dashboardUrl: 'https://app.telmaatende.com',
      locale: v.locale,
    })
  )
  console.log(`  ${OUT}/${v.name}.html`)
}

console.log(`\n  open ${OUT}`)
