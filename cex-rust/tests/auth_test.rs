use actix_web::{test, web, App};
use cex_rust::{
    AppState,
    routes::user::{sign_in, sign_up},
    types::user::{SigninInput, SignupInput},
};

#[actix_web::test]
async fn test_password_is_hashed_and_verified() {
    let (tx, _rx) = std::sync::mpsc::channel();
    let (stock_tx, _stock_rx) = std::sync::mpsc::channel();
    let app_state = web::Data::new(AppState {
        user_index: std::sync::Mutex::new(0),
        users: std::sync::Mutex::new(vec![]),
        balances_tx: tx,
        stock_balances_tx: stock_tx,
    });

    let app = test::init_service(
        App::new()
            .app_data(app_state.clone())
            .service(sign_up)
            .service(sign_in),
    )
    .await;

    // 1. Sign up
    let signup_req = test::TestRequest::post()
        .uri("/signup")
        .set_json(&SignupInput {
            username: "amit".to_string(),
            password: "amitpassword".to_string(),
        })
        .to_request();
    let resp = test::call_service(&app, signup_req).await;
    assert_eq!(resp.status(), 200);

    // 2. Verify password is NOT stored in plain text and is a bcrypt hash
    let users = app_state.users.lock().unwrap();
    let user = users
        .iter()
        .find(|u| u.username == "amit")
        .expect("user should exist");
    assert_ne!(user.password, "amitpassword");
    assert!(
        user.password.starts_with("$2b$")
            || user.password.starts_with("$2a$")
            || user.password.starts_with("$2y$")
    );
    drop(users);

    // 3. Sign in with correct password
    let signin_req = test::TestRequest::post()
        .uri("/signin")
        .set_json(&SigninInput {
            username: "amit".to_string(),
            password: "amitpassword".to_string(),
        })
        .to_request();
    let signin_resp = test::call_service(&app, signin_req).await;
    assert_eq!(signin_resp.status(), 200);

    // 4. Sign in with incorrect password
    let wrong_req = test::TestRequest::post()
        .uri("/signin")
        .set_json(&SigninInput {
            username: "amit".to_string(),
            password: "wrongpassword".to_string(),
        })
        .to_request();
    let wrong_resp = test::call_service(&app, wrong_req).await;
    assert_eq!(wrong_resp.status(), 401);
}

