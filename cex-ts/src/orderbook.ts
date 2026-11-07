export class Orderbook{
    private symbol: string;
    private orderbook: {
        bids: Map<string, {
            orders: { userId: number, qty: number, filledQty: number, orderId: number}[],
            totalAvailable: number
        }>,

        asks: Map<string, {
            orders: { userId: number, qty: number, filledQty: number, orderId: number}[],
            totalAvailable: number
        }>,
    }

    constructor(symbol: string){
        this.symbol = symbol;
        this.orderbook = {
            bids: new Map(),
            asks: new Map()
        }
    }

    addOrder(userId: number, type: "bid" | "ask", price: number, qty: number): Fill[] {
        if(type === "bid"){
            // sorted order of all the asks
            const askPrices  = [...this.orderbook.asks.keys()].sort((a: string, b: string) => Number(a) - Number(b));

            let originalUserLeftQty  = qty;
            for(let i = 0; i < askPrices.length; i++){
                const bucketPrice = Number(askPrices[i]);
                if(price >= bucketPrice){
                    let individualOrders = this.orderbook.asks.get(bucketPrice.toString())!;
                    for(let j = 0; j < individualOrders?.orders.length; j++){
                        let sellerOrder = individualOrders?.orders[j]!;
                        let leftQty = sellerOrder.qty - sellerOrder.filledQty;

                        if(leftQty >= originalUserLeftQty){
                            individualOrders?.orders[j]?.filledQty += originalUserLeftQty;

                            fills.push({
                                buyer: userId,
                                seller: individualOrders.orders[j]?.userId,
                                qty: originalUserLeftQty,
                                price: bucketPrice
                            })

                            originalUserLeftQty = 0;
                            break;
                        }else{
                            fills.push({
                                buyer: userId,
                                seller: individualOrders.orders[j]?.userId,
                                qty: leftQty,
                                price: bucketPrice
                            })
                            originalUserLeftQty -= leftQty;
                            individualOrders.orders = individualOrders.orders.filter(x => x.orderId == individualOrders?.orders)
                        }
                    }
                }
            }
        }
    }

    cancelOrder(orderId: number){

    }
}