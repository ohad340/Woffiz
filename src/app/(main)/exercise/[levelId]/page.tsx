import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { ExerciseScreen } from '@/components/exercise/ExerciseScreen'
import { getExercise } from '@/server/queries'
import { requireUserOrRedirect } from '@/server/session'

export const metadata: Metadata = { title: 'תרגיל' }

export default async function ExercisePage({ params }: { params: Promise<{ levelId: string }> }) {
  const { levelId } = await params
  if (!z.uuid().safeParse(levelId).success) notFound()

  const user = await requireUserOrRedirect()
  const view = await getExercise(user.id, levelId)
  if (!view) notFound()

  return <ExerciseScreen view={view} />
}
