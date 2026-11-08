import type{ Request, Response, NextFunction } from "express";
import jwt, { type JwtPayload} from "jsonwebtoken"

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization;
    if(!token){
        return res.status(401).json({
            message: "Unauthorized"
        })
    }

    const secret = process.env.JWT_SECRET;
    if(!secret){
        return res.status(500).json({
            message: "Internal Server Error"
        })
    }
    try {
        const {id} = jwt.verify(token, secret) as JwtPayload;
        if(!id){
            throw new Error("Incorrect id found")
        }
        next()
    } catch (error) {
        return res.status(401).json({
            message: "Unauthorized"
        })
    }
}