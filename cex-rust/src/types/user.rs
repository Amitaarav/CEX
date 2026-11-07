use std::collections::HashMap;

use serde::{Deserialize, Serialize};

pub struct User {
    pub id: u32,
    pub username: String,
    pub password: String
}

#[derive(Serialize, Deserialize)]
pub struct SignupInput{
    pub username: String,
    pub password: String
}
#[derive(Serialize, Deserialize)]
pub struct SigninInput{
    pub username: String,
    pub password: String
}

#[derive(Serialize, Deserialize)]
pub struct SignupResponse{
    pub message: String
}

#[derive(Serialize, Deserialize)]
pub struct SigninResponse{
    pub token: String
}

#[derive(Serialize, Deserialize)]
pub struct Claims{
    pub sub:u32,
    pub exp: usize
}

#[derive(Serialize, Deserialize)]
pub struct OnRampRequest{
    pub qty: u32
}

#[derive(Serialize, Deserialize)]
pub struct DepositeRequest {
    pub qty:u32
}

#[derive(Serialize, Deserialize)]
pub struct OnRampResponse {
    message: String    
}


#[derive(Serialize, Deserialize)]
pub struct DepositResponse {
    pub message: String
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceResponse {
    pub usd_balance: u32,
    pub stock_balances: HashMap<String, u32>
}

#[derive(Serialize, Deserialize)]
pub struct OrderRequest {
    pub side: crate::orderbook::OrderSide,
    pub qty: u32,
    pub price: u32,
    pub asset: String,
}

#[derive(Serialize, Deserialize)]
pub struct OrderResponse {
    pub message: String,
    pub fills: Vec<crate::orderbook::MatchEvent>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelRequest {
    pub order_id: u32,
    pub asset: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelResponse {
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancelled_order: Option<crate::orderbook::CancelledOrder>,
}

