import { adminGet } from '@/lib/server-fetch'
import ImportClient from './ImportClient'

export const dynamic = 'force-dynamic'

export default async function ImportPage() {
  // Pre-warm the auth gate on the server so the client component starts
  // knowing it's logged in as admin.
  await adminGet<unknown>('/api/admin/dashboard').catch(() => null)
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-serif text-stone-800">Import products</h1>
          <p className="text-stone-500 mt-1 text-sm">
            Bulk-load products from a JSON file. Schema v1: top-level
            <code className="mx-1 px-1 bg-stone-100 rounded text-xs">{`{schema_version: 1, products: [...]}`}</code>.
          </p>
        </div>
      </div>
      <ImportClient />
    </>
  )
}
