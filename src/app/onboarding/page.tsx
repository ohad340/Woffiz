import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow'
import { FixtureBanner } from '@/components/shell/FixtureBanner'
import { SignOutBar } from '@/components/shell/SignOutBar'
import { parseDevState } from '@/lib/devState'
import { getOnboardingState } from '@/server/onboarding'
import { requireUserOrRedirect } from '@/server/session'

export const metadata: Metadata = { title: 'היכרות עם הגור' }
export const dynamic = 'force-dynamic'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>
}) {
  const user = await requireUserOrRedirect()
  const state = await getOnboardingState(user.id)
  if (state.onboarded) redirect('/home')

  const preview = parseDevState((await searchParams).state)
  return (
    <>
      <FixtureBanner />
      <SignOutBar />
      <OnboardingFlow
        previewState={preview === 'generating' || preview === 'generation-error' ? preview : null}
        initial={{ answers: state.answers, step: state.step }}
      />
    </>
  )
}
