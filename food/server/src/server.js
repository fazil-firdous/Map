const path = require("path");
const fs = require("fs");
const Fastify = require("fastify");
const config = require("./config");
const auth = require("./auth");
const { HttpError } = require("./util");

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || "info" }, trustProxy: true, bodyLimit: 1024 * 1024 });
app.register(require("@fastify/cors"), { origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin) || config.corsOrigins.includes("*")) });
app.register(require("@fastify/rate-limit"), { max: 600, timeWindow: "1 minute" });
app.register(require("@fastify/multipart"), { limits: { fileSize: 3 * 1024 * 1024, files: 1 } });
fs.mkdirSync(config.uploadsDir, { recursive: true });
app.register(require("@fastify/static"), { root: config.uploadsDir, prefix: "/uploads/", maxAge: "30d", immutable: true });
app.register(require("@fastify/static"), { root: path.join(__dirname, "..", "admin"), prefix: "/admin/", decorateReply: false });
app.register(require("@fastify/static"), { root: path.join(__dirname, "..", "public"), prefix: "/", decorateReply: false, index: false });

app.addHook("preHandler", auth.loadUser);
app.setErrorHandler((err, req, reply) => {
  const status = err instanceof HttpError ? err.statusCode : err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
  if (status >= 500) req.log.error(err);
  reply.status(status).send({ error: status >= 500 ? "Something went wrong. Please try again." : err.message });
});
app.register(async (a) => {
  require("./catalog").routes(a);
  auth.routes(a);
  require("./orders").routes(a);
  require("./owner").routes(a);
  require("./admin").routes(a);
});

if (require.main === module) {
  app.listen({ port: config.port, host: "0.0.0.0" }).then(() => require("./orders").startSweeper(app.log)).catch((e) => { app.log.error(e); process.exit(1); });
}
module.exports = app;
