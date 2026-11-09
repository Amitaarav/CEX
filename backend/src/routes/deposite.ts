import { Router, type Request, type Response } from "express";
import { DepostSchema } from "../types/deposite";
import { redisClient } from "../config/redis";
import { authMiddleware, type AuthenticatedRequest } from "../middlewares/authMiddleware";

export const depositRouter = Router();

depositRouter.post("/deposit", authMiddleware, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { data, success } = DepostSchema.safeParse(req.body);

    if (!success) {
        return res.status(411).json({
            message: "Incorrect input"
        });
    }

    try {
        await redisClient.lPush("engine", JSON.stringify({
            type: "deposit",
            payload: {
                userId: authReq.id,
                qty: data.qty,
                ticker: data.ticker,
            }
        }));

        // get acknowledge from engine first

        return res.status(200).json({
            message: "Deposit request has been sent to the backend"
        });
    } catch (error) {
        console.error("Deposit error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});
