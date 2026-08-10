import { crearHoldPublico } from './service'

export async function POST(req: Request) {
  return crearHoldPublico(req)
}
