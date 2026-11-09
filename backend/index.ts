import "dotenv/config";

import express, { type Request, type Response } from "express";
import { CreateUserSchema, SigninSchema } from "./src/types/user";
import { pgPool } from "./src/config/postgres";
import { redisClient } from "./src/config/redis";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { authMiddleware, type AuthenticatedRequest } from "./middlewares/authMiddleware";
import { OnrampSchema } from "./src/types/onramp";

const port = Number(process.env.PORT) || 3000;
const app = express();

app.use(express.json());

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
    }
}

app.post("/signup", async (req, res) => {
    const { data, success } = CreateUserSchema.safeParse(req.body);

    if (!success) {
        return res.status(411).json({ error: "Invalid input" });
    }

    try {
        const existingUser = await pgPool.query("SELECT * FROM users WHERE username = $1", [data.username]);
        if (existingUser.rows.length > 0) {
            return res.status(411).json({ error: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);

        const newUser = await pgPool.query(
            "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id;",
            [data.username, hashedPassword]
        );

        return res.json({
            id: newUser.rows[0].id,
            message: "User created successfully"
        });
    } catch (error) {
        console.error("Signup error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post("/signin", async (req, res) => {
    const { data, success } = SigninSchema.safeParse(req.body);

    if (!success) {
        return res.status(411).json({
            error: "Invalid inputs"
        });
    }

    try {
        const existingUser = await pgPool.query("SELECT * FROM users WHERE username = $1", [data.username]);

        if (existingUser.rows.length === 0) {
            return res.status(403).json({
                error: "User does not exist"
            });
        }

        const isPasswordValid = await bcrypt.compare(data.password, existingUser.rows[0].password);
        if (!isPasswordValid) {
            return res.status(403).json({
                message: "Password incorrect"
            });
        }

        const token = jwt.sign(
            {
                id: existingUser.rows[0].id
            },
            process.env.JWT_SECRET as string,
            {
                expiresIn: "1h"
            }
        );

        return res.json({
            token: token
        });
    } catch (error) {
        console.error("Signin error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post("/onramp", authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { data, success } = OnrampSchema.safeParse(req.body);

    if (!success) {
        return res.status(411).json({
            message: "Incorrect input"
        });
    }

    await redisClient.lPush("engine", JSON.stringify({
        type: "onramp",
        payload: {
            userId: authReq.id,
            amount: data.usd
        }
    }));

    // get acknowledge from engine first

    return res.status(200).json({
        message: "Onramp request has been sent to the backend"
    });
});

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
