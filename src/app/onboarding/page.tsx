import type { Metadata } from 'next'
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow'
import { FixtureBanner } from '@/components/shell/FixtureBanner'
import { parseDevState } from '@/lib/devState'

export const metadata: Metadata = { title: 'היכרות עם הגור' }

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>
}) {
  const state = parseDevState((await searchParams).state)
  return (
    <>
      <FixtureBanner text="תצוגת פיתוח · התשובות נשמרות רק בדפדפן הזה, עד סגירת הלשונית" />
      <OnboardingFlow previewState={state === 'generating' || state === 'generation-error' ? state : null} />
    </>
  )
}
