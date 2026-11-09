import "dotenv/config";
import { app } from "./src/app";
import { pgPool } from "./src/config/postgres";
import { redisClient } from "./src/config/redis";

const port = Number(process.env.PORT) || 3000;

async function connectionServices() {
    try {
        await pgPool.query("SELECT 1");
        console.log("PostgreSQL connected");

        if (!redisClient.isOpen) {
            await redisClient.connect();
            console.log("Redis connected");
        }
    } catch (error) {
        console.error("Service connection failed: ", error);
        throw error;
    }
}

async function startServer() {
    try {
        await connectionServices();
        console.log("DB Services connected");
        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });
    } catch (error) {
        console.error("Application startup failed:", error);

        await pgPool.end().catch(console.error);

        if (redisClient.isOpen) {
            await redisClient.quit().catch(console.error);
        }

        process.exit(1);
    }
}

async function shutdown() {
    console.log("Shutting down...");

    if (redisClient.isOpen) {
        await redisClient.quit();
    }
    await pgPool.end();

    process.exit(0);
}

if (process.env.NODE_ENV !== "test") {
    startServer();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { app, connectionServices, startServer, shutdown };
