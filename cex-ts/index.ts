import express from "express"
import { router as userRouter} from "./src/routes/user"
const app = express()

app.use(express.json())

app.use(userRouter);

app.listen(3000, () => {
    console.log("Server started running on port 3000")
})