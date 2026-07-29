import { redirect } from 'next/navigation'
import { getAppUser, resolveHomePath } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const user = await getAppUser()
  if (!user) redirect('/login')
  redirect(await resolveHomePath(user))
}
