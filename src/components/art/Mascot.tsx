import Image from 'next/image'
import styles from './Mascot.module.css'

/**
 * The app's puppy, as a round portrait cut from the approved reference artwork.
 * Always decorative: pair it with real text.
 */
export function Mascot({ className }: { className?: string }) {
  return (
    <Image
      className={[styles.mascot, className].filter(Boolean).join(' ')}
      src="/art/mascot-head.webp"
      alt=""
      aria-hidden="true"
      width={496}
      height={496}
      unoptimized
    />
  )
}

/** Short Hebrew line from the mascot. The text is real content, not decoration. */
export function SpeechBubble({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={[styles.bubble, className].filter(Boolean).join(' ')}>{children}</p>
}
