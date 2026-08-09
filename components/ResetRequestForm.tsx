'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import type { Dictionary } from '@/content'
import { requestReset, type ResetState } from '@/app/recuperar/actions'

function SubmitButton({ dict }: { dict: Dictionary }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn-primary mt-2 w-full" disabled={pending}>
      {pending ? dict.auth.resetSending : dict.auth.resetSend}
    </button>
  )
}

export function ResetRequestForm({ dict }: { dict: Dictionary }) {
  const [state, formAction] = useActionState<ResetState, FormData>(requestReset, {
    sent: false,
  })

  // Once sent, the form goes away. Leaving it there invites a second and a
  // third press, and every one of those spends a rate limit that the person
  // will need in a minute when the first mail turns up.
  if (state.sent) {
    return (
      <p role="status" className="mt-5 rounded-card border border-line bg-surface-sunken p-4 text-base text-ink-soft">
        {dict.auth.resetSent}
      </p>
    )
  }

  return (
    <form action={formAction} className="mt-5 flex flex-col gap-4">
      <div>
        <label htmlFor="email" className="field-label">
          {dict.auth.email}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="field-input"
        />
      </div>
      <SubmitButton dict={dict} />
    </form>
  )
}
