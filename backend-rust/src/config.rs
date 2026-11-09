use serde::Deserialize;

#[derive(Deserialize)]
pub struct Config {
    pub port: u16
}

impl Config {
    pub fn from_env() -> Result<Self, io::Error> {
        dotenvy::dotenv().ok();

        let port: u16 = std::env::var("PORT")
            .unwrap_or_else(|_| "8080".into()) // default fallback
            .parse()
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        Ok(Self { port })
    }
}