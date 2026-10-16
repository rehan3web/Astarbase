'use client'
import { Suspense } from 'react'
import { AppLayout } from '@/components/layouts/AppLayout'
import { PoliciesPageView } from '@/components/policies/PoliciesPageView'
export default function Policies() { return <AppLayout headerTitle="Policies"><Suspense fallback={<div className="flex-1 p-8 text-sm text-foreground-lighter">Loading policies…</div>}><PoliciesPageView /></Suspense></AppLayout> }
