import express from "express";
import { router as userRouter } from "./src/routes/user";

export const app = express();

app.use(express.json());
app.use(userRouter);

const PORT = process.env.PORT || 3000;

if (import.meta.main) {
    app.listen(PORT, () => {
        console.log(`Server started running on port ${PORT}`);
    });
}
