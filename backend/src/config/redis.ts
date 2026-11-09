import { createClient } from "redis";

export const redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
        connectTimeout: 10000,
        keepAlive: true,
        reconnectStrategy: (retries: number) => {
            if (retries > 20) {
                console.error("Redis max reconnect retries reached");
                return new Error("Redis max reconnect retries reached");
            }
            // Exponential backoff up to 3 seconds
            return Math.min(retries * 150, 3000);
        }
    }
});

redisClient.on("error", (err) => {
    // Log without crashing the process on transient socket disconnects
    console.error("Redis socket error:", err?.message || err);
});

redisClient.on("connect", () => {
    console.log("Redis socket connected");
});

redisClient.on("ready", () => {
    console.log("Redis client ready");
});

redisClient.on("reconnecting", () => {
    console.log("Redis client reconnecting...");
});
