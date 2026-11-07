import { describe, expect, test, beforeEach } from "bun:test";
import { Orderbook } from "./orderbook";

describe("Orderbook Matching Engine", () => {
    let orderbook: Orderbook;

    beforeEach(() => {
        orderbook = new Orderbook("sol");
    });

    test("places a bid on empty orderbook and returns orderbook_update", () => {
        const fills = orderbook.addOrder(1, "bid", 100, 5);

        expect(fills).toHaveLength(1);
        expect(fills[0]).toEqual({
            type: "orderbook_update",
            userId: 1,
            price: 100,
            qty: 5,
            orderId: 1
        });

        const snapshot = orderbook.getSnapshot();
        expect(snapshot.bids).toHaveLength(1);
        expect(snapshot.bids[0]!.price).toBe(100);
        expect(snapshot.bids[0]!.orders[0]!.qty).toBe(5);
        expect(snapshot.bids[0]!.orders[0]!.filledQty).toBe(0);
        expect(snapshot.asks).toHaveLength(0);
    });

    test("places an ask on empty orderbook and returns orderbook_update", () => {
        const fills = orderbook.addOrder(2, "ask", 150, 3);

        expect(fills).toHaveLength(1);
        expect(fills[0]).toEqual({
            type: "orderbook_update",
            userId: 2,
            price: 150,
            qty: 3,
            orderId: 1
        });

        const snapshot = orderbook.getSnapshot();
        expect(snapshot.asks).toHaveLength(1);
        expect(snapshot.asks[0]!.price).toBe(150);
        expect(snapshot.asks[0]!.orders[0]!.qty).toBe(3);
        expect(snapshot.asks[0]!.orders[0]!.filledQty).toBe(0);
        expect(snapshot.bids).toHaveLength(0);
    });

    test("does not match if bid price < ask price", () => {
        orderbook.addOrder(1, "bid", 100, 2);
        orderbook.addOrder(2, "ask", 105, 2);

        const snapshot = orderbook.getSnapshot();
        expect(snapshot.bids).toHaveLength(1);
        expect(snapshot.asks).toHaveLength(1);
    });

    test("matches full bid against resting ask at maker's ask price", () => {
        // Maker places ask at 100
        orderbook.addOrder(1, "ask", 100, 5);

        // Taker bids at 105 (willing to pay up to 105)
        const fills = orderbook.addOrder(2, "bid", 105, 5);

        expect(fills).toHaveLength(1);
        expect(fills[0]).toEqual({
            type: "fill",
            buyer: 2,
            seller: 1,
            price: 100, // matched at maker's price
            qty: 5
        });

        const snapshot = orderbook.getSnapshot();
        expect(snapshot.bids).toHaveLength(0);
        expect(snapshot.asks).toHaveLength(0);
    });

    test("matches full ask against resting bid at maker's bid price", () => {
        // Maker places bid at 100
        orderbook.addOrder(1, "bid", 100, 5);

        // Taker asks at 95 (willing to sell down to 95)
        const fills = orderbook.addOrder(2, "ask", 95, 5);

        expect(fills).toHaveLength(1);
        expect(fills[0]).toEqual({
            type: "fill",
            buyer: 1,
            seller: 2,
            price: 100, // matched at maker's price
            qty: 5
        });

        const snapshot = orderbook.getSnapshot();
        expect(snapshot.bids).toHaveLength(0);
        expect(snapshot.asks).toHaveLength(0);
    });

    test("partial fill where taker bid is larger than resting ask, remainder rests in bids", () => {
        orderbook.addOrder(1, "ask", 100, 3);

        const fills = orderbook.addOrder(2, "bid", 100, 5);

        expect(fills).toHaveLength(2);
        expect(fills[0]).toEqual({
            type: "fill",
            buyer: 2,
            seller: 1,
            price: 100,
            qty: 3
        });
        expect(fills[1]).toEqual({
            type: "orderbook_update",
            userId: 2,
            price: 100,
            qty: 2,
            orderId: 2
        });

        const snapshot = orderbook.getSnapshot();
        expect(snapshot.asks).toHaveLength(0);
        expect(snapshot.bids).toHaveLength(1);
        expect(snapshot.bids[0]!.price).toBe(100);
        expect(snapshot.bids[0]!.orders[0]!.qty).toBe(5);
        expect(snapshot.bids[0]!.orders[0]!.filledQty).toBe(3);
    });

    test("partial fill where resting ask is larger than taker bid, remainder stays in asks", () => {
        orderbook.addOrder(1, "ask", 100, 10);

        const fills = orderbook.addOrder(2, "bid", 100, 4);

        expect(fills).toHaveLength(1);
        expect(fills[0]).toEqual({
            type: "fill",
            buyer: 2,
            seller: 1,
            price: 100,
            qty: 4
        });

        const snapshot = orderbook.getSnapshot();
        expect(snapshot.bids).toHaveLength(0);
        expect(snapshot.asks).toHaveLength(1);
        expect(snapshot.asks[0]!.orders[0]!.qty).toBe(10);
        expect(snapshot.asks[0]!.orders[0]!.filledQty).toBe(4);
    });

    test("multiple asks matched in ascending price order (best ask first)", () => {
        orderbook.addOrder(1, "ask", 105, 2);
        orderbook.addOrder(2, "ask", 100, 2);
        orderbook.addOrder(3, "ask", 110, 2);

        // Buyer bids at 108 for 5 units: matches 2 @ 100, then 2 @ 105, remainder 1 rests at 108
        const fills = orderbook.addOrder(4, "bid", 108, 5);

        expect(fills).toHaveLength(3);
        expect(fills[0]).toEqual({
            type: "fill",
            buyer: 4,
            seller: 2,
            price: 100,
            qty: 2
        });
        expect(fills[1]).toEqual({
            type: "fill",
            buyer: 4,
            seller: 1,
            price: 105,
            qty: 2
        });
        expect(fills[2]).toEqual({
            type: "orderbook_update",
            userId: 4,
            price: 108,
            qty: 1,
            orderId: 4
        });

        const snapshot = orderbook.getSnapshot();
        expect(snapshot.bids).toHaveLength(1);
        expect(snapshot.bids[0]!.price).toBe(108);
        expect(snapshot.asks).toHaveLength(1);
        expect(snapshot.asks[0]!.price).toBe(110);
    });

    test("multiple bids matched in descending price order (best bid first)", () => {
        orderbook.addOrder(1, "bid", 95, 2);
        orderbook.addOrder(2, "bid", 100, 2);
        orderbook.addOrder(3, "bid", 90, 2);

        // Seller asks at 92 for 3 units: matches 2 @ 100, then 1 @ 95
        const fills = orderbook.addOrder(4, "ask", 92, 3);

        expect(fills).toHaveLength(2);
        expect(fills[0]).toEqual({
            type: "fill",
            buyer: 2,
            seller: 4,
            price: 100,
            qty: 2
        });
        expect(fills[1]).toEqual({
            type: "fill",
            buyer: 1,
            seller: 4,
            price: 95,
            qty: 1
        });

        const snapshot = orderbook.getSnapshot();
        expect(snapshot.asks).toHaveLength(0);
        expect(snapshot.bids).toHaveLength(2);
        // Best bid 95 has 1 left, and 90 has 2 left
        const bid95 = snapshot.bids.find(b => b.price === 95)!;
        expect(bid95.orders[0]!.qty - bid95.orders[0]!.filledQty).toBe(1);
        const bid90 = snapshot.bids.find(b => b.price === 90)!;
        expect(bid90.orders[0]!.qty - bid90.orders[0]!.filledQty).toBe(2);
    });

    test("FIFO matching at identical price level", () => {
        orderbook.addOrder(1, "bid", 100, 2);
        orderbook.addOrder(2, "bid", 100, 2);

        const fills = orderbook.addOrder(3, "ask", 100, 3);

        expect(fills).toHaveLength(2);
        expect(fills[0]).toEqual({
            type: "fill",
            buyer: 1, // first order
            seller: 3,
            price: 100,
            qty: 2
        });
        expect(fills[1]).toEqual({
            type: "fill",
            buyer: 2, // second order partially filled
            seller: 3,
            price: 100,
            qty: 1
        });

        const snapshot = orderbook.getSnapshot();
        expect(snapshot.bids[0]!.orders).toHaveLength(1);
        expect(snapshot.bids[0]!.orders[0]!.userId).toBe(2);
        expect(snapshot.bids[0]!.orders[0]!.qty - snapshot.bids[0]!.orders[0]!.filledQty).toBe(1);
    });

    test("cancelOrder successfully removes order and cleans empty bucket", () => {
        orderbook.addOrder(1, "bid", 100, 5);
        const snapshotBefore = orderbook.getSnapshot();
        const orderId = snapshotBefore.bids[0]!.orders[0]!.orderId;

        const cancelResult = orderbook.cancelOrder(orderId);
        expect(cancelResult.success).toBe(true);
        expect(cancelResult.order).toEqual({
            userId: 1,
            price: 100,
            qty: 5,
            side: "bid"
        });

        const snapshotAfter = orderbook.getSnapshot();
        expect(snapshotAfter.bids).toHaveLength(0);
    });

    test("cancelOrder returns false for non-existent order", () => {
        const cancelResult = orderbook.cancelOrder(99999);
        expect(cancelResult.success).toBe(false);
    });

    test("getDepth aggregates quantities by price level correctly", () => {
        orderbook.addOrder(1, "bid", 100, 2);
        orderbook.addOrder(2, "bid", 100, 3);
        orderbook.addOrder(3, "bid", 98, 5);
        orderbook.addOrder(4, "ask", 105, 4);
        orderbook.addOrder(5, "ask", 105, 1);
        orderbook.addOrder(6, "ask", 110, 2);

        const depth = orderbook.getDepth();
        expect(depth.bids).toEqual([
            { price: 100, qty: 5 },
            { price: 98, qty: 5 }
        ]);
        expect(depth.asks).toEqual([
            { price: 105, qty: 5 },
            { price: 110, qty: 2 }
        ]);
    });
});
