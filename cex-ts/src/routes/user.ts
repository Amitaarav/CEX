import { Router } from "express";
import jwt from "jsonwebtoken"
import type { SignupResponse, DepositRequest, OnRampRequest, User, Claims } from "../types/user";
import { authMiddleware, type AuthRequest } from "../middleware";

export const router = Router();

let userIndex = 0;
const users: User[] = [];

const usdBalances: Map<number, { available: number, locked: number }> = new Map();
const stockBalances: Map<number, Map<String, { available: number, locked: number }>> = new Map();

router.post("/signup", (req, res) => {
    const { username, password} = req.body;

    const userExist = users.find(user => user.username === username);

    if(!userExist){
        userIndex = userIndex + 1;
        users.push({
            id: userIndex,
            username: username,
            password: password
        });
    }

    res.json({
        message: "Successfully signup"
    } satisfies SignupResponse)
})

router.post("/sigin", (req, res) => {
    const {username, password} = req.body;

    const userExist = users.find(user => user.username === username && user.password === password);

    if(!userExist){
        res.status(401).json({
            message: "Incorrect credentials"
        } satisfies SignupResponse);

        return;
    }4

    const claims: Claims = {
        sub: userExist.id,
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60
    }

    const token = jwt.sign(claims, "JWT_SECRET");

    res.json({
        token
    })
})

router.get("/balance", authMiddleware, (req: AuthRequest, res) => {
    const userId = req.userId!;
    const balance = stockBalances.get(userId) ?? new Map();

    let stock_balance = Object.fromEntries(balance);

    res.json({
        usdBalance: usdBalances.get(userId)?.available,
        stockBalances: stock_balance
    })
})

router.post("/onramp", authMiddleware, (req: AuthRequest, res) => {
    const userId = req.userId!;
    const body = req.body as OnRampRequest;
    usdBalances.set(userId, {
        locked: usdBalances.get(userId)?.locked!,
        available: usdBalances.get(userId)?.available! + body.qty,
    })

    res.sendStatus(200)
})

router.post("/deposite/:asset_symbol", authMiddleware, (req: AuthRequest, res)=>{
    const userId = req.userId!;
    const symbol = req.params.asset_symbol as string;
    const body = req.body as DepositRequest;

    const balances = stockBalances.get(userId)!;
    const existingBalance = balances.get(symbol);

    balances.set(symbol, {
        locked: existingBalance?.locked || 0,
        available: (existingBalance?.available || 0) + body.qty
    })

    res.json({
        message: "Successfully deposited"
    })
})
