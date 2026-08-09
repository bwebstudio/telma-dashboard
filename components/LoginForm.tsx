'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import type { Dictionary } from '@/content'
import { signIn, type SignInState } from '@/app/login/actions'

function SubmitButton({ dict }: { dict: Dictionary }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn-primary mt-2 w-full" disabled={pending}>
      {pending ? dict.auth.signingIn : dict.auth.signIn}
    </button>
  )
}

export function LoginForm({ dict }: { dict: Dictionary }) {
  const [state, formAction] = useActionState<SignInState, FormData>(signIn, {
    error: false,
  })

  return (
    <form action={formAction} className="flex flex-col gap-4">
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
      <div>
        <label htmlFor="password" className="field-label">
          {dict.auth.password}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="field-input"
        />
      </div>

      {state.error && (
        <p role="alert" className="text-base font-medium text-danger">
          {dict.auth.invalid}
        </p>
      )}

      <SubmitButton dict={dict} />
      {/* Under the button, not beside the field: it is read by somebody who has
          already tried and failed, and that is where their eye ends up. */}
      <p className="text-center text-sm">
        <a href="/recuperar" className="text-ink-soft hover:text-brand-accent">
          {dict.auth.forgot}
        </a>
      </p>
    </form>
  )
}
