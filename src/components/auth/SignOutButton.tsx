'use client'

import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'

export function SignOutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function signOut() {
    setLoading(true)
    setError(false)
    try {
      const response = await fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      if (!response.ok) throw new Error(String(response.status))
      router.push('/')
      router.refresh()
    } catch {
      setError(true)
      setLoading(false)
    }
  }

  return (
    <>
      <Button variant="secondary" icon={<LogOut size={20} aria-hidden="true" />} loading={loading} loadingLabel="מתנתקים…" onClick={signOut}>
        התנתקות
      </Button>
      {error && <p role="alert">לא הצלחנו להתנתק. נסו שוב.</p>}
    </>
  )
}
