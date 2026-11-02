'use client'

import { RefreshCw, Wand2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { newKey } from '@/lib/ids'

type Props = {
  endpoint: '/api/plan/adapt' | '/api/plan/revise'
  planRevision: number
  label: string
  loadingLabel: string
  /** Shown after a successful change, in addition to the server's explanation. */
  doneNote: string
  variant?: 'secondary' | 'ghost'
  /** When the button disappears after a change (the adapted exercise), the parent keeps showing the note. */
  onDone?: (note: string) => void
}

// The server may take a while (a generation can run for minutes). A "still pending" answer is not an error: the
// same request, with the same key, is asked again until the stored result arrives.
const PENDING_POLL_MS = 4000
const MAX_PENDING_POLLS = 60

/** Asks the server to adapt the current exercise or revise the future path. The server decides; nothing here unlocks. */
export function AiAdjust({ endpoint, planRevision, label, loadingLabel, doneNote, variant = 'secondary', onDone }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'done'; text: string } | null>(null)
  // One key per request, kept across retries (a lost response, a failed save, a click after an error), so that a
  // repeated request returns the stored result instead of generating - and being counted - again.
  const keyRef = useRef<string | null>(null)

  async function run() {
    setLoading(true)
    setMessage(null)
    const key = (keyRef.current ??= newKey())
    try {
      for (let attempt = 0; attempt < MAX_PENDING_POLLS; attempt++) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'idempotency-key': key },
          body: JSON.stringify({ planRevision }),
        })
        const data = (await response.json().catch(() => null)) as { message?: string; error?: string; explanation?: string } | null
        if (response.ok) {
          keyRef.current = null
          const note = [data?.explanation, doneNote].filter(Boolean).join(' ')
          if (onDone) onDone(note)
          else setMessage({ kind: 'done', text: note })
          router.refresh()
          return
        }
        if (data?.error === 'GENERATION_PENDING') {
          await new Promise((resolve) => setTimeout(resolve, PENDING_POLL_MS))
          continue
        }
        // Definitive answers that a retry cannot change end this request; a failure of the generation itself keeps the key.
        if (response.status < 500 && data?.error !== 'GENERATION_PENDING') keyRef.current = null
        setMessage({ kind: 'error', text: data?.message ?? 'לא הצלחנו לעדכן. מה ששמרתם נשאר כפי שהוא.' })
        return
      }
      setMessage({ kind: 'error', text: 'ההכנה לוקחת יותר מהרגיל. מה ששמרתם נשאר כפי שהוא, אפשר לנסות שוב.' })
    } catch {
      setMessage({ kind: 'error', text: 'אין חיבור. שום דבר לא השתנה, אפשר לנסות שוב.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        variant={variant}
        icon={endpoint === '/api/plan/adapt' ? <Wand2 size={20} aria-hidden="true" /> : <RefreshCw size={20} aria-hidden="true" />}
        loading={loading}
        loadingLabel={loadingLabel}
        onClick={run}
      >
        {label}
      </Button>
      {message && <p role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
    </>
  )
}
