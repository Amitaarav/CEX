import "dotenv/config";
import { describe, test, expect, beforeAll, afterAll, spyOn } from "bun:test";
import { app } from "../src/app";
import { redisClient } from "../src/config/redis";
import jwt from "jsonwebtoken";
import type { Server } from "http";

interface ApiResponse {
    message?: string;
    error?: string;
}

let server: Server;
let baseUrl: string;

const TEST_USER_ID = 99999;
let validToken: string;

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

    // Connect redis if not already open
    if (!redisClient.isOpen) {
        await redisClient.connect();
    }

    // Generate valid JWT token for test user
    const secret = process.env.JWT_SECRET || "jwtsecretcex";
    validToken = jwt.sign({ id: TEST_USER_ID }, secret, { expiresIn: "1h" });
});

afterAll(async () => {
    // Clean up server and redis connections
    await new Promise<void>((resolve) => {
        server.close(() => resolve());
    });
    if (redisClient.isOpen) {
        await redisClient.quit();
    }
});

describe("POST /onramp", () => {
    test("fails with 401 when no authorization token is provided", async () => {
        const res = await fetch(`${baseUrl}/onramp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usd: 500 })
        });

        expect(res.status).toBe(401);
        const data = (await res.json()) as ApiResponse;
        expect(data.message).toBe("Unauthorized");
    });

    test("fails with 401 when an invalid token is provided", async () => {
        const res = await fetch(`${baseUrl}/onramp`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer invalid_garbage_token"
            },
            body: JSON.stringify({ usd: 500 })
        });

        expect(res.status).toBe(401);
        const data = (await res.json()) as ApiResponse;
        expect(data.message).toBe("Unauthorized");
    });

    test("fails with 411 when usd amount is missing or invalid", async () => {
        // Missing usd
        const resMissing = await fetch(`${baseUrl}/onramp`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${validToken}`
            },
            body: JSON.stringify({})
        });
        expect(resMissing.status).toBe(411);
        const dataMissing = (await resMissing.json()) as ApiResponse;
        expect(dataMissing.message).toBe("Incorrect input");

        // Negative usd
        const resNegative = await fetch(`${baseUrl}/onramp`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${validToken}`
            },
            body: JSON.stringify({ usd: -100 })
        });
        expect(resNegative.status).toBe(411);

        // String usd
        const resString = await fetch(`${baseUrl}/onramp`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${validToken}`
            },
            body: JSON.stringify({ usd: "not-a-number" })
        });
        expect(resString.status).toBe(411);
    });

    test("successfully queues onramp message to Redis when authenticated", async () => {
        const lPushSpy = spyOn(redisClient, "lPush");
        const amount = 250;

        const res = await fetch(`${baseUrl}/onramp`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${validToken}`
            },
            body: JSON.stringify({ usd: amount })
        });

        expect(res.status).toBe(200);
        const data = (await res.json()) as ApiResponse;
        expect(data.message).toBe("Onramp request has been sent to the backend");

        // Verify redisClient.lPush was invoked with expected queue and payload
        expect(lPushSpy).toHaveBeenCalled();
        const calls = lPushSpy.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        const [queue, rawPayload] = calls[calls.length - 1]!;
        expect(queue).toBe("engine");

        const parsed = JSON.parse(rawPayload as string);
        expect(parsed.type).toBe("onramp");
        expect(parsed.payload.userId).toBe(TEST_USER_ID);
        expect(parsed.payload.amount).toBe(amount);

        lPushSpy.mockRestore();
    });
});

describe("POST /deposit", () => {
    test("fails with 401 when no authorization token is provided", async () => {
        const res = await fetch(`${baseUrl}/deposit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticker: "BTC", qty: 2 })
        });

        expect(res.status).toBe(401);
        const data = (await res.json()) as ApiResponse;
        expect(data.message).toBe("Unauthorized");
    });

    test("fails with 401 when an invalid token is provided", async () => {
        const res = await fetch(`${baseUrl}/deposit`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer bad_token"
            },
            body: JSON.stringify({ ticker: "BTC", qty: 2 })
        });

        expect(res.status).toBe(401);
        const data = (await res.json()) as ApiResponse;
        expect(data.message).toBe("Unauthorized");
    });

    test("fails with 411 when payload is missing or invalid", async () => {
        // Missing ticker
        const resNoTicker = await fetch(`${baseUrl}/deposit`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${validToken}`
            },
            body: JSON.stringify({ qty: 5 })
        });
        expect(resNoTicker.status).toBe(411);
        const dataNoTicker = (await resNoTicker.json()) as ApiResponse;
        expect(dataNoTicker.message).toBe("Incorrect input");

        // Missing qty
        const resNoQty = await fetch(`${baseUrl}/deposit`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${validToken}`
            },
            body: JSON.stringify({ ticker: "ETH" })
        });
        expect(resNoQty.status).toBe(411);

        // Negative qty
        const resNegativeQty = await fetch(`${baseUrl}/deposit`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${validToken}`
            },
            body: JSON.stringify({ ticker: "SOL", qty: -1 })
        });
        expect(resNegativeQty.status).toBe(411);
    });

    test("successfully queues deposit message to Redis when authenticated", async () => {
        const lPushSpy = spyOn(redisClient, "lPush");
        const ticker = "BTC";
        const qty = 3.5;

        const res = await fetch(`${baseUrl}/deposit`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${validToken}`
            },
            body: JSON.stringify({ ticker, qty })
        });

        expect(res.status).toBe(200);
        const data = (await res.json()) as ApiResponse;
        expect(data.message).toBe("Deposit request has been sent to the backend");

        // Verify redisClient.lPush was invoked with expected queue and payload
        expect(lPushSpy).toHaveBeenCalled();
        const calls = lPushSpy.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        const [queue, rawPayload] = calls[calls.length - 1]!;
        expect(queue).toBe("engine");

        const parsed = JSON.parse(rawPayload as string);
        expect(parsed.type).toBe("deposit");
        expect(parsed.payload.userId).toBe(TEST_USER_ID);
        expect(parsed.payload.ticker).toBe(ticker);
        expect(parsed.payload.qty).toBe(qty);

        lPushSpy.mockRestore();
    });
});
