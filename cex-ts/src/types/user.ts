import type { Fill, OrderbookUpdate } from "../orderbook";

export interface User {
    id: number;
    username: string;
    password: string;
}

export interface SignupInput {
    username: string;
    password: string;
}

export interface SigninInput {
    username: string;
    password: string;
}

export interface SignupResponse {
    message: string;
}

export interface SigninResponse {
    token: string;
}

export interface Claims {
    sub: number;
    exp: number;
}

export interface OnRampRequest {
    qty: number;
}

export interface DepositRequest {
    qty: number;
}

export interface OrderRequest {
    side: "bid" | "ask";
    qty: number;
    price: number;
    asset: "sol" | "eth";
}

export interface OrderResponse {
    message: string;
    fills: (Fill | OrderbookUpdate)[];
}

export interface CancelRequest {
    orderId: number;
    asset: "sol" | "eth";
}

export interface CancelResponse {
    message: string;
    cancelledOrder?: {
        userId: number;
        price: number;
        qty: number;
        side: "bid" | "ask";
    };
}

export interface BalanceItem {
    available: number;
    locked: number;
}

export interface BalanceResponse {
    usdBalance: BalanceItem;
    stockBalances: Record<string, BalanceItem>;
}
