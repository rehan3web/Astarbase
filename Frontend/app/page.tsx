'use client'
import Link from 'next/link'
import { AppLayout } from '@/components/layouts/AppLayout'
import { useStudio } from '@/components/providers/StudioProvider'
export default function HomePage() {
  const { database, branches, settings } = useStudio()
  return <AppLayout headerTitle="Home"><div className="p-8 space-y-6"><h1 className="text-2xl font-semibold">{settings?.projectName}</h1><p className="text-foreground-lighter text-sm">Connected to <code>{database}</code>. {branches.length} managed databases. All displayed database results come from your backend.</p><div className="flex flex-wrap gap-4">{[['/tables','Table editor'],['/sql','SQL runner'],['/branches','Branches'],['/visualizer','Schema visualizer'],['/settings','Admin settings']].map(([url,title]) => <Link key={url} href={url} className="border border-default rounded-lg p-6 hover:bg-surface-100">{title}</Link>)}</div></div></AppLayout>
}
