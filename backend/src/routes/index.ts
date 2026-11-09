import { Router } from "express";
import { userRouter } from "./user";
import { onrampRouter } from "./onramp";
import { depositRouter } from "./deposite";

export const rootRouter = Router();

rootRouter.use(userRouter);
rootRouter.use(onrampRouter);
rootRouter.use(depositRouter);

export { userRouter, onrampRouter, depositRouter };
