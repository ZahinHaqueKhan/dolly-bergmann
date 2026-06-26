interface Step {
  key: string
  label: string
  status: string
  reached: boolean
  timestamp: string | null
}

interface Props {
  status: string
  paidAt: string | null
  createdAt: string
}

const STEPS: { key: string; label: string }[] = [
  { key: 'awaiting_payment', label: 'Awaiting payment' },
  { key: 'paid', label: 'Paid' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
]

export default function StatusTimeline({ status, paidAt, createdAt }: Props) {
  const statusIdx = STEPS.findIndex((s) => s.key === status)
  const isCancelled = status === 'cancelled'

  const steps: Step[] = STEPS.map((s, i) => {
    let reached = !isCancelled && i <= statusIdx
    let timestamp: string | null = null
    if (i === 0) {
      timestamp = createdAt
    } else if (i === 1 && paidAt) {
      timestamp = paidAt
    }
    return { ...s, status: s.key, reached, timestamp }
  })

  return (
    <ol className="flex flex-col md:flex-row gap-2 md:gap-0 md:items-stretch">
      {steps.map((s, i) => (
        <li
          key={s.key}
          className="flex md:flex-1 items-start md:items-center gap-2 md:gap-0"
        >
          <div
            className={
              'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ' +
              (s.reached
                ? 'bg-stone-800 text-white'
                : 'bg-stone-100 text-stone-400')
            }
          >
            {i + 1}
          </div>
          <div className="md:hidden flex-1">
            <p
              className={
                'text-sm font-medium ' + (s.reached ? 'text-stone-800' : 'text-stone-400')
              }
            >
              {s.label}
            </p>
            {s.timestamp && (
              <p className="text-xs text-stone-400">
                {new Date(s.timestamp).toISOString().slice(0, 10)}
              </p>
            )}
          </div>
          {i < steps.length - 1 && (
            <div
              className={
                'hidden md:block flex-1 h-px mx-2 ' +
                (s.reached && steps[i + 1].reached ? 'bg-stone-800' : 'bg-stone-200')
              }
            />
          )}
        </li>
      ))}
    </ol>
  )
}
