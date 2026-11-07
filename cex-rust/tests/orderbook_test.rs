use cex_rust::orderbook::{
    CancelledOrder, DepthLevel, MatchEvent, OrderSide, Orderbook,
};

#[test]
fn test_places_bid_on_empty_orderbook() {
    let mut orderbook = Orderbook::new("sol");
    let fills = orderbook.add_order(1, OrderSide::Bid, 100, 5);

    assert_eq!(fills.len(), 1);
    assert_eq!(
        fills[0],
        MatchEvent::OrderbookUpdate {
            user_id: 1,
            price: 100,
            qty: 5,
            order_id: Some(1),
        }
    );

    let snapshot = orderbook.get_snapshot();
    assert_eq!(snapshot.bids.len(), 1);
    assert_eq!(snapshot.bids[0].price, 100);
    assert_eq!(snapshot.bids[0].orders[0].qty, 5);
    assert_eq!(snapshot.bids[0].orders[0].filled_qty, 0);
    assert!(snapshot.asks.is_empty());
}

#[test]
fn test_places_ask_on_empty_orderbook() {
    let mut orderbook = Orderbook::new("sol");
    let fills = orderbook.add_order(2, OrderSide::Ask, 150, 3);

    assert_eq!(fills.len(), 1);
    assert_eq!(
        fills[0],
        MatchEvent::OrderbookUpdate {
            user_id: 2,
            price: 150,
            qty: 3,
            order_id: Some(1),
        }
    );

    let snapshot = orderbook.get_snapshot();
    assert_eq!(snapshot.asks.len(), 1);
    assert_eq!(snapshot.asks[0].price, 150);
    assert_eq!(snapshot.asks[0].orders[0].qty, 3);
    assert_eq!(snapshot.asks[0].orders[0].filled_qty, 0);
    assert!(snapshot.bids.is_empty());
}

#[test]
fn test_does_not_match_if_bid_less_than_ask() {
    let mut orderbook = Orderbook::new("sol");
    orderbook.add_order(1, OrderSide::Bid, 100, 2);
    orderbook.add_order(2, OrderSide::Ask, 105, 2);

    let snapshot = orderbook.get_snapshot();
    assert_eq!(snapshot.bids.len(), 1);
    assert_eq!(snapshot.asks.len(), 1);
}

#[test]
fn test_matches_full_bid_against_resting_ask_at_makers_price() {
    let mut orderbook = Orderbook::new("sol");
    // Maker places ask at 100
    orderbook.add_order(1, OrderSide::Ask, 100, 5);

    // Taker bids at 105
    let fills = orderbook.add_order(2, OrderSide::Bid, 105, 5);

    assert_eq!(fills.len(), 1);
    assert_eq!(
        fills[0],
        MatchEvent::Fill {
            buyer: 2,
            seller: 1,
            price: 100,
            qty: 5,
        }
    );

    let snapshot = orderbook.get_snapshot();
    assert!(snapshot.bids.is_empty());
    assert!(snapshot.asks.is_empty());
}

#[test]
fn test_matches_full_ask_against_resting_bid_at_makers_price() {
    let mut orderbook = Orderbook::new("sol");
    // Maker places bid at 100
    orderbook.add_order(1, OrderSide::Bid, 100, 5);

    // Taker asks at 95
    let fills = orderbook.add_order(2, OrderSide::Ask, 95, 5);

    assert_eq!(fills.len(), 1);
    assert_eq!(
        fills[0],
        MatchEvent::Fill {
            buyer: 1,
            seller: 2,
            price: 100,
            qty: 5,
        }
    );

    let snapshot = orderbook.get_snapshot();
    assert!(snapshot.bids.is_empty());
    assert!(snapshot.asks.is_empty());
}

#[test]
fn test_partial_fill_taker_bid_larger_than_resting_ask() {
    let mut orderbook = Orderbook::new("sol");
    orderbook.add_order(1, OrderSide::Ask, 100, 3);

    let fills = orderbook.add_order(2, OrderSide::Bid, 100, 5);

    assert_eq!(fills.len(), 2);
    assert_eq!(
        fills[0],
        MatchEvent::Fill {
            buyer: 2,
            seller: 1,
            price: 100,
            qty: 3,
        }
    );
    assert_eq!(
        fills[1],
        MatchEvent::OrderbookUpdate {
            user_id: 2,
            price: 100,
            qty: 2,
            order_id: Some(2),
        }
    );

    let snapshot = orderbook.get_snapshot();
    assert!(snapshot.asks.is_empty());
    assert_eq!(snapshot.bids.len(), 1);
    assert_eq!(snapshot.bids[0].price, 100);
    assert_eq!(snapshot.bids[0].orders[0].qty, 5);
    assert_eq!(snapshot.bids[0].orders[0].filled_qty, 3);
}

#[test]
fn test_partial_fill_resting_ask_larger_than_taker_bid() {
    let mut orderbook = Orderbook::new("sol");
    orderbook.add_order(1, OrderSide::Ask, 100, 10);

    let fills = orderbook.add_order(2, OrderSide::Bid, 100, 4);

    assert_eq!(fills.len(), 1);
    assert_eq!(
        fills[0],
        MatchEvent::Fill {
            buyer: 2,
            seller: 1,
            price: 100,
            qty: 4,
        }
    );

    let snapshot = orderbook.get_snapshot();
    assert!(snapshot.bids.is_empty());
    assert_eq!(snapshot.asks.len(), 1);
    assert_eq!(snapshot.asks[0].orders[0].qty, 10);
    assert_eq!(snapshot.asks[0].orders[0].filled_qty, 4);
}

#[test]
fn test_multiple_asks_matched_in_ascending_price_order() {
    let mut orderbook = Orderbook::new("sol");
    orderbook.add_order(1, OrderSide::Ask, 105, 2);
    orderbook.add_order(2, OrderSide::Ask, 100, 2);
    orderbook.add_order(3, OrderSide::Ask, 110, 2);

    // Buyer bids at 108 for 5 units: matches 2 @ 100, then 2 @ 105, remainder 1 rests at 108
    let fills = orderbook.add_order(4, OrderSide::Bid, 108, 5);

    assert_eq!(fills.len(), 3);
    assert_eq!(
        fills[0],
        MatchEvent::Fill {
            buyer: 4,
            seller: 2,
            price: 100,
            qty: 2,
        }
    );
    assert_eq!(
        fills[1],
        MatchEvent::Fill {
            buyer: 4,
            seller: 1,
            price: 105,
            qty: 2,
        }
    );
    assert_eq!(
        fills[2],
        MatchEvent::OrderbookUpdate {
            user_id: 4,
            price: 108,
            qty: 1,
            order_id: Some(4),
        }
    );

    let snapshot = orderbook.get_snapshot();
    assert_eq!(snapshot.bids.len(), 1);
    assert_eq!(snapshot.bids[0].price, 108);
    assert_eq!(snapshot.asks.len(), 1);
    assert_eq!(snapshot.asks[0].price, 110);
}

#[test]
fn test_multiple_bids_matched_in_descending_price_order() {
    let mut orderbook = Orderbook::new("sol");
    orderbook.add_order(1, OrderSide::Bid, 95, 2);
    orderbook.add_order(2, OrderSide::Bid, 100, 2);
    orderbook.add_order(3, OrderSide::Bid, 90, 2);

    // Seller asks at 92 for 3 units: matches 2 @ 100, then 1 @ 95
    let fills = orderbook.add_order(4, OrderSide::Ask, 92, 3);

    assert_eq!(fills.len(), 2);
    assert_eq!(
        fills[0],
        MatchEvent::Fill {
            buyer: 2,
            seller: 4,
            price: 100,
            qty: 2,
        }
    );
    assert_eq!(
        fills[1],
        MatchEvent::Fill {
            buyer: 1,
            seller: 4,
            price: 95,
            qty: 1,
        }
    );

    let snapshot = orderbook.get_snapshot();
    assert!(snapshot.asks.is_empty());
    assert_eq!(snapshot.bids.len(), 2);
    let bid95 = snapshot.bids.iter().find(|b| b.price == 95).unwrap();
    assert_eq!(bid95.orders[0].qty - bid95.orders[0].filled_qty, 1);
    let bid90 = snapshot.bids.iter().find(|b| b.price == 90).unwrap();
    assert_eq!(bid90.orders[0].qty - bid90.orders[0].filled_qty, 2);
}

#[test]
fn test_fifo_matching_at_identical_price_level() {
    let mut orderbook = Orderbook::new("sol");
    orderbook.add_order(1, OrderSide::Bid, 100, 2);
    orderbook.add_order(2, OrderSide::Bid, 100, 2);

    let fills = orderbook.add_order(3, OrderSide::Ask, 100, 3);

    assert_eq!(fills.len(), 2);
    assert_eq!(
        fills[0],
        MatchEvent::Fill {
            buyer: 1, // first order
            seller: 3,
            price: 100,
            qty: 2,
        }
    );
    assert_eq!(
        fills[1],
        MatchEvent::Fill {
            buyer: 2, // second order partially filled
            seller: 3,
            price: 100,
            qty: 1,
        }
    );

    let snapshot = orderbook.get_snapshot();
    assert_eq!(snapshot.bids[0].orders.len(), 1);
    assert_eq!(snapshot.bids[0].orders[0].user_id, 2);
    assert_eq!(
        snapshot.bids[0].orders[0].qty - snapshot.bids[0].orders[0].filled_qty,
        1
    );
}

#[test]
fn test_cancel_order_successfully_removes_and_cleans_bucket() {
    let mut orderbook = Orderbook::new("sol");
    orderbook.add_order(1, OrderSide::Bid, 100, 5);
    let snapshot_before = orderbook.get_snapshot();
    let order_id = snapshot_before.bids[0].orders[0].order_id;

    let cancel_result = orderbook.cancel_order(order_id);
    assert!(cancel_result.success);
    assert_eq!(
        cancel_result.order,
        Some(CancelledOrder {
            user_id: 1,
            price: 100,
            qty: 5,
            side: OrderSide::Bid,
        })
    );

    let snapshot_after = orderbook.get_snapshot();
    assert!(snapshot_after.bids.is_empty());
}

#[test]
fn test_cancel_order_returns_false_for_non_existent() {
    let mut orderbook = Orderbook::new("sol");
    let cancel_result = orderbook.cancel_order(99999);
    assert!(!cancel_result.success);
    assert_eq!(cancel_result.order, None);
}

#[test]
fn test_get_depth_aggregates_quantities_by_price_level() {
    let mut orderbook = Orderbook::new("sol");
    orderbook.add_order(1, OrderSide::Bid, 100, 2);
    orderbook.add_order(2, OrderSide::Bid, 100, 3);
    orderbook.add_order(3, OrderSide::Bid, 98, 5);
    orderbook.add_order(4, OrderSide::Ask, 105, 4);
    orderbook.add_order(5, OrderSide::Ask, 105, 1);
    orderbook.add_order(6, OrderSide::Ask, 110, 2);

    let depth = orderbook.get_depth();
    assert_eq!(
        depth.bids,
        vec![
            DepthLevel { price: 100, qty: 5 },
            DepthLevel { price: 98, qty: 5 },
        ]
    );
    assert_eq!(
        depth.asks,
        vec![
            DepthLevel { price: 105, qty: 5 },
            DepthLevel { price: 110, qty: 2 },
        ]
    );
}

