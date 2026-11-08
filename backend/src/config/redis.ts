import { createClient } from "redis";

export const redisClient = createClient({
    url: process.env.REDIS_URL
})

redisClient.on("error", (err) => {
    console.log("Unexpected Redis error: ", err);
})
