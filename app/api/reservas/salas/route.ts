import { listarSalasPublicas } from './service'

export async function GET(req: Request) {
  return listarSalasPublicas(req)
}
