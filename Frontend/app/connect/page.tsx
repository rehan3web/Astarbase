'use client'

import { AppLayout } from '@/components/layouts/AppLayout'
import { ConnectDbView } from '@/components/interfaces/ConnectDbView'

export default function ConnectPage() {
  return (
    <AppLayout headerTitle="ConnectDb">
      <ConnectDbView />
    </AppLayout>
  )
}
