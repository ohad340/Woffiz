import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/server/auth'
import { guardEmailRequest } from '@/server/email/delivery'

const handler = toNextJsHandler(auth)

export const GET = handler.GET

/** Endpoints that send mail get a per-address limit, a constant-time floor and truthful failure answers. */
export function POST(request: Request) {
  return guardEmailRequest(request, handler.POST)
}
