'use client'

import { AppLayout } from '@/components/layouts/AppLayout'
import { SchemaVisualizerView } from '@/components/visualizer/SchemaVisualizerView'

export default function VisualizerPage() {
  return (
    <AppLayout headerTitle="Schema Visualizer">
      <SchemaVisualizerView />
    </AppLayout>
  )
}
