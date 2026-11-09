use actix_web::{get, App, HttpResponse, HttpServer, Responder};
mod config;

#[get("/")]
async fn hello()-> impl Responder{
    HttpResponse::Ok().body("Hello world!")
}

#[actix_web::main]
async fn main()-> Result<(), Box<dyn std::error::Error>> {
    let cfg = config::Config::from_env()?;
    println!("Listening on port{}", cfg.port);

    HttpServer::new(|| {
        App::new()
            .service(hello)
    })
    .bind(("127.0.0.1", cfg.port))?
    .run()
    .await  
}