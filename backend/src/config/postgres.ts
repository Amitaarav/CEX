import { Pool } from "pg"
import fs from "fs";
import path from "path";

export const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: {
        rejectUnauthorized: true,
        ca: fs.readFileSync(
            path.resolve(process.cwd(), "certs/ca.pem")
        ).toString()
    },

    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
})

pgPool.on("error", (err) => {
    console.log("Unexpected PostgreSQL error: ", err);
});

