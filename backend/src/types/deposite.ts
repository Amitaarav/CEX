import z from "zod";

export const DepositSchema = z.object({
    ticker: z.string().min(1),
    qty: z.number().positive(),
});

export const DepostSchema = DepositSchema;
