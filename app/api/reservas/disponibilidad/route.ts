import { consultarDisponibilidad } from './service'

export async function GET(req: Request) {
  return consultarDisponibilidad(req)
}
