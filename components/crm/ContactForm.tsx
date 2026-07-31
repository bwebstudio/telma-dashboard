import type { Dictionary } from '@/content'
import { CRM_CONTACT_ROLES } from '@/lib/crm/types'
import { addContact } from '@/lib/actions/crm'

// Adding a contact is rare compared to logging a call, so it stays folded
// away behind a native disclosure and costs nothing when it is not needed.
// A plain server action form: no client bundle for this.
export function ContactForm({
  prospectId,
  dict,
}: {
  prospectId: string
  dict: Dictionary
}) {
  const t = dict.crm

  return (
    <details className="mt-3 rounded-2xl border border-line bg-surface-sunken px-4 py-3">
      <summary className="cursor-pointer text-base font-medium text-ink-soft">
        {t.detail.addContact}
      </summary>
      <form action={addContact} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="prospect_id" value={prospectId} />
        <div>
          <label htmlFor="contact-name" className="field-label">
            {t.detail.contactName}
          </label>
          <input
            id="contact-name"
            name="name"
            required
            className="field-input min-h-[3rem]"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="contact-role" className="field-label">
              {t.detail.contactRole}
            </label>
            <select
              id="contact-role"
              name="role"
              defaultValue="reception"
              className="field-input min-h-[3rem]"
            >
              {CRM_CONTACT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t.contactRole[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="contact-phone" className="field-label">
              {t.detail.contactPhone}
            </label>
            <input
              id="contact-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              className="field-input min-h-[3rem]"
            />
          </div>
        </div>
        <div>
          <label htmlFor="contact-notes" className="field-label">
            {t.detail.contactNotes}
          </label>
          <textarea
            id="contact-notes"
            name="notes"
            rows={2}
            className="w-full rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-base text-ink focus:border-brand"
          />
        </div>
        <button type="submit" className="btn-primary min-h-[3rem] self-start">
          {dict.common.save}
        </button>
      </form>
    </details>
  )
}
