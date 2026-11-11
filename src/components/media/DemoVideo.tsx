'use client'

import { RotateCcw } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { DemoView } from '@/server/media/resolve'
import { VideoUnavailable } from './VideoUnavailable'
import styles from './DemoVideo.module.css'

type Ready = Extract<DemoView, { state: 'ready' }>

/**
 * The demonstration of an exercise. Playback starts only when the owner taps play (native controls, with volume and
 * mute), has Hebrew captions from our own origin and a reviewed transcript. Watching never reports practice and never
 * unlocks anything: this component talks only to the read-only playback endpoint, to refresh an expired link.
 */
export function DemoVideo({ demo, label }: { demo: DemoView; label: string }) {
  if (demo.state === 'ready') return <ReadyVideo demo={demo} label={label} />
  return <VideoUnavailable reason={demo.state === 'none' ? 'none' : 'unavailable'} />
}

function ReadyVideo({ demo, label }: { demo: Ready; label: string }) {
  const [urls, setUrls] = useState({ video: demo.videoUrl, poster: demo.posterUrl })
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  // One silent refresh per failure streak: the usual cause is a signed link that expired while the page stayed open.
  const refreshed = useRef(false)
  const transcriptId = useId()

  async function refreshUrls(): Promise<boolean> {
    try {
      const response = await fetch(`/api/media/playback?exerciseVersionId=${demo.exerciseVersionId}&variant=${demo.variant}`, { cache: 'no-store' })
      if (!response.ok) return false
      const next = (await response.json()) as DemoView
      if (next.state !== 'ready') return false
      setUrls({ video: next.videoUrl, poster: next.posterUrl })
      return true
    } catch {
      return false
    }
  }

  async function onError() {
    if (!refreshed.current) {
      refreshed.current = true
      // A new src reloads the element; the owner taps play again (no autoplay with sound).
      if (await refreshUrls()) {
        setStatus('idle')
        return
      }
    }
    setStatus('error')
    setTranscriptOpen(true)
  }

  async function retry() {
    setStatus('loading')
    refreshed.current = true
    if (await refreshUrls()) setStatus('idle')
    else setStatus('error')
  }

  return (
    <figure className={styles.figure}>
      <video
        className={styles.video}
        style={{ aspectRatio: `${demo.width} / ${demo.height}` }}
        src={urls.video}
        poster={urls.poster}
        controls
        preload="none"
        playsInline
        aria-label={label}
        onPlay={() => setStatus('loading')}
        onWaiting={() => setStatus('loading')}
        onPlaying={() => {
          setStatus('idle')
          refreshed.current = false
        }}
        onPause={() => setStatus((s) => (s === 'loading' ? 'idle' : s))}
        onError={onError}
      >
        <track kind="captions" srcLang="he" label="עברית" src={demo.captionsUrl} default />
      </video>

      {status === 'loading' && (
        <p role="status" className={styles.status}>
          טוען את הסרטון…
        </p>
      )}
      {status === 'error' && (
        <div role="alert" className={styles.error}>
          <p>לא הצלחנו להפעיל את הסרטון. ההוראות הכתובות והתמליל זמינים.</p>
          <Button variant="secondary" icon={<RotateCcw size={20} aria-hidden="true" />} onClick={retry}>
            לנסות שוב
          </Button>
        </div>
      )}

      <figcaption className={styles.caption}>
        <button type="button" className={styles.toggle} aria-expanded={transcriptOpen} aria-controls={transcriptId} onClick={() => setTranscriptOpen((open) => !open)}>
          {transcriptOpen ? 'הסתרת תמליל הסרטון' : 'תמליל הסרטון'}
        </button>
        <ol id={transcriptId} className={styles.transcript} hidden={!transcriptOpen}>
          {demo.transcript.map((entry, i) => (
            <li key={i}>
              {entry.type === 'speech' ? (
                <>
                  <strong>{entry.speaker === 'demo' ? 'המדגים' : 'קריין'}:</strong> {entry.text}
                </>
              ) : (
                <span className={styles.visual}>{entry.text}</span>
              )}
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  )
}
