import { redirect } from 'next/navigation'
import { getAppUser } from '@/lib/auth'
import { homePathFor } from '@/lib/access'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const user = await getAppUser()
  if (!user) redirect('/login')
  redirect(homePathFor(user))
}
