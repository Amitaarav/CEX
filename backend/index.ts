import "dotenv/config"

import express from "express";
import { CreateUserSchema } from "./src/types/user";
import { pgPool } from "./src/config/postgres";
import { redisClient } from "./src/config/redis";

const port = Number(process.env.PORT) || 3000;
const app = express();

app.use(express.json());

async function connectionServices() {
    try {
        await pgPool.query("SELECT 1");
        console.log("PostgreSQL connected");

        await redisClient.connect();
        console.log("Redis connected");

    } catch (error) {
        console.error("Service connection failed: ", error);
    }
}

app.post("/signup", (req, res) => {
    const { data, success } = CreateUserSchema.safeParse(req.body);
    if (!success) {
        return res.status(411).json({ error: "Invalid input" });
    }

})

app.post("/signin", (req, res) => {

})

app.post("/signup", (req, res) => {

})


app.post("/signup", (req, res) => {

})


app.post("/signup", (req, res) => {

})

app.post("/signup", (req, res) => {

})

app.post("/signup", (req, res) => {

})

async function startServer() {
    try {
        await connectionServices();
        console.log("DB Sevices connected")
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

    await redisClient.quit();
    await pgPool.end();

    process.exit(0);
}

startServer();

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);