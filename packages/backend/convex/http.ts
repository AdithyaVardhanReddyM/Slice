import { httpRouter } from "convex/server";
import { proxy } from "./qloo";

const http = httpRouter();

// The agent calls Qloo through here so it shares the cache and never holds the key.
http.route({ path: "/qloo", method: "POST", handler: proxy });

export default http;
