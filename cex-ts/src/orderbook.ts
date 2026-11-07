export interface Fill {
    type: "fill";
    buyer: number;
    seller: number;
    price: number;
    qty: number;
}

export interface OrderbookUpdate {
    type: "orderbook_update";
    userId: number;
    price: number;
    qty: number;
    orderId?: number;
}

export interface RestingOrder {
    orderId: number;
    userId: number;
    qty: number;
    filledQty: number;
}

export interface DepthLevel {
    price: number;
    qty: number;
}

export class Orderbook {
    private symbol: string;
    private orderIdCounter: number = 1;
    private orderbook: {
        bids: Map<string, {
            orders: RestingOrder[];
        }>;
        asks: Map<string, {
            orders: RestingOrder[];
        }>;
    };

    constructor(symbol: string) {
        this.symbol = symbol;
        this.orderbook = {
            bids: new Map(),
            asks: new Map()
        };
    }

    addOrder(userId: number, type: "bid" | "ask", price: number, qty: number): (Fill | OrderbookUpdate)[] {
        if (qty <= 0 || price <= 0) {
            return [];
        }

        const fills: (Fill | OrderbookUpdate)[] = [];
        let originalUserLeftQty = qty;

        if (type === "bid") {
            // Buyer matches against resting asks (sellers), lowest price first
            const askPrices = [...this.orderbook.asks.keys()].sort((a: string, b: string) => Number(a) - Number(b));

            for (const priceStr of askPrices) {
                const bucketPrice = Number(priceStr);

                // Buyer is only willing to buy at or below their bid price
                if (price < bucketPrice) {
                    break;
                }

                const individualOrders = this.orderbook.asks.get(priceStr);
                if (!individualOrders) continue;

                while (individualOrders.orders.length > 0 && originalUserLeftQty > 0) {
                    const sellerOrder = individualOrders.orders[0];
                    if (!sellerOrder) break;

                    const leftQty = sellerOrder.qty - sellerOrder.filledQty;

                    if (leftQty > originalUserLeftQty) {
                        sellerOrder.filledQty += originalUserLeftQty;

                        fills.push({
                            type: "fill",
                            buyer: userId,
                            seller: sellerOrder.userId,
                            qty: originalUserLeftQty,
                            price: bucketPrice
                        });

                        originalUserLeftQty = 0;
                        break;
                    } else {
                        // leftQty <= originalUserLeftQty: order at front is completely filled
                        fills.push({
                            type: "fill",
                            buyer: userId,
                            seller: sellerOrder.userId,
                            qty: leftQty,
                            price: bucketPrice
                        });

                        originalUserLeftQty -= leftQty;
                        sellerOrder.filledQty += leftQty;
                        individualOrders.orders.shift();
                    }
                }

                if (individualOrders.orders.length === 0) {
                    this.orderbook.asks.delete(priceStr);
                }

                if (originalUserLeftQty === 0) {
                    break;
                }
            }

            // Unfilled quantity rests in bids
            if (originalUserLeftQty > 0) {
                const priceKey = price.toString();
                if (!this.orderbook.bids.has(priceKey)) {
                    this.orderbook.bids.set(priceKey, {
                        orders: []
                    });
                }

                const orderId = this.orderIdCounter++;
                this.orderbook.bids.get(priceKey)!.orders.push({
                    orderId,
                    userId,
                    qty,
                    filledQty: qty - originalUserLeftQty
                });

                fills.push({
                    type: "orderbook_update",
                    userId,
                    price,
                    qty: originalUserLeftQty,
                    orderId
                });
            }
        }

        if (type === "ask") {
            // Seller matches against resting bids (buyers), highest price first
            const bidPrices = [...this.orderbook.bids.keys()].sort((a: string, b: string) => Number(b) - Number(a));

            for (const priceStr of bidPrices) {
                const bucketPrice = Number(priceStr);

                // Match if buyer's bid price is at or above seller's ask price
                if (bucketPrice < price) {
                    break;
                }

                const individualOrders = this.orderbook.bids.get(priceStr);
                if (!individualOrders) continue;

                while (individualOrders.orders.length > 0 && originalUserLeftQty > 0) {
                    const buyerOrder = individualOrders.orders[0];
                    if (!buyerOrder) break;

                    const leftQty = buyerOrder.qty - buyerOrder.filledQty;

                    if (leftQty > originalUserLeftQty) {
                        buyerOrder.filledQty += originalUserLeftQty;

                        fills.push({
                            type: "fill",
                            buyer: buyerOrder.userId,
                            seller: userId,
                            qty: originalUserLeftQty,
                            price: bucketPrice
                        });

                        originalUserLeftQty = 0;
                        break;
                    } else {
                        // leftQty <= originalUserLeftQty: order at front is completely filled
                        fills.push({
                            type: "fill",
                            buyer: buyerOrder.userId,
                            seller: userId,
                            qty: leftQty,
                            price: bucketPrice
                        });

                        originalUserLeftQty -= leftQty;
                        buyerOrder.filledQty += leftQty;
                        individualOrders.orders.shift();
                    }
                }

                if (individualOrders.orders.length === 0) {
                    this.orderbook.bids.delete(priceStr);
                }

                if (originalUserLeftQty === 0) {
                    break;
                }
            }

            // Unfilled quantity rests in asks
            if (originalUserLeftQty > 0) {
                const priceKey = price.toString();
                if (!this.orderbook.asks.has(priceKey)) {
                    this.orderbook.asks.set(priceKey, {
                        orders: []
                    });
                }

                const orderId = this.orderIdCounter++;
                this.orderbook.asks.get(priceKey)!.orders.push({
                    orderId,
                    userId,
                    qty,
                    filledQty: qty - originalUserLeftQty
                });

                fills.push({
                    type: "orderbook_update",
                    userId,
                    price,
                    qty: originalUserLeftQty,
                    orderId
                });
            }
        }

        return fills;
    }

    cancelOrder(orderId: number): { success: boolean; order?: { userId: number; price: number; qty: number; side: "bid" | "ask" } } {
        for (const [priceStr, bucket] of this.orderbook.bids.entries()) {
            const index = bucket.orders.findIndex(o => o.orderId === orderId);
            if (index !== -1) {
                const cancelled = bucket.orders[index];
                if (!cancelled) continue;

                bucket.orders.splice(index, 1);
                if (bucket.orders.length === 0) {
                    this.orderbook.bids.delete(priceStr);
                }
                return {
                    success: true,
                    order: {
                        userId: cancelled.userId,
                        price: Number(priceStr),
                        qty: cancelled.qty - cancelled.filledQty,
                        side: "bid"
                    }
                };
            }
        }

        for (const [priceStr, bucket] of this.orderbook.asks.entries()) {
            const index = bucket.orders.findIndex(o => o.orderId === orderId);
            if (index !== -1) {
                const cancelled = bucket.orders[index];
                if (!cancelled) continue;

                bucket.orders.splice(index, 1);
                if (bucket.orders.length === 0) {
                    this.orderbook.asks.delete(priceStr);
                }
                return {
                    success: true,
                    order: {
                        userId: cancelled.userId,
                        price: Number(priceStr),
                        qty: cancelled.qty - cancelled.filledQty,
                        side: "ask"
                    }
                };
            }
        }

        return { success: false };
    }

    getDepth(): { symbol: string; bids: DepthLevel[]; asks: DepthLevel[] } {
        const bids: DepthLevel[] = [];
        for (const [priceStr, bucket] of this.orderbook.bids.entries()) {
            const totalQty = bucket.orders.reduce((sum, o) => sum + (o.qty - o.filledQty), 0);
            if (totalQty > 0) {
                bids.push({ price: Number(priceStr), qty: totalQty });
            }
        }
        bids.sort((a, b) => b.price - a.price);

        const asks: DepthLevel[] = [];
        for (const [priceStr, bucket] of this.orderbook.asks.entries()) {
            const totalQty = bucket.orders.reduce((sum, o) => sum + (o.qty - o.filledQty), 0);
            if (totalQty > 0) {
                asks.push({ price: Number(priceStr), qty: totalQty });
            }
        }
        asks.sort((a, b) => a.price - b.price);

        return {
            symbol: this.symbol,
            bids,
            asks
        };
    }

    getSnapshot() {
        return {
            symbol: this.symbol,
            bids: Array.from(this.orderbook.bids.entries()).map(([price, bucket]) => ({
                price: Number(price),
                orders: bucket.orders.map(o => ({ ...o }))
            })),
            asks: Array.from(this.orderbook.asks.entries()).map(([price, bucket]) => ({
                price: Number(price),
                orders: bucket.orders.map(o => ({ ...o }))
            }))
        };
    }

    clear() {
        this.orderbook.bids.clear();
        this.orderbook.asks.clear();
        this.orderIdCounter = 1;
    }
}
