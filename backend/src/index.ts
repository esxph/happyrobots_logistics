import Fastify from "fastify";
import { config } from "./config.js";
import { authMiddleware } from "./middleware/auth.js";
import { registerRoutes } from "./routes/api.js";

const app = Fastify({ logger: true });

// HappyRobot (and some clients) send Content-Type: application/json with no body
app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  try {
    done(null, body ? JSON.parse(body) : {});
  } catch (err) {
    done(err as Error, undefined);
  }
});

app.addHook("onRequest", authMiddleware);

app.get("/health", async () => ({
  status: "ok",
  service: "carrier-sales-api",
  timestamp: new Date().toISOString(),
}));

await registerRoutes(app);

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  console.log(`Carrier sales API listening on ${config.HOST}:${config.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
