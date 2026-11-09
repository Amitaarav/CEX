import type { Request, Response, NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
    id?: number;
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({
            message: "Unauthorized"
        });
    }

    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

    const secret = process.env.JWT_SECRET;
    if (!secret) {
        return res.status(500).json({
            message: "Internal Server Error"
        });
    }

    try {
        const decoded = jwt.verify(token, secret) as JwtPayload;
        if (!decoded || !decoded.id) {
            throw new Error("Incorrect id found");
        }
        (req as AuthenticatedRequest).id = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({
            message: "Unauthorized"
        });
    }
};

