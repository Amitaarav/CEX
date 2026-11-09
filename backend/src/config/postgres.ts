import { Pool, type PoolConfig } from "pg";
import { parse } from "pg-connection-string";
import fs from "fs";
import path from "path";

// Locate CA certificate reliably whether executed from backend/ or project root
const possibleCaPaths = [
    process.env.PG_CA_PATH,
    path.resolve(process.cwd(), "certs/ca.pem"),
    path.resolve(process.cwd(), "backend/certs/ca.pem"),
    typeof __dirname !== "undefined" ? path.resolve(__dirname, "../../certs/ca.pem") : null,
].filter((p): p is string => Boolean(p));

const caPath = possibleCaPaths.find((p) => fs.existsSync(p));

// Parse connection string to prevent pg's ConnectionParameters from overriding custom SSL options
const dbUrl = process.env.DATABASE_URL || "";
const parsed: any = dbUrl ? parse(dbUrl) : {};

const poolConfig: PoolConfig = {
    user: parsed.user ?? undefined,
    password: parsed.password ?? undefined,
    host: parsed.host ?? undefined,
    port: parsed.port ? parseInt(parsed.port, 10) : undefined,
    database: parsed.database ?? undefined,
    ssl: caPath
        ? {
              rejectUnauthorized: true,
              ca: fs.readFileSync(caPath, "utf-8"),
          }
        : parsed.ssl || undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
};

export const pgPool = new Pool(poolConfig);

pgPool.on("error", (err) => {
    console.error("Unexpected PostgreSQL error: ", err);
});
