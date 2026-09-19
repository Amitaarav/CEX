export interface User {
    id: number,
    username: string,
    password: string
}

export interface SignupInput {
    username: string,
    password: string
}

export interface SigninInput {
    username: string,
    password: string
}

export interface SignupResponse{
    message: string
}

export interface SigninResponse{
    token: string
}

export interface Claims{
    sub: number,
    exp: number
}

export interface OnRampRequest {
    qty: number
}

export interface DepositRequest {
    qty: number    
}