import z from "zod";

export const OnrampSchema = z.object({
    usd: z.number()
})