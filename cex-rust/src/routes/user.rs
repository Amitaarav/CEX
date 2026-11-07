use std::collections::HashMap;
use actix_web::{HttpResponse, Responder, get, post, web::{self, Json}};
use bcrypt::{DEFAULT_COST, hash, verify};
use jsonwebtoken::{EncodingKey, Header, encode};
use chrono::{Duration, Utc};
use crate::{AppState, BalanceMessage::Onramp, StockBalanceMessage::{Deposit, GetStockBalance}, middleware::AuthUser, types::user::{BalanceResponse, Claims, DepositeRequest, DepositResponse, OnRampRequest, SigninInput, SigninResponse, SignupResponse, User}};
use crate::types::user::SignupInput;
use futures::channel::oneshot;

#[post("/signup")]
async fn sign_up(body: Json<SignupInput>, app_state: web::Data<AppState>) -> impl Responder{
    let mut users = app_state.users.lock().unwrap();
    let mut user_index = app_state.user_index.lock().unwrap();

    let user_found = users.iter().find(|user| user.username == body.username);

    if user_found.is_none(){
        let hashed_password = match hash(&body.password, DEFAULT_COST) {
            Ok(h) => h,
            Err(_) => {
                return HttpResponse::InternalServerError().json(SignupResponse {
                    message: String::from("Failed to hash password"),
                });
            }
        };

        *user_index = *user_index + 1;
        users.push(User{
            id: user_index.clone(),
            username: body.username.clone(),
            password: hashed_password
        });

        let _ = app_state.balances_tx.send(Onramp(user_index.clone(),0));

        HttpResponse::Ok().json(SignupResponse{
            message: String::from("Successfully signup")
        })
    } else {
        HttpResponse::Unauthorized().json(SignupResponse{
            message: String::from("User already exists")
        })
    }
}

#[post("/signin")]
pub async fn sign_in(app_state: web::Data<AppState>, body: Json<SigninInput>) -> impl Responder {
    let users = app_state.users.lock().unwrap();
    let user_found = users.iter().find(|u| u.username == body.username);

    let Some(user) = user_found else {
        return HttpResponse::Unauthorized().json(SignupResponse {
            message: String::from("Incorrect credentials")
        });
    };

    let password_matches = verify(&body.password, &user.password).unwrap_or(false);
    if !password_matches {
        return HttpResponse::Unauthorized().json(SignupResponse {
            message: String::from("Incorrect credentials")
        });
    }

    let exp = Utc::now()
        .checked_add_signed(Duration::hours(24))
        .expect("valid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        sub: user.id,
        exp
    };

    let token = encode(&Header::default(), &claims, &EncodingKey::from_secret("secret".as_ref())).unwrap();
    
    HttpResponse::Ok().json(SigninResponse {
        token
    })
}

#[get("/balance")]
pub async fn balance(app_state: web::Data<AppState>, user: AuthUser) -> impl Responder{

    let user_id = user.0;

    let (tx, rx) = oneshot::channel::<u32>();
    let _ = app_state.balances_tx.send(crate::BalanceMessage::GetBalance(user_id, tx));

    let (stock_tx, stock_rx) = oneshot::channel::<HashMap<String, u32>>();
    let _ = app_state.stock_balances_tx.send(GetStockBalance(user_id, stock_tx));

    let usd_balance = rx.await.unwrap();
    let stock_balances = stock_rx.await.unwrap();

    HttpResponse::Ok().json( BalanceResponse {
        usd_balance,
        stock_balances
    })
}

#[post("/onramp")]
pub async fn onramp(app_state: web::Data<AppState>, user: AuthUser, body: Json<OnRampRequest>) -> impl Responder {
    let user_id = user.0;

    let _ = app_state.balances_tx.send(crate::BalanceMessage::Onramp(user_id, body.qty));

    HttpResponse::Ok()
}

#[post("/deposit/{asset_symbol}")]
pub async fn deposit(app_state: web::Data<AppState>, user: AuthUser, symbol: web::Path<String>, body: Json<DepositeRequest>)-> impl Responder {
    let user_id = user.0;
    let symbol = symbol.into_inner();

    let _ = app_state.stock_balances_tx.send(Deposit(user_id, symbol, body.qty));

    HttpResponse::Ok().json( DepositResponse {
        message: String::from("Successfully deposited")
    })
}

// this endpoints is hit by traders

// these both need to maintain a orderbook with a data structure
#[post("/order")]
pub async fn order()-> impl Responder{
    HttpResponse::Ok()
}
// #[post("/cancel")]
pub async fn cancel()->impl Responder{
    HttpResponse::Ok()
}
