import { Router, type Response } from "express";
import jwt from "jsonwebtoken";
import type {
    SignupResponse,
    DepositRequest,
    OnRampRequest,
    User,
    Claims,
    OrderRequest,
    OrderResponse,
    CancelRequest,
    CancelResponse,
    BalanceItem,
    BalanceResponse
} from "../types/user";
import { authMiddleware, type AuthRequest, JWT_SECRET } from "../middleware";
import { Orderbook } from "../orderbook";

export const router = Router();

let userIndex = 0;
const users: User[] = [];

const usdBalances: Map<number, BalanceItem> = new Map();
const stockBalances: Map<number, Map<string, BalanceItem>> = new Map();

const orderbooks: Record<string, Orderbook> = {
    sol: new Orderbook("sol"),
    eth: new Orderbook("eth")
};

export function getOrderbook(asset: string): Orderbook {
    const key = asset.toLowerCase();
    if (!orderbooks[key]) {
        orderbooks[key] = new Orderbook(key);
    }
    return orderbooks[key];
}

export function getUsdBalance(userId: number): BalanceItem {
    let balance = usdBalances.get(userId);
    if (!balance) {
        balance = { available: 0, locked: 0 };
        usdBalances.set(userId, balance);
    }
    return balance;
}

export function getStockBalance(userId: number, asset: string): BalanceItem {
    let userStocks = stockBalances.get(userId);
    if (!userStocks) {
        userStocks = new Map();
        stockBalances.set(userId, userStocks);
    }
    const key = asset.toLowerCase();
    let balance = userStocks.get(key);
    if (!balance) {
        balance = { available: 0, locked: 0 };
        userStocks.set(key, balance);
    }
    return balance;
}

export function resetState() {
    userIndex = 0;
    users.length = 0;
    usdBalances.clear();
    stockBalances.clear();
    for (const ob of Object.values(orderbooks)) {
        ob.clear();
    }
}

router.post("/signup", (req, res) => {
    const { username, password } = req.body;

    const userExist = users.find(user => user.username === username);

    if (userExist) {
        res.status(400).json({
            message: "User already exists"
        });
        return;
    }

    userIndex = userIndex + 1;
    users.push({
        id: userIndex,
        username,
        password
    });

    usdBalances.set(userIndex, { available: 0, locked: 0 });
    stockBalances.set(userIndex, new Map());

    res.json({
        message: "Successfully signup"
    } satisfies SignupResponse);
});

router.post("/signin", (req, res) => {
    const { username, password } = req.body;

    const userExist = users.find(user => user.username === username && user.password === password);

    if (!userExist) {
        res.status(401).json({
            message: "Incorrect credentials"
        } satisfies SignupResponse);
        return;
    }

    const claims: Claims = {
        sub: userExist.id,
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60
    };

    const token = jwt.sign(claims, JWT_SECRET);

    res.json({
        token
    });
});

router.get("/balance", authMiddleware, (req: AuthRequest, res) => {
    const userId = req.userId!;

    const usd = getUsdBalance(userId);
    const userStocks = stockBalances.get(userId) || new Map();
    const stockEntries = Object.fromEntries(userStocks.entries());

    res.json({
        usdBalance: usd,
        stockBalances: stockEntries
    } satisfies BalanceResponse);
});

router.post("/onramp", authMiddleware, (req: AuthRequest, res) => {
    const userId = req.userId!;
    const body = req.body as OnRampRequest;

    const current = getUsdBalance(userId);
    current.available += body.qty;

    res.status(200).json({
        message: "Successfully onramp"
    });
});

const depositHandler = (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const symbol = (req.params.asset_symbol as string).toLowerCase();
    const body = req.body as DepositRequest;

    const stock = getStockBalance(userId, symbol);
    stock.available += body.qty;

    res.json({
        message: "Successfully deposited"
    });
};

router.post("/deposit/:asset_symbol", authMiddleware, depositHandler);
router.post("/deposite/:asset_symbol", authMiddleware, depositHandler);

router.post("/order", authMiddleware, (req: AuthRequest, res) => {
    const userId = req.userId!;
    const body = req.body as OrderRequest;

    if (!body || !body.side || !body.qty || !body.price || !body.asset) {
        res.status(400).json({
            message: "Missing order fields (side, qty, price, asset required)"
        });
        return;
    }

    if (body.qty <= 0 || body.price <= 0) {
        res.status(400).json({
            message: "Invalid price or quantity"
        });
        return;
    }

    const asset = body.asset.toLowerCase();
    const orderbook = getOrderbook(asset);

    if (body.side === "bid") {
        const amountToSpend = body.price * body.qty;
        const buyerUsd = getUsdBalance(userId);

        if (buyerUsd.available < amountToSpend) {
            res.status(411).json({
                message: "You have insufficient funds"
            });
            return;
        }

        const fills = orderbook.addOrder(userId, "bid", body.price, body.qty);

        fills.forEach(fill => {
            if (fill.type === "fill") {
                // Buyer is taker (userId), seller is maker
                const buyerUsdBal = getUsdBalance(fill.buyer);
                const buyerStockBal = getStockBalance(fill.buyer, asset);
                const sellerUsdBal = getUsdBalance(fill.seller);
                const sellerStockBal = getStockBalance(fill.seller, asset);

                // Buyer pays USD from available
                buyerUsdBal.available -= fill.price * fill.qty;
                // Buyer receives stock in available
                buyerStockBal.available += fill.qty;

                // Seller was maker, so seller's stock was locked
                sellerStockBal.locked -= fill.qty;
                // Seller receives USD in available
                sellerUsdBal.available += fill.price * fill.qty;
            }

            if (fill.type === "orderbook_update") {
                // Unfilled bid rests on book: lock remaining USD
                const buyerUsdBal = getUsdBalance(fill.userId);
                buyerUsdBal.available -= fill.price * fill.qty;
                buyerUsdBal.locked += fill.price * fill.qty;
            }
        });

        res.status(200).json({
            message: "Order placed",
            fills
        } satisfies OrderResponse);
        return;
    }

    if (body.side === "ask") {
        const sellerStock = getStockBalance(userId, asset);

        if (sellerStock.available < body.qty) {
            res.status(411).json({
                message: "You have insufficient stocks"
            });
            return;
        }

        const fills = orderbook.addOrder(userId, "ask", body.price, body.qty);

        fills.forEach(fill => {
            if (fill.type === "fill") {
                // Seller is taker (userId), buyer is maker
                const buyerUsdBal = getUsdBalance(fill.buyer);
                const buyerStockBal = getStockBalance(fill.buyer, asset);
                const sellerUsdBal = getUsdBalance(fill.seller);
                const sellerStockBal = getStockBalance(fill.seller, asset);

                // Buyer was maker, so buyer's USD was locked at the bid price (fill.price)
                buyerUsdBal.locked -= fill.price * fill.qty;
                // Buyer receives stock in available
                buyerStockBal.available += fill.qty;

                // Seller was taker: gives stock from available
                sellerStockBal.available -= fill.qty;
                // Seller receives USD in available
                sellerUsdBal.available += fill.price * fill.qty;
            }

            if (fill.type === "orderbook_update") {
                // Unfilled ask rests on book: lock remaining stock
                const sellerStockBal = getStockBalance(fill.userId, asset);
                sellerStockBal.available -= fill.qty;
                sellerStockBal.locked += fill.qty;
            }
        });

        res.status(200).json({
            message: "Order placed",
            fills
        } satisfies OrderResponse);
        return;
    }

    res.status(400).json({
        message: "Invalid side: must be 'bid' or 'ask'"
    });
});

router.post("/cancel", authMiddleware, (req: AuthRequest, res) => {
    const userId = req.userId!;
    const body = req.body as CancelRequest;

    if (!body || !body.orderId || !body.asset) {
        res.status(400).json({
            message: "Missing orderId or asset"
        });
        return;
    }

    const asset = body.asset.toLowerCase();
    const orderbook = getOrderbook(asset);
    const cancelResult = orderbook.cancelOrder(body.orderId);

    if (!cancelResult.success || !cancelResult.order) {
        res.status(404).json({
            message: "Order not found"
        });
        return;
    }

    if (cancelResult.order.userId !== userId) {
        res.status(403).json({
            message: "Cannot cancel an order placed by another user"
        });
        return;
    }

    // Unlock funds
    if (cancelResult.order.side === "bid") {
        const usd = getUsdBalance(userId);
        const lockedAmount = cancelResult.order.price * cancelResult.order.qty;
        usd.locked -= lockedAmount;
        usd.available += lockedAmount;
    } else {
        const stock = getStockBalance(userId, asset);
        stock.locked -= cancelResult.order.qty;
        stock.available += cancelResult.order.qty;
    }

    res.status(200).json({
        message: "Order cancelled successfully",
        cancelledOrder: cancelResult.order
    } satisfies CancelResponse);
});

router.get("/orderbook/:asset", (req, res) => {
    const asset = (req.params.asset as string).toLowerCase();
    const orderbook = getOrderbook(asset);
    res.json(orderbook.getSnapshot());
});

router.get("/depth/:asset", (req, res) => {
    const asset = (req.params.asset as string).toLowerCase();
    const orderbook = getOrderbook(asset);
    res.json(orderbook.getDepth());
});
