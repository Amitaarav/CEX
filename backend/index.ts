import "dotenv/config"

import express from "express";
import { CreateUserSchema } from "./src/types/user";
import { pgPool } from "./src/config/postgres";
import { redisClient } from "./src/config/redis";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { authMiddleware } from "./middlewares/authMiddleware";

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

app.post("/signup", async (req, res) => {
    const { data, success } = CreateUserSchema.safeParse(req.body);

    if (!success) {
        return res.status(411).json({ error: "Invalid input" });
    }

    const existingUser =  await pgPool.query(`SELECT * FROM users WHERE username=$`, [data.username])
    if(!existingUser){
        res.status(411).json({error: "User already exists"})
    }

    const hashedPassword = bcrypt.hash(data.password, 10)

    const newUser = await pgPool.query('INSERT INTO users (username, hashedPassword) VALUES ($, $) RETURNING id;', [data.username, hashedPassword]);

    res.json({
        id: newUser.rows[0].id,
        message: "User created successfully"
    })
})

app.post("/signin",async (req, res) => {
    const { data, success } = req.body;

    if(!success){
        return res.status(411).json({
            error: "Invalid inputs"
        })
    }

    const existingUser = await pgPool.query(`SELECT * FROM users WHERE username=$`, [data.username]);

    if(existingUser.rowCount !== 0){
        return res.status(411).json({
            error: "User already exists"
        })
    }

    if(existingUser.rows[0].hashedPassword != data.password){
        return res.status(403).json({
            message: "Password incorrect"
        })
    }

    const token = jwt.sign({
            id: existingUser.rows[0].id
        },
            process.env.JWT_SECRET as string,
        {
            expiresIn: "1h"
        }
    );

    res.json({
        token: token
    })
})

app.post("/onramp", authMiddleware, (req, res) => {

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