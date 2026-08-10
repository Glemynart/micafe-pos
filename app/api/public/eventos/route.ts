import { listarEventosPublicos } from "./service"

export async function GET(req: Request) {
  return listarEventosPublicos(req)
}
