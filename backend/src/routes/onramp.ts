import { Router, type Request, type Response } from "express";
import { OnrampSchema } from "../types/onramp";
import { redisClient } from "../config/redis";
import { authMiddleware, type AuthenticatedRequest } from "../middlewares/authMiddleware";

export const onrampRouter = Router();

onrampRouter.post("/onramp", authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { data, success } = OnrampSchema.safeParse(req.body);

    if (!success) {
        return res.status(411).json({
            message: "Incorrect input"
        });
    }

    try {
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
    } catch (error) {
        console.error("Onramp error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

