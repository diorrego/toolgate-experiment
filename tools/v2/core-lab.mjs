/** Two independent Go deployments, one fixed selection profile each. */
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createServer } from "node:https";
import http from "node:http";
if (!process.argv.includes("--live")) throw Error("Explicit --live required");
const file = process.argv.find((a) => a.startsWith("--config="))?.slice(9);
if (!file) throw Error("Private config required");
const base = dirname(resolve(file)),
  config = JSON.parse(readFileSync(file, "utf8")),
  path = (p) => resolve(base, p);
const cfg = JSON.parse(readFileSync(path(config.state), "utf8")),
  keys = parseEnv(readFileSync(path(config.apiKeyFile), "utf8"));
if (!keys.TYPESAFE_AI_API_KEY) throw Error("Missing Jev key");
const dir = path(config.privateDir);
mkdirSync(dir, { recursive: true, mode: 0o700 });
const secrets = [
  keys.TYPESAFE_AI_API_KEY,
  cfg.runtime_password,
  cfg.pepper,
  ...Object.values(cfg.keys),
];
const allowed = /^Cpus_allowed_list:\s+(.+)$/m.exec(
  readFileSync("/proc/self/status", "utf8"),
)[1];
const cpus = allowed
  .split(",")
  .flatMap((p) => {
    const [a, b] = p.split("-").map(Number);
    return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i);
  })
  .slice(0, 2)
  .join(",");
const children = [],
  servers = [],
  agents = [];
let stopping = false;
writeFileSync(resolve(dir, "cores.pid"), String(process.pid), { mode: 0o600 });
function stop() {
  if (stopping) return;
  stopping = true;
  for (const s of servers) s.close();
  for (const a of agents) a.destroy();
  for (const c of children) c.kill("SIGTERM");
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
for (const [name, profile, port, tlsPort] of [
  ["choice", "choice", 19091, 19441],
  ["binary", "binary-parallel-v1", 19093, 19443],
]) {
  const env = {
    ...process.env,
    GOMAXPROCS: "2",
    TOOLGATE_LISTEN_ADDR: `127.0.0.1:${port}`,
    TOOLGATE_DATABASE_URL: `postgres://tg_runtime:${cfg.runtime_password}@127.0.0.1:${cfg.port}/toolgate_go?sslmode=disable`,
    TOOLGATE_KEY_PEPPER: cfg.pepper,
    TYPESAFE_AI_API_KEY: keys.TYPESAFE_AI_API_KEY,
    TOOLGATE_JEV_MODEL: "jev-1.13.0",
    TOOLGATE_CONNECT_TIMEOUT_MS: "1000",
    TOOLGATE_JEV_BASE_URL: "https://api.typesafe.ai/v1/systemone",
    TOOLGATE_SELECTOR_MODE: profile,
  };
  const child = spawn("taskset", ["-c", cpus, path(config.goBinary)], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  writeFileSync(resolve(dir, name + ".pid"), String(child.pid), {
    mode: 0o600,
  });
  for (const stream of [child.stdout, child.stderr])
    createInterface({ input: stream }).on("line", (line) => {
      for (const secret of secrets)
        line = line.replaceAll(secret, "[redacted]");
      appendFileSync(resolve(dir, name + ".log"), line + "\n", { mode: 0o600 });
    });
  child.on("error", stop);
  child.on("exit", () => {
    if (!stopping) stop();
  });
  const agent = new http.Agent({
    keepAlive: true,
    maxSockets: 16,
    maxFreeSockets: 16,
  });
  agents.push(agent);
  const server = createServer(
    {
      key: readFileSync(path(config.tlsKey)),
      cert: readFileSync(path(config.tlsCert)),
    },
    (req, res) => {
      const up = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: req.url,
          method: req.method,
          headers: req.headers,
          agent,
        },
        (out) => {
          res.writeHead(out.statusCode ?? 502, out.headers);
          out.pipe(res);
        },
      );
      up.setTimeout(4000, () => up.destroy());
      req.on("aborted", () => up.destroy());
      res.on("close", () => {
        if (!res.writableFinished) up.destroy();
      });
      up.on("error", () => {
        if (!res.headersSent)
          res.writeHead(503, { "Content-Type": "application/json" });
        res.end("{}");
      });
      req.pipe(up);
    },
  );
  server.on("error", stop);
  server.listen(tlsPort, "127.0.0.1");
  servers.push(server);
}
console.log("V2 fixed Go profiles starting");
