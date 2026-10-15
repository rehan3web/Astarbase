'use client'

import { AppLayout } from '@/components/layouts/AppLayout'
import { SqlEditorView } from '@/components/sql/SqlEditorView'

export default function SqlEditorRoutePage() {
  return (
    <AppLayout headerTitle="SQL Editor">
      <SqlEditorView />
    </AppLayout>
  )
}
