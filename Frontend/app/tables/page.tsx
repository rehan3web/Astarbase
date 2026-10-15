'use client'

import { AppLayout } from '@/components/layouts/AppLayout'
import { TableEditorView } from '@/components/table/TableEditorView'

export default function TablesPage() {
  return (
    <AppLayout headerTitle="Table Editor">
      <TableEditorView />
    </AppLayout>
  )
}
