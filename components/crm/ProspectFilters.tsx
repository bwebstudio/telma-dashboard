import type { Dictionary } from '@/content'
import { CRM_COUNTRIES, CRM_STAGES, type CrmRep } from '@/lib/crm/types'
import type { ProspectFilters as Filters } from '@/lib/crm/data'
import { IconSearch } from '@/components/icons'

// A plain GET form: no client JavaScript, no state to keep in sync, and the
// filtered view is a shareable URL that the export button can reuse verbatim.
// On a phone only the search box shows; the rest sits behind a native
// disclosure so nothing competes with the list for space.
export function ProspectFilters({
  filters,
  reps,
  isAdmin,
  showMine,
  dict,
}: {
  filters: Filters
  reps: CrmRep[]
  isAdmin: boolean
  /** True for anyone who carries prospects of their own, admin or not. */
  showMine: boolean
  dict: Dictionary
}) {
  const t = dict.crm

  return (
    <form method="GET" className="mb-5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute">
            <IconSearch className="h-5 w-5" />
          </span>
          <input
            name="q"
            defaultValue={filters.q}
            placeholder={t.list.searchPlaceholder}
            aria-label={dict.common.search}
            className="field-input min-h-[3rem] pl-10"
          />
        </div>
        <button type="submit" className="btn-secondary min-h-[3rem]">
          {dict.common.search}
        </button>
      </div>

      <details className="mt-2 rounded-2xl border border-line bg-surface-sunken px-4 py-3">
        <summary className="cursor-pointer text-base font-medium text-ink-soft">
          {t.list.filters}
        </summary>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isAdmin && (
            <Field id="rep" label={t.list.filterRep}>
              <select id="rep" name="rep" defaultValue={filters.rep} className="field-input">
                <option value="">{dict.common.all}</option>
                <option value="none">{t.list.unassigned}</option>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.full_name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field id="country" label={t.list.filterCountry}>
            <select
              id="country"
              name="country"
              defaultValue={filters.country}
              className="field-input"
            >
              <option value="">{dict.common.all}</option>
              {CRM_COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {t.country[c]}
                </option>
              ))}
            </select>
          </Field>

          <Field id="stage" label={t.list.filterStage}>
            <select id="stage" name="stage" defaultValue={filters.stage} className="field-input">
              <option value="">{dict.common.all}</option>
              {CRM_STAGES.map((s) => (
                <option key={s} value={s}>
                  {t.stage[s]}
                </option>
              ))}
            </select>
          </Field>

          <Field id="origin" label={t.list.filterOrigin}>
            <select id="origin" name="origin" defaultValue={filters.origin} className="field-input">
              <option value="">{dict.common.all}</option>
              <option value="referral">{t.list.referredOnly}</option>
              <option value="cold">{t.list.coldOnly}</option>
            </select>
          </Field>

          <Field id="from" label={t.list.filterFrom}>
            <input
              id="from"
              type="date"
              name="from"
              defaultValue={filters.from}
              className="field-input"
            />
          </Field>

          <Field id="to" label={t.list.filterTo}>
            <input id="to" type="date" name="to" defaultValue={filters.to} className="field-input" />
          </Field>

          {showMine && (
            <label className="flex min-h-[2.75rem] items-center gap-3 sm:pt-7">
              <input
                type="checkbox"
                name="mine"
                value="1"
                defaultChecked={filters.mine}
                className="h-5 w-5 accent-brand"
              />
              <span className="text-base text-ink">{t.list.mine}</span>
            </label>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button type="submit" className="btn-primary">
            {t.list.apply}
          </button>
          <a href="?" className="btn-ghost">
            {t.list.clear}
          </a>
        </div>
      </details>
    </form>
  )
}

function Field({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
    </div>
  )
}
