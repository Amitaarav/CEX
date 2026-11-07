import { expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import axios from "axios";
import { app } from "./index";
import { resetState } from "./src/routes/user";
import type { Server } from "http";

let server: Server | null = null;
const PORT = 3000;
const BACKEND_URL = process.env.TS_BACKEND_URL || `http://127.0.0.1:${PORT}`;

beforeAll(async () => {
    // Start local server if not already running
    try {
        await axios.get(`${BACKEND_URL}/balance`);
    } catch (e: any) {
        if (e.code === "ECONNREFUSED") {
            await new Promise<void>((resolve) => {
                server = app.listen(PORT, () => resolve());
            });
        }
    }
});

beforeEach(() => {
    resetState();
});

afterAll(async () => {
    if (server) {
        await new Promise<void>((resolve) => {
            server!.close(() => resolve());
        });
    }
});

async function createAuthenticatedUser(usernamePrefix: string) {
    const username = usernamePrefix + "_" + Math.random().toString(36).substring(7);
    const password = "password123";

    await axios.post(`${BACKEND_URL}/signup`, {
        username,
        password
    });

    const signinRes = await axios.post(`${BACKEND_URL}/signin`, {
        username,
        password
    });

    const token = signinRes.data.token as string;
    const authHeaders = {
        headers: {
            Authorization: `Bearer ${token}`
        }
    };

    return { username, token, authHeaders };
}

test("signup works as expected", async () => {
    const username = "amit_" + Math.random().toString(36).substring(7);

    const response = await axios.post(`${BACKEND_URL}/signup`, {
        username: username,
        password: "123123"
    });

    expect(response.status).toBe(200);
    expect(response.data.message).toBe("Successfully signup");
});

test("signin works as expected", async () => {
    const username = "amit_" + Math.random().toString(36).substring(7);

    await axios.post(`${BACKEND_URL}/signup`, {
        username: username,
        password: "123123"
    });

    const response = await axios.post(`${BACKEND_URL}/signin`, {
        username: username,
        password: "123123"
    });

    expect(response.status).toBe(200);
    expect(response.data.token).toBeDefined();
    expect(typeof response.data.token).toBe("string");
});

test("balance works as expected", async () => {
    const { authHeaders } = await createAuthenticatedUser("balance_test");

    const balanceResponse = await axios.get(`${BACKEND_URL}/balance`, authHeaders);

    expect(balanceResponse.status).toBe(200);
    expect(balanceResponse.data.usdBalance).toEqual({ available: 0, locked: 0 });
    expect(balanceResponse.data.stockBalances).toEqual({});
});

test("onramp works as expected", async () => {
    const { authHeaders } = await createAuthenticatedUser("onramp_test");

    const onrampResponse = await axios.post(
        `${BACKEND_URL}/onramp`,
        { qty: 100 },
        authHeaders
    );

    expect(onrampResponse.status).toBe(200);

    const balanceRes = await axios.get(`${BACKEND_URL}/balance`, authHeaders);
    expect(balanceRes.data.usdBalance).toEqual({ available: 100, locked: 0 });
});

test("deposit asset works as expected", async () => {
    const { authHeaders } = await createAuthenticatedUser("deposit_test");

    const depositResponse = await axios.post(
        `${BACKEND_URL}/deposit/sol`,
        { qty: 5 },
        authHeaders
    );

    expect(depositResponse.status).toBe(200);
    expect(depositResponse.data.message).toBe("Successfully deposited");

    const balanceRes = await axios.get(`${BACKEND_URL}/balance`, authHeaders);
    expect(balanceRes.data.stockBalances.sol).toEqual({ available: 5, locked: 0 });
});

test("order endpoint rejects unauthenticated request", async () => {
    try {
        await axios.post(`${BACKEND_URL}/order`, {
            side: "bid",
            qty: 1,
            price: 100,
            asset: "sol"
        });
        expect.unreachable("Should have thrown 400");
    } catch (err: any) {
        expect(err.response.status).toBe(400);
    }
});

test("order endpoint rejects bid when user has insufficient USD funds", async () => {
    const { authHeaders } = await createAuthenticatedUser("bid_insufficient");

    // User has 0 USD, attempts to bid 1 SOL @ $100
    try {
        await axios.post(
            `${BACKEND_URL}/order`,
            {
                side: "bid",
                qty: 1,
                price: 100,
                asset: "sol"
            },
            authHeaders
        );
        expect.unreachable("Should have thrown 411");
    } catch (err: any) {
        expect(err.response.status).toBe(411);
        expect(err.response.data.message).toBe("You have insufficient funds");
    }
});

test("order endpoint rejects ask when user has insufficient stock balance", async () => {
    const { authHeaders } = await createAuthenticatedUser("ask_insufficient");

    // User has 0 SOL, attempts to sell 1 SOL
    try {
        await axios.post(
            `${BACKEND_URL}/order`,
            {
                side: "ask",
                qty: 1,
                price: 100,
                asset: "sol"
            },
            authHeaders
        );
        expect.unreachable("Should have thrown 411");
    } catch (err: any) {
        expect(err.response.status).toBe(411);
        expect(err.response.data.message).toBe("You have insufficient stocks");
    }
});

test("order endpoint places limit bid that rests in orderbook and locks USD", async () => {
    const { authHeaders } = await createAuthenticatedUser("bid_maker");

    // Onramp $500
    await axios.post(`${BACKEND_URL}/onramp`, { qty: 500 }, authHeaders);

    // Bid 2 SOL at $100 ($200 committed)
    const orderRes = await axios.post(
        `${BACKEND_URL}/order`,
        {
            side: "bid",
            qty: 2,
            price: 100,
            asset: "sol"
        },
        authHeaders
    );

    expect(orderRes.status).toBe(200);
    expect(orderRes.data.fills).toHaveLength(1);
    expect(orderRes.data.fills[0].type).toBe("orderbook_update");
    expect(orderRes.data.fills[0].qty).toBe(2);
    expect(orderRes.data.fills[0].price).toBe(100);

    // Check balances: $200 moved to locked, $300 available
    const balanceRes = await axios.get(`${BACKEND_URL}/balance`, authHeaders);
    expect(balanceRes.data.usdBalance).toEqual({ available: 300, locked: 200 });
});

test("order endpoint places limit ask that rests in orderbook and locks stock", async () => {
    const { authHeaders } = await createAuthenticatedUser("ask_maker");

    // Deposit 5 SOL
    await axios.post(`${BACKEND_URL}/deposit/sol`, { qty: 5 }, authHeaders);

    // Ask 2 SOL at $200
    const orderRes = await axios.post(
        `${BACKEND_URL}/order`,
        {
            side: "ask",
            qty: 2,
            price: 200,
            asset: "sol"
        },
        authHeaders
    );

    expect(orderRes.status).toBe(200);
    expect(orderRes.data.fills).toHaveLength(1);
    expect(orderRes.data.fills[0].type).toBe("orderbook_update");
    expect(orderRes.data.fills[0].qty).toBe(2);
    expect(orderRes.data.fills[0].price).toBe(200);

    // Check stock balance: 2 SOL moved to locked, 3 SOL available
    const balanceRes = await axios.get(`${BACKEND_URL}/balance`, authHeaders);
    expect(balanceRes.data.stockBalances.sol).toEqual({ available: 3, locked: 2 });
});

test("order endpoint matches taker ask against resting maker bid (full fill)", async () => {
    const buyer = await createAuthenticatedUser("full_buyer");
    const seller = await createAuthenticatedUser("full_seller");

    // Buyer onramps $500 and bids 3 SOL @ $100 ($300 locked)
    await axios.post(`${BACKEND_URL}/onramp`, { qty: 500 }, buyer.authHeaders);
    await axios.post(
        `${BACKEND_URL}/order`,
        {
            side: "bid",
            qty: 3,
            price: 100,
            asset: "sol"
        },
        buyer.authHeaders
    );

    // Seller deposits 3 SOL and sells 3 SOL @ $100
    await axios.post(`${BACKEND_URL}/deposit/sol`, { qty: 3 }, seller.authHeaders);
    const orderRes = await axios.post(
        `${BACKEND_URL}/order`,
        {
            side: "ask",
            qty: 3,
            price: 100,
            asset: "sol"
        },
        seller.authHeaders
    );

    expect(orderRes.status).toBe(200);
    expect(orderRes.data.fills).toHaveLength(1);
    expect(orderRes.data.fills[0].type).toBe("fill");
    expect(orderRes.data.fills[0].qty).toBe(3);
    expect(orderRes.data.fills[0].price).toBe(100);

    // Buyer should have 3 SOL available, locked USD 0, available USD 200
    const buyerBal = await axios.get(`${BACKEND_URL}/balance`, buyer.authHeaders);
    expect(buyerBal.data.usdBalance).toEqual({ available: 200, locked: 0 });
    expect(buyerBal.data.stockBalances.sol).toEqual({ available: 3, locked: 0 });

    // Seller should have 0 SOL, available USD 300
    const sellerBal = await axios.get(`${BACKEND_URL}/balance`, seller.authHeaders);
    expect(sellerBal.data.usdBalance).toEqual({ available: 300, locked: 0 });
    expect(sellerBal.data.stockBalances.sol).toEqual({ available: 0, locked: 0 });
});

test("order endpoint matches taker bid against resting maker ask (partial fill & remaining placed in book)", async () => {
    const seller = await createAuthenticatedUser("partial_seller");
    const buyer = await createAuthenticatedUser("partial_buyer");

    // Seller deposits 2 SOL and places ask for 2 SOL @ $100
    await axios.post(`${BACKEND_URL}/deposit/sol`, { qty: 2 }, seller.authHeaders);
    await axios.post(
        `${BACKEND_URL}/order`,
        {
            side: "ask",
            qty: 2,
            price: 100,
            asset: "sol"
        },
        seller.authHeaders
    );

    // Buyer onramps $500 and bids 5 SOL @ $100
    // Expected: 2 SOL filled from seller @ $100 ($200 spent), 3 SOL remaining rests in bids ($300 locked)
    await axios.post(`${BACKEND_URL}/onramp`, { qty: 500 }, buyer.authHeaders);
    const orderRes = await axios.post(
        `${BACKEND_URL}/order`,
        {
            side: "bid",
            qty: 5,
            price: 100,
            asset: "sol"
        },
        buyer.authHeaders
    );

    expect(orderRes.status).toBe(200);
    expect(orderRes.data.fills).toHaveLength(2);
    // Fill 1
    expect(orderRes.data.fills[0].type).toBe("fill");
    expect(orderRes.data.fills[0].qty).toBe(2);
    expect(orderRes.data.fills[0].price).toBe(100);
    // Unfilled remainder rests in book
    expect(orderRes.data.fills[1].type).toBe("orderbook_update");
    expect(orderRes.data.fills[1].qty).toBe(3);
    expect(orderRes.data.fills[1].price).toBe(100);

    // Buyer balances: 2 SOL available, 0 locked USD spent + 300 locked USD remaining, 0 available USD
    const buyerBal = await axios.get(`${BACKEND_URL}/balance`, buyer.authHeaders);
    expect(buyerBal.data.usdBalance).toEqual({ available: 0, locked: 300 });
    expect(buyerBal.data.stockBalances.sol).toEqual({ available: 2, locked: 0 });

    // Seller balances: 0 SOL available/locked, 200 USD available
    const sellerBal = await axios.get(`${BACKEND_URL}/balance`, seller.authHeaders);
    expect(sellerBal.data.usdBalance).toEqual({ available: 200, locked: 0 });
    expect(sellerBal.data.stockBalances.sol).toEqual({ available: 0, locked: 0 });
});

test("cancel endpoint cancels resting order and unlocks funds", async () => {
    const { authHeaders } = await createAuthenticatedUser("cancel_test");

    // Onramp $400 and place bid of 2 SOL @ $100 ($200 locked)
    await axios.post(`${BACKEND_URL}/onramp`, { qty: 400 }, authHeaders);
    await axios.post(
        `${BACKEND_URL}/order`,
        {
            side: "bid",
            qty: 2,
            price: 100,
            asset: "sol"
        },
        authHeaders
    );

    // Get order ID from orderbook snapshot
    const obRes = await axios.get(`${BACKEND_URL}/orderbook/sol`);
    const restingBid = obRes.data.bids[0].orders[0];
    expect(restingBid).toBeDefined();

    // Cancel order
    const cancelRes = await axios.post(
        `${BACKEND_URL}/cancel`,
        {
            orderId: restingBid.orderId,
            asset: "sol"
        },
        authHeaders
    );

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.data.message).toBe("Order cancelled successfully");

    // Funds should be unlocked back to available
    const balanceRes = await axios.get(`${BACKEND_URL}/balance`, authHeaders);
    expect(balanceRes.data.usdBalance).toEqual({ available: 400, locked: 0 });

    // Orderbook should be empty
    const obAfterRes = await axios.get(`${BACKEND_URL}/orderbook/sol`);
    expect(obAfterRes.data.bids).toHaveLength(0);
});
