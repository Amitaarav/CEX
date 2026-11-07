use std::{collections::HashMap, sync::{Mutex, mpsc::Sender}};

pub mod types;
pub mod routes;
pub mod middleware;
pub mod orderbook;

pub enum BalanceMessage {
    Onramp(u32, u32),
    GetBalance(u32, futures::channel::oneshot::Sender<u32>),
}

pub enum StockBalanceMessage {
    Deposit(u32, String, u32), // user_id, asset_symbol, amount
    GetStockBalance(u32, futures::channel::oneshot::Sender<HashMap<String, u32>>),
}

pub struct AppState {
    pub user_index: Mutex<u32>,
    pub users: Mutex<Vec<types::user::User>>,
    pub balances_tx: Sender<BalanceMessage>,
    pub stock_balances_tx: Sender<StockBalanceMessage>,
}

