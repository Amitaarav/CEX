use std::collections::{BTreeMap, VecDeque};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OrderSide {
    Bid,
    Ask,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RestingOrder {
    pub order_id: u32,
    pub user_id: u32,
    pub qty: u32,
    pub filled_qty: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum MatchEvent {
    #[serde(rename = "fill")]
    Fill {
        buyer: u32,
        seller: u32,
        price: u32,
        qty: u32,
    },
    #[serde(rename = "orderbook_update")]
    OrderbookUpdate {
        #[serde(rename = "userId")]
        user_id: u32,
        price: u32,
        qty: u32,
        #[serde(rename = "orderId", skip_serializing_if = "Option::is_none")]
        order_id: Option<u32>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DepthLevel {
    pub price: u32,
    pub qty: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DepthResponse {
    pub symbol: String,
    pub bids: Vec<DepthLevel>,
    pub asks: Vec<DepthLevel>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CancelledOrder {
    pub user_id: u32,
    pub price: u32,
    pub qty: u32,
    pub side: OrderSide,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CancelResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<CancelledOrder>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PriceBucketSnapshot {
    pub price: u32,
    pub orders: Vec<RestingOrder>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OrderbookSnapshot {
    pub symbol: String,
    pub bids: Vec<PriceBucketSnapshot>,
    pub asks: Vec<PriceBucketSnapshot>,
}

pub struct Orderbook {
    pub symbol: String,
    order_id_counter: u32,
    bids: BTreeMap<u32, VecDeque<RestingOrder>>,
    asks: BTreeMap<u32, VecDeque<RestingOrder>>,
}

impl Orderbook {
    pub fn new(symbol: impl Into<String>) -> Self {
        Self {
            symbol: symbol.into(),
            order_id_counter: 1,
            bids: BTreeMap::new(),
            asks: BTreeMap::new(),
        }
    }

    pub fn add_order(
        &mut self,
        user_id: u32,
        side: OrderSide,
        price: u32,
        qty: u32,
    ) -> Vec<MatchEvent> {
        if qty == 0 || price == 0 {
            return vec![];
        }

        let mut fills = Vec::new();
        let mut original_user_left_qty = qty;

        match side {
            OrderSide::Bid => {
                // Buyer matches against resting asks (sellers), lowest price first
                let ask_prices: Vec<u32> = self.asks.keys().copied().collect();

                for bucket_price in ask_prices {
                    if price < bucket_price {
                        break;
                    }

                    let individual_orders = match self.asks.get_mut(&bucket_price) {
                        Some(orders) => orders,
                        None => continue,
                    };

                    while !individual_orders.is_empty() && original_user_left_qty > 0 {
                        let seller_order = individual_orders.front_mut().unwrap();
                        let left_qty = seller_order.qty - seller_order.filled_qty;

                        if left_qty > original_user_left_qty {
                            seller_order.filled_qty += original_user_left_qty;

                            fills.push(MatchEvent::Fill {
                                buyer: user_id,
                                seller: seller_order.user_id,
                                price: bucket_price,
                                qty: original_user_left_qty,
                            });

                            original_user_left_qty = 0;
                            break;
                        } else {
                            fills.push(MatchEvent::Fill {
                                buyer: user_id,
                                seller: seller_order.user_id,
                                price: bucket_price,
                                qty: left_qty,
                            });

                            original_user_left_qty -= left_qty;
                            individual_orders.pop_front();
                        }
                    }

                    if self.asks.get(&bucket_price).map_or(false, |b| b.is_empty()) {
                        self.asks.remove(&bucket_price);
                    }

                    if original_user_left_qty == 0 {
                        break;
                    }
                }

                // Unfilled quantity rests on bids
                if original_user_left_qty > 0 {
                    let order_id = self.order_id_counter;
                    self.order_id_counter += 1;

                    self.bids
                        .entry(price)
                        .or_default()
                        .push_back(RestingOrder {
                            order_id,
                            user_id,
                            qty,
                            filled_qty: qty - original_user_left_qty,
                        });

                    fills.push(MatchEvent::OrderbookUpdate {
                        user_id,
                        price,
                        qty: original_user_left_qty,
                        order_id: Some(order_id),
                    });
                }
            }

            OrderSide::Ask => {
                // Seller matches against resting bids (buyers), highest price first
                let bid_prices: Vec<u32> = self.bids.keys().copied().rev().collect();

                for bucket_price in bid_prices {
                    if price > bucket_price {
                        break;
                    }

                    let individual_orders = match self.bids.get_mut(&bucket_price) {
                        Some(orders) => orders,
                        None => continue,
                    };

                    while !individual_orders.is_empty() && original_user_left_qty > 0 {
                        let buyer_order = individual_orders.front_mut().unwrap();
                        let left_qty = buyer_order.qty - buyer_order.filled_qty;

                        if left_qty > original_user_left_qty {
                            buyer_order.filled_qty += original_user_left_qty;

                            fills.push(MatchEvent::Fill {
                                buyer: buyer_order.user_id,
                                seller: user_id,
                                price: bucket_price,
                                qty: original_user_left_qty,
                            });

                            original_user_left_qty = 0;
                            break;
                        } else {
                            fills.push(MatchEvent::Fill {
                                buyer: buyer_order.user_id,
                                seller: user_id,
                                price: bucket_price,
                                qty: left_qty,
                            });

                            original_user_left_qty -= left_qty;
                            individual_orders.pop_front();
                        }
                    }

                    if self.bids.get(&bucket_price).map_or(false, |b| b.is_empty()) {
                        self.bids.remove(&bucket_price);
                    }

                    if original_user_left_qty == 0 {
                        break;
                    }
                }

                // Unfilled quantity rests on asks
                if original_user_left_qty > 0 {
                    let order_id = self.order_id_counter;
                    self.order_id_counter += 1;

                    self.asks
                        .entry(price)
                        .or_default()
                        .push_back(RestingOrder {
                            order_id,
                            user_id,
                            qty,
                            filled_qty: qty - original_user_left_qty,
                        });

                    fills.push(MatchEvent::OrderbookUpdate {
                        user_id,
                        price,
                        qty: original_user_left_qty,
                        order_id: Some(order_id),
                    });
                }
            }
        }

        fills
    }

    pub fn cancel_order(&mut self, order_id: u32) -> CancelResult {
        // Search in bids
        let mut found_price = None;
        let mut cancelled_order = None;

        for (&price, bucket) in self.bids.iter_mut() {
            if let Some(pos) = bucket.iter().position(|o| o.order_id == order_id) {
                let order = bucket.remove(pos).unwrap();
                found_price = Some(price);
                cancelled_order = Some(CancelledOrder {
                    user_id: order.user_id,
                    price,
                    qty: order.qty - order.filled_qty,
                    side: OrderSide::Bid,
                });
                break;
            }
        }

        if let Some(price) = found_price {
            if self.bids.get(&price).map_or(false, |b| b.is_empty()) {
                self.bids.remove(&price);
            }
            return CancelResult {
                success: true,
                order: cancelled_order,
            };
        }

        // Search in asks
        found_price = None;
        cancelled_order = None;

        for (&price, bucket) in self.asks.iter_mut() {
            if let Some(pos) = bucket.iter().position(|o| o.order_id == order_id) {
                let order = bucket.remove(pos).unwrap();
                found_price = Some(price);
                cancelled_order = Some(CancelledOrder {
                    user_id: order.user_id,
                    price,
                    qty: order.qty - order.filled_qty,
                    side: OrderSide::Ask,
                });
                break;
            }
        }

        if let Some(price) = found_price {
            if self.asks.get(&price).map_or(false, |b| b.is_empty()) {
                self.asks.remove(&price);
            }
            return CancelResult {
                success: true,
                order: cancelled_order,
            };
        }

        CancelResult {
            success: false,
            order: None,
        }
    }

    pub fn get_depth(&self) -> DepthResponse {
        let mut bids = Vec::new();
        for (&price, bucket) in self.bids.iter().rev() {
            let total_qty: u32 = bucket.iter().map(|o| o.qty - o.filled_qty).sum();
            if total_qty > 0 {
                bids.push(DepthLevel { price, qty: total_qty });
            }
        }

        let mut asks = Vec::new();
        for (&price, bucket) in self.asks.iter() {
            let total_qty: u32 = bucket.iter().map(|o| o.qty - o.filled_qty).sum();
            if total_qty > 0 {
                asks.push(DepthLevel { price, qty: total_qty });
            }
        }

        DepthResponse {
            symbol: self.symbol.clone(),
            bids,
            asks,
        }
    }

    pub fn get_snapshot(&self) -> OrderbookSnapshot {
        let bids = self
            .bids
            .iter()
            .rev()
            .map(|(&price, bucket)| PriceBucketSnapshot {
                price,
                orders: bucket.iter().cloned().collect(),
            })
            .collect();

        let asks = self
            .asks
            .iter()
            .map(|(&price, bucket)| PriceBucketSnapshot {
                price,
                orders: bucket.iter().cloned().collect(),
            })
            .collect();

        OrderbookSnapshot {
            symbol: self.symbol.clone(),
            bids,
            asks,
        }
    }

    pub fn clear(&mut self) {
        self.bids.clear();
        self.asks.clear();
        self.order_id_counter = 1;
    }
}


