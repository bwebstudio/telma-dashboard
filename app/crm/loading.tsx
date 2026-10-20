import { PageSkeleton } from '@/components/PageSkeleton'

// Shown the instant a link is clicked, while the server reads the next screen.
// See components/PageSkeleton for why this file exists at all.
export default function Loading() {
  return <PageSkeleton />
}
