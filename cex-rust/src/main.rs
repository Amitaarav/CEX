use actix_web::{App, HttpServer, HttpResponse, Responder, post, web::{self,Json}};
use std::{collections::HashMap, future, sync::Mutex};
use serde:: {Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
struct SignupInput {
    pub username: String,
    pub password: String
}

#[derive(Serialize, Deserialize)]
struct SignupResponse {
    message: String
}

#[post("/signup")]
async fn sign_up(body: Json<SignupInput>, app_state: web::Data<AppState>) -> impl Responder {
    println!("{}", body.username);
    println!("{}", body.password);
    // println!("{}", app_state.users.len());

    let mut users = app_state.users.lock().unwrap();

    let mut user_index = app_state.user_index.lock().unwrap();

    let user_found = users.iter().find(|u | u.username == body.username);

    if user_found.is_none(){
            *user_index = *user_index + 1;
            users.push(User {
                id: *user_index,
                username: body.username.clone(),
                password: body.password.clone(),
                balance: 0
            });

            println!("{}", users.len());
            drop(users);

            HttpResponse::Ok().json(
                SignupResponse{
                    message: String::from("Signup successfully")
                }
            )
    }else{
        HttpResponse::Unauthorized().json(SignupResponse{
            message: String::from("User already exists")
        })
    }
}

struct User {
    id: u32,
    username: String,
    password: String,
    balance: u32,
}

enum BalanceMessage{
    Onramp(u32, u32),
    GetBalance(u32, future::channel::oneshot::Sender<u32>)
}
struct AppState {
    users: Mutex<Vec<User>>,
    user_index: Mutex<u32>,
    stock_balances: Mutex<HashMap<u32, HashMap<String, u32>>>,
    balances_tx: Sender<BalanceMessage>

}

#[derive(Deserialize)]
struct SigninInput {
    pub username: String,
    pub password: String
}

#[derive(Serialize)]
struct SigninResponse {
    message: String
}

#[post("/signin")]
async fn sign_in(body: Json<SigninInput>, app_state: web::Data<AppState>) -> impl Responder {
    let users = app_state.users.lock().unwrap();

    let user_found = users.iter().find(|user | user.username == body.username);

    match user_found {
        Some(user) => {
            if user.password == body.password {
                HttpResponse::Ok().json( SigninResponse{
                    message: String::from("Signin successfull")
                })
            }else{
                HttpResponse::Unauthorized().json( SigninResponse{
                    message: String::from("Invalud username or password")
                })
            }
        }

        None => {
            HttpResponse::Unauthorized().json( SigninResponse{
                message: String::from("Invalid username or password")
            })
        }
    }


}

// balance

// onramp

// deposit

#[actix_web::main]
async fn main() -> std::io::Result<()>{
    let app_state = web::Data::new(AppState{
        users: Mutex::new(vec![]),
        user_index: Mutex::new(0)
    });

    HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .service(sign_up)
            .service(sign_in)
    })
    .bind(("127.0.0.1", 3001))?
    .run()
    .await
}