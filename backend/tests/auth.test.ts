import "dotenv/config";
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../index";
import { pgPool } from "../src/config/postgres";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import type { Server } from "http";

interface ApiResponse {
    id?: number;
    message?: string;
    error?: string;
    token?: string;
}

let server: Server;
let baseUrl: string;

const testUsersToCleanup: string[] = [];

beforeAll(async () => {
    // Start Express app on an ephemeral port
    await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
            const addr = server.address();
            if (addr && typeof addr === "object") {
                baseUrl = `http://127.0.0.1:${addr.port}`;
            }
            resolve();
        });
    });

    // Ensure database connection is active
    await pgPool.query("SELECT 1");
});

afterAll(async () => {
    // Clean up created test users from PostgreSQL
    if (testUsersToCleanup.length > 0) {
        await pgPool.query(
            "DELETE FROM users WHERE username = ANY($1::text[])",
            [testUsersToCleanup]
        );
    }

    // Close server and database pool
    await new Promise<void>((resolve) => {
        server.close(() => resolve());
    });
    await pgPool.end();
});

describe("POST /signup", () => {
    test("successfully creates a new user and hashes password", async () => {
        const username = `test_auth_signup_${Date.now()}`;
        const password = "securepassword123";
        testUsersToCleanup.push(username);

        const res = await fetch(`${baseUrl}/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        expect(res.status).toBe(200);
        const data = (await res.json()) as ApiResponse;
        expect(data).toHaveProperty("id");
        expect(typeof data.id).toBe("number");
        expect(data.message).toBe("User created successfully");

        // Verify user in PostgreSQL
        const dbResult = await pgPool.query(
            "SELECT id, username, password FROM users WHERE id = $1",
            [data.id]
        );
        expect(dbResult.rows.length).toBe(1);
        const userInDb = dbResult.rows[0];
        expect(userInDb.username).toBe(username);
        expect(userInDb.password).not.toBe(password);
        expect(await bcrypt.compare(password, userInDb.password)).toBe(true);
    });

    test("fails when trying to sign up with duplicate username", async () => {
        const username = `test_auth_dup_${Date.now()}`;
        const password = "password123";
        testUsersToCleanup.push(username);

        // First signup succeeds
        const firstRes = await fetch(`${baseUrl}/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });
        expect(firstRes.status).toBe(200);

        // Duplicate signup fails
        const dupRes = await fetch(`${baseUrl}/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        expect(dupRes.status).toBe(411);
        const data = (await dupRes.json()) as ApiResponse;
        expect(data.error).toBe("User already exists");
    });

    test("fails validation when username is empty", async () => {
        const res = await fetch(`${baseUrl}/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "", password: "password123" })
        });

        expect(res.status).toBe(411);
        const data = (await res.json()) as ApiResponse;
        expect(data.error).toBe("Invalid input");
    });

    test("fails validation when password is shorter than 6 characters", async () => {
        const res = await fetch(`${baseUrl}/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: `test_${Date.now()}`, password: "123" })
        });

        expect(res.status).toBe(411);
        const data = (await res.json()) as ApiResponse;
        expect(data.error).toBe("Invalid input");
    });

    test("fails validation when request body is empty or malformed", async () => {
        const res = await fetch(`${baseUrl}/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
        });

        expect(res.status).toBe(411);
        const data = (await res.json()) as ApiResponse;
        expect(data.error).toBe("Invalid input");
    });
});

describe("POST /signin", () => {
    test("successfully signs in with valid credentials and returns a valid JWT", async () => {
        const username = `test_auth_signin_${Date.now()}`;
        const password = "validPassword123";
        testUsersToCleanup.push(username);

        // First create user via /signup
        const signupRes = await fetch(`${baseUrl}/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });
        const signupData = (await signupRes.json()) as ApiResponse;
        expect(signupData.id).toBeDefined();
        const userId = signupData.id!;

        // Now sign in
        const signinRes = await fetch(`${baseUrl}/signin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        expect(signinRes.status).toBe(200);
        const signinData = (await signinRes.json()) as ApiResponse;
        expect(signinData).toHaveProperty("token");
        expect(typeof signinData.token).toBe("string");

        // Verify the JWT token
        const secret = process.env.JWT_SECRET as string;
        const decoded = jwt.verify(signinData.token!, secret) as { id: number };
        expect(decoded.id).toBe(userId);
    });

    test("fails with 403 when password is incorrect", async () => {
        const username = `test_auth_wrongpass_${Date.now()}`;
        const password = "correctPassword123";
        testUsersToCleanup.push(username);

        await fetch(`${baseUrl}/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        const res = await fetch(`${baseUrl}/signin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password: "incorrectPassword" })
        });

        expect(res.status).toBe(403);
        const data = (await res.json()) as ApiResponse;
        expect(data.message).toBe("Password incorrect");
    });

    test("fails with 403 when user does not exist", async () => {
        const res = await fetch(`${baseUrl}/signin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: `nonexistent_user_${Date.now()}`,
                password: "somepassword123"
            })
        });

        expect(res.status).toBe(403);
        const data = (await res.json()) as ApiResponse;
        expect(data.error).toBe("User does not exist");
    });

    test("fails validation when payload is invalid", async () => {
        const res = await fetch(`${baseUrl}/signin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: "",
                password: "123"
            })
        });

        expect(res.status).toBe(411);
        const data = (await res.json()) as ApiResponse;
        expect(data.error).toBe("Invalid inputs");
    });
});
