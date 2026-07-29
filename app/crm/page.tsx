import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// The CRM has no landing page: a rep opens the app and is already on today's
// calls. The layout above enforces the role check.
export default function CrmIndex() {
  redirect('/crm/hoje')
}
