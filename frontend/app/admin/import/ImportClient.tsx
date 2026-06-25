'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { adminClientPost, AdminClientError } from '@/lib/admin-client'

interface PreviewError {
  row_number: number
  field: string
  message: string
}

interface PreviewCategory {
  name: string
  slug: string
}

interface PreviewResponse {
  job_id: string
  status: string
  schema_version: number
  total_products: number
  would_create: number
  would_update: number
  categories_to_create: PreviewCategory[]
  row_errors: PreviewError[]
}

interface JobStatus {
  job_id: string
  status: 'pending' | 'processing' | 'completed' | 'completed_with_errors' | 'failed'
  schema_version: number
  total_products: number
  imported_count: number
  would_create: number
  would_update: number
  categories_to_create: PreviewCategory[]
  row_errors: PreviewError[]
  import_errors: string[]
  created_at: string | null
  completed_at: string | null
}

type Stage = 'idle' | 'previewing' | 'preview' | 'confirming' | 'done' | 'error'

export default function ImportClient() {
  const [stage, setStage] = useState<Stage>('idle')
  const [filename, setFilename] = useState<string>('')
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [job, setJob] = useState<JobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const readFile = useCallback(async (file: File) => {
    setFilename(file.name)
    setStage('previewing')
    setError(null)
    setPreview(null)
    setJob(null)
    let json: unknown
    try {
      const text = await file.text()
      json = JSON.parse(text)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid JSON'
      setError(`Could not parse JSON: ${msg}`)
      setStage('error')
      return
    }
    try {
      const result = await adminClientPost<PreviewResponse>(
        '/api/admin/products/import/preview',
        json,
      )
      setPreview(result)
      setStage('preview')
    } catch (e) {
      const msg = e instanceof AdminClientError ? e.message : String(e)
      setError(msg)
      setStage('error')
    }
  }, [])

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return
      void readFile(files[0])
    },
    [readFile],
  )

  const handleConfirm = useCallback(async () => {
    if (!preview) return
    setStage('confirming')
    setError(null)
    try {
      const result = await adminClientPost<JobStatus>(
        '/api/admin/products/import/confirm',
        { job_id: preview.job_id },
      )
      setJob(result)
      // If it's still pending/processing, start polling
      if (result.status === 'pending' || result.status === 'processing') {
        startPolling(result.job_id)
      } else {
        setStage('done')
      }
    } catch (e) {
      const msg = e instanceof AdminClientError ? e.message : String(e)
      setError(msg)
      setStage('error')
    }
  }, [preview])

  const startPolling = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/api/admin/import/${jobId}`,
          { credentials: 'include' },
        )
        if (!r.ok) {
          // stop polling on error
          if (pollRef.current) clearInterval(pollRef.current)
          return
        }
        const data = (await r.json()) as JobStatus
        setJob(data)
        if (
          data.status === 'completed' ||
          data.status === 'completed_with_errors' ||
          data.status === 'failed'
        ) {
          if (pollRef.current) clearInterval(pollRef.current)
          pollRef.current = null
          setStage('done')
          if (data.status === 'completed') toast.success('Import completed')
          else if (data.status === 'failed') toast.error('Import failed')
          else toast('Import completed with errors')
        }
      } catch {
        // network blip — keep polling
      }
    }, 1500)
  }, [])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null
    setStage('idle')
    setPreview(null)
    setJob(null)
    setError(null)
    setFilename('')
  }

  return (
    <div className="space-y-6">
      {stage === 'idle' || stage === 'error' ? (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            handleFiles(e.dataTransfer.files)
          }}
          className={`bg-white rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
            dragOver ? 'border-rose-500 bg-rose-50' : 'border-stone-200'
          }`}
        >
          <p className="text-stone-700 mb-2">Drop your <code>.json</code> file here</p>
          <p className="text-stone-500 text-sm mb-4">or</p>
          <label className="inline-block bg-stone-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-700 cursor-pointer">
            Choose file
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
        </div>
      ) : null}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
          <button
            onClick={reset}
            className="ml-4 text-red-700 underline"
          >
            Try again
          </button>
        </div>
      )}

      {stage === 'previewing' && (
        <div className="bg-white rounded-xl border border-stone-200 p-6 text-stone-500">
          Uploading and validating <code>{filename}</code>…
        </div>
      )}

      {preview && stage === 'preview' && (
        <PreviewPanel
          preview={preview}
          filename={filename}
          onConfirm={handleConfirm}
          onCancel={reset}
        />
      )}

      {stage === 'confirming' && (
        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <p className="text-stone-700">Importing products…</p>
        </div>
      )}

      {stage === 'done' && job && <DonePanel job={job} onReset={reset} />}
    </div>
  )
}

function PreviewPanel({
  preview,
  filename,
  onConfirm,
  onCancel,
}: {
  preview: PreviewResponse
  filename: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const hasErrors = preview.row_errors.length > 0
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg text-stone-800">
            Preview <span className="text-stone-400 text-sm font-sans">({filename})</span>
          </h2>
          <div className="text-sm text-stone-500 space-x-3">
            <span>total: {preview.total_products}</span>
            <span className="text-green-700">will create: {preview.would_create}</span>
            <span className="text-amber-700">will update: {preview.would_update}</span>
            <span>schema: v{preview.schema_version}</span>
          </div>
        </div>
        {preview.categories_to_create.length > 0 && (
          <div className="mb-4 text-sm">
            <span className="text-stone-500">New categories to be created: </span>
            {preview.categories_to_create.map((c) => (
              <span
                key={c.slug}
                className="inline-block bg-stone-100 text-stone-700 rounded-full px-2 py-1 mr-2 text-xs"
              >
                {c.name}
              </span>
            ))}
          </div>
        )}
        {hasErrors ? (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            <p className="font-medium mb-2">
              {preview.row_errors.length} validation error
              {preview.row_errors.length === 1 ? '' : 's'}. Fix your file and re-upload.
            </p>
            <ul className="space-y-1 list-disc pl-5">
              {preview.row_errors.slice(0, 20).map((e, i) => (
                <li key={i}>
                  row {e.row_number}, {e.field}: {e.message}
                </li>
              ))}
              {preview.row_errors.length > 20 && (
                <li>…and {preview.row_errors.length - 20} more</li>
              )}
            </ul>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-4">
            No validation errors. Ready to import.
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-stone-300 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={hasErrors}
            className="px-4 py-2 bg-stone-800 text-white rounded-lg text-sm font-medium hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {hasErrors ? 'Cannot import (has errors)' : `Import ${preview.total_products} products`}
          </button>
        </div>
      </div>
    </div>
  )
}

function DonePanel({ job, onReset }: { job: JobStatus; onReset: () => void }) {
  const ok = job.status === 'completed'
  const partial = job.status === 'completed_with_errors'
  const failed = job.status === 'failed'
  return (
    <div className="space-y-4">
      <div
        className={`rounded-xl border p-6 ${
          ok
            ? 'bg-green-50 border-green-200'
            : failed
            ? 'bg-red-50 border-red-200'
            : 'bg-amber-50 border-amber-200'
        }`}
      >
        <h2 className="font-serif text-lg text-stone-800 mb-2">
          {ok && 'Import completed'}
          {partial && 'Import completed with errors'}
          {failed && 'Import failed'}
        </h2>
        <div className="text-sm text-stone-700 space-y-1">
          <p>
            Imported <span className="font-medium">{job.imported_count}</span> of{' '}
            {job.total_products} products.
          </p>
          {job.import_errors.length > 0 && (
            <ul className="list-disc pl-5 mt-2 space-y-1">
              {job.import_errors.slice(0, 10).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
              {job.import_errors.length > 10 && (
                <li>…and {job.import_errors.length - 10} more</li>
              )}
            </ul>
          )}
        </div>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onReset}
            className="px-4 py-2 bg-stone-800 text-white rounded-lg text-sm font-medium hover:bg-stone-700"
          >
            Import another file
          </button>
        </div>
      </div>
    </div>
  )
}
