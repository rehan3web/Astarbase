'use client'

import { AppLayout } from '@/components/layouts/AppLayout'
import { BranchesPageView } from '@/components/branches/BranchesPageView'

export default function BranchesPage() {
  return (
    <AppLayout headerTitle="Branches">
      <BranchesPageView />
    </AppLayout>
  )
}
