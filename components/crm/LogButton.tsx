'use client'

import { useState } from 'react'
import type { CrmStrings } from '@/lib/crm/strings'
import { LogSheet } from './LogSheet'

// The fixed "log a call" button on a clinic record. It sits above the bottom
// tab bar, always within thumb reach, and never scrolls out of view.
export function LogButton({
  prospectId,
  prospectName,
  strings,
}: {
  prospectId: string
  prospectName: string
  strings: CrmStrings
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="fixed inset-x-0 bottom-[3.5rem] z-20 px-4 pb-3 md:static md:px-0 md:pb-0">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-[3.5rem] w-full items-center justify-center rounded-2xl bg-brand text-lg font-semibold text-white shadow-lg shadow-ink/10 transition-colors hover:bg-brand-hover md:w-auto md:px-8 md:shadow-none"
        >
          {strings.logCall}
        </button>
      </div>
      {open && (
        <LogSheet
          prospectId={prospectId}
          prospectName={prospectName}
          strings={strings}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
