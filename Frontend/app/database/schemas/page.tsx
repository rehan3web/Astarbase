'use client'
import { AppLayout } from '@/components/layouts/AppLayout'
import { SchemaVisualizerView } from '@/components/visualizer/SchemaVisualizerView'
export default function Schemas() { return <AppLayout headerTitle="Database Schemas"><SchemaVisualizerView /></AppLayout> }
