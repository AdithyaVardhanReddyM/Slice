// Turns the audience builder's "describe them" sentence into conditions (agent, Qloo-resolved).
import { proxyJson } from "../_lib/proxy";

export async function POST(req: Request) {
  return proxyJson("/pages/audience-parse", req);
}
