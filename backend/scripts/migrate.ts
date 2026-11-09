import "dotenv/config";

import fs from "fs";
import path from "path";
import { pgPool } from "../src/config/postgres";

async function migrate() {
    try {
        const possibleMigrationPaths = [
            path.resolve(process.cwd(), "migrations/0.sql"),
            path.resolve(process.cwd(), "backend/migrations/0.sql"),
            typeof __dirname !== "undefined" ? path.resolve(__dirname, "../migrations/0.sql") : null,
        ].filter((p): p is string => Boolean(p));

        const migrationPath = possibleMigrationPaths.find((p) => fs.existsSync(p));
        if (!migrationPath) {
            throw new Error("Could not find migration file 0.sql");
        }

        const sql = fs.readFileSync(migrationPath, "utf-8");

        await pgPool.query(sql);

        console.log("Migration 0.sql executed successfully");
    } catch (error) {
        console.error("Migration failed:", error);
        process.exitCode = 1;
    } finally {
        await pgPool.end();
    }
}

migrate();
