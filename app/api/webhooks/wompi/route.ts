import { procesarWebhookWompi } from './service'

export async function POST(req: Request) {
  return procesarWebhookWompi(req)
}
