use actix_web::{HttpResponse, Responder, get, post, web::{self, json}};
use jsonwebtoken::{EncodingKey, Header, encode};

use crate::{AppState, middleware::AuthUser}