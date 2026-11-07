use std::{collections::HashMap, sync::{Mutex, mpsc::{self, Sender}}, thread::spawn};

use actix_web::{App, HttpServer, web::{self}};

use crate::{
    BalanceMessage::{GetBalance, Onramp},
    StockBalanceMessage::{Deposit, GetStockBalance},
    routes::user::{balance, deposit, onramp, sign_in, sign_up},
    types::user::User,
};

pub mod types;
pub mod routes;
pub mod middleware;

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
    pub users: Mutex<Vec<User>>,
    pub balances_tx: Sender<BalanceMessage>,
    pub stock_balances_tx: Sender<StockBalanceMessage>,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {

    let (tx, rx) = mpsc::channel(); // mpsc: multiple producers, single consumer
    let (stock_tx, stock_rx) = mpsc::channel();

    // Actor framework - pattern
    let app_state = web::Data::new(AppState {
        user_index: Mutex::new(0),
        users: Mutex::new(vec![]),
        balances_tx: tx, // balances transmitter
        stock_balances_tx: stock_tx, // stock balances transmitter
    });

    // USD Balances worker thread
    spawn(move || {
        let mut balances: HashMap<u32, u32> = HashMap::new();

        while let Ok(message) = rx.recv() {
            match message {
                // onramp
                Onramp(user_id, amount) => {
                    let existing_amount = balances.get(&user_id).unwrap_or(&0);
                    balances.insert(
                        user_id, 
                        amount + existing_amount,
                    );
                }

                // retrieve balance 
                GetBalance(user_id, tx) => {
                    let user_balance = balances.get(&user_id).unwrap_or(&0);
                    let _ = tx.send(*user_balance);
                }
            }
        }
    });

    // Stock Balances worker thread
    spawn(move || {
        let mut stock_balances: HashMap<u32, HashMap<String, u32>> = HashMap::new();

        while let Ok(message) = stock_rx.recv() {
            match message {
                // deposit stock
                Deposit(user_id, symbol, amount) => {
                    let user_stocks = stock_balances.entry(user_id).or_default();
                    let existing_amount = user_stocks.get(&symbol).unwrap_or(&0);
                    user_stocks.insert(
                        symbol,
                        amount + existing_amount,
                    );
                }

                // retrieve stock balances
                GetStockBalance(user_id, tx) => {
                    let user_stocks = stock_balances
                        .get(&user_id)
                        .cloned()
                        .unwrap_or_default();
                    let _ = tx.send(user_stocks);
                }
            }
        }
    });

    HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .service(sign_up)
            .service(sign_in)
            .service(balance)
            .service(onramp)
            .service(deposit)
    })
    .bind(("127.0.0.1", 3001))?
    .run()
    .await
}
