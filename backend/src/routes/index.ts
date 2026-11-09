import { Router } from "express";
import { userRouter } from "./user";
import { onrampRouter } from "./onramp";

export const rootRouter = Router();

rootRouter.use(userRouter);
rootRouter.use(onrampRouter);

export { userRouter, onrampRouter };
