import { expect, test } from "bun:test";
import axios from "axios";

const BACKEND_URL = process.env.BACKEND_URL;

test("signup works as expected", async () => {
    const username = "amit";

    const response = await axios.post(`${BACKEND_URL}/signup`, {
        username: username,
        password: "123123"
    });

    expect(response.status).toBe(200);
    expect(response.data.message).toBe("Successfully signup");
});

test("signin works as expected", async () => {
    const username = "amit";

    const response = await axios.post(`${BACKEND_URL}/signin`, {
        username: username,
        password: "123123"
    });

    expect(response.status).toBe(200);
    expect(response.data.token).toBeDefined();
    expect(typeof response.data.token).toBe("string");
});

test("balance works as expected",async () => {
    const username = "amit" + Math.random();

    await axios.post(`${BACKEND_URL}/signup`, {
        username: username,
        password: "123123"
    });

    const response = await axios.post(`${BACKEND_URL}/signin`, {
        username: username,
        password: "123123"
    });

    const token = response.data.token;

    const balanceResponse = await axios.get(`${BACKEND_URL}/balance`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })

    expect(balanceResponse.status).toBe(200);
    expect(balanceResponse.data.usdBalance).toBe(0);
    expect(balanceResponse.data.stockBalances).toEqual({});
})