import { Router } from "express";
import { CreateUserSchema, SigninSchema } from "../types/user";
import { pgPool } from "../config/postgres";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export const userRouter = Router();

userRouter.post("/signup", async (req, res) => {
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

userRouter.post("/signin", async (req, res) => {
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
