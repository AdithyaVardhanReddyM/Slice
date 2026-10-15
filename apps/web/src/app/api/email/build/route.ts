// Streams an email editor turn (generate or edit) from the agent.
import { proxyStream } from "../../pages/_lib/proxy";

export async function POST(req: Request) {
  return proxyStream("/email/build", req);
}
