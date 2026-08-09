'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import type { Dictionary } from '@/content'
import { setNewPassword, type NewPasswordState } from '@/app/nova-palavra-passe/actions'

function SubmitButton({ dict }: { dict: Dictionary }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn-primary mt-2 w-full" disabled={pending}>
      {pending ? dict.auth.newSaving : dict.auth.newSave}
    </button>
  )
}

export function NewPasswordForm({ dict }: { dict: Dictionary }) {
  const [state, formAction] = useActionState<NewPasswordState, FormData>(setNewPassword, {
    error: null,
  })

  const message =
    state.error === 'short'
      ? dict.auth.newTooShort
      : state.error === 'mismatch'
        ? dict.auth.newMismatch
        : state.error === 'expired'
          ? dict.auth.newExpired
          : null

  return (
    <form action={formAction} className="mt-5 flex flex-col gap-4">
      <div>
        <label htmlFor="password" className="field-label">
          {dict.auth.newPassword}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="field-input"
        />
      </div>
      <div>
        <label htmlFor="repeat" className="field-label">
          {dict.auth.newRepeat}
        </label>
        <input
          id="repeat"
          name="repeat"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="field-input"
        />
      </div>
      {message && (
        <p role="alert" className="text-sm font-medium text-danger">
          {message}
        </p>
      )}
      <SubmitButton dict={dict} />
    </form>
  )
}
