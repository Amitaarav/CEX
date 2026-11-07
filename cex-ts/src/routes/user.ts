import { Router } from "express";
import jwt from "jsonwebtoken"
import type { SignupResponse, DepositRequest, OnRampRequest, User, Claims, OrderRequest } from "../types/user";
import { authMiddleware, type AuthRequest, JWT_SECRET } from "../middleware";

export const router = Router();

let userIndex = 0;
const users: User[] = [];

const usdBalances: Map<number, {available: number, locked: number}> = new Map();
const stockBalances: Map<number, Map<String, {available: number, locked: number}>> = new Map(); 

/**
 * {
 * 1: {
 *  SOL: 10,
 *  ETH: 20
 *  },
 * 2: {
 *  SOL: 5,
 *  ETH: 25
 * }
 * 
 * }
 */

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

    usdBalances.set(userIndex, {available: 0, locked: 0});
    stockBalances.set(userIndex, new Map());

    res.json({
        message: "Successfully signup"
    } satisfies SignupResponse)
})

router.post("/signin", (req, res) => {
    const {username, password} = req.body;

    const userExist = users.find(user => user.username === username && user.password === password);

    if(!userExist){
        res.status(401).json({
            message: "Incorrect credentials"
        } satisfies SignupResponse);

        return;
    }

    const claims: Claims = {
        sub: userExist.id,
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60
    }

    const token = jwt.sign(claims, JWT_SECRET);

    res.json({
        token
    })
})

router.get("/balance", authMiddleware, (req: AuthRequest, res) => {
    const userId = req.userId!;

    res.json({
        usdBalance: usdBalances.get(userId) ?? 0,
        stockBalances: stockBalances.get(userId) ?? {}
    })
})

router.post("/onramp", authMiddleware, (req: AuthRequest, res) => {
    const userId = req.userId!;
    const body = req.body as OnRampRequest;

    usdBalances.set(userId, {
        locked: usdBalances.get(userId)?.locked!,
        available: usdBalances.get(userId)?.available! + body.qty
    });

    res.status(200).json({
        message: "Successfully onramp"
    })
})

router.post("/deposite/:asset_symbol", authMiddleware, (req: AuthRequest, res)=>{
    const userId = req.userId!;
    const symbol = req.params.asset_symbol as string;
    const body = req.body as DepositRequest;

    const balances = stockBalances.get(userId)!;
    const existingBalance = balances.get(symbol);;

    balances.set(
        symbol,
        {
            locked: (existingBalance?.locked || 0), available: (existingBalance?.available || 0) + body.qty
        }
    )

    // balances.set(symbol, {
    //     locked: existingBalance?.locked || 0,
    //     available: (existingBalance?.available || 0) + body.qty
    // })

    res.json({
        message: "Successfully deposited"
    })
})

router.post("/order", authMiddleware, (req: AuthRequest, res) => {
    const userId = req.userId!;
    const body = req.body as OrderRequest;

    if(body.side == "bid"){
        const amountToSpend = body.price * body.qty;
        const userBalance = usdBalances.get(userId)?.available || 0;

        if(userBalance < amountToSpend){
            res.status(411).json({
                message: "You have insufficient funds"
            })
            return;
        }

        // locking balances / stocks

        // swap, orderbook or sit as locked
    }

    if(body.side == "ask"){
        const existingAmount = stockBalances.get(userId)?.get(body.asset)?.available || 0;
        if(body.qty > existingAmount){
            res.status(411).json({
                message: "You have insufficient stocks"
            })
            return;
        }
    }
})
