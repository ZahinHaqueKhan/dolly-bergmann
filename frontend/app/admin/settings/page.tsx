export const dynamic = 'force-dynamic'

export default function AdminSettingsPage() {
  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-serif text-stone-800">Settings</h1>
      </div>
      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <p className="text-stone-600">
          Store settings (general info, payment provider, email, tax) will live here in a
          later phase. For now this page is a placeholder.
        </p>
      </div>
    </>
  )
}
