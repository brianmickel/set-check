import "dotenv/config";
import express from "express";
import cors from "cors";
import { apiRouter } from "./routes/api.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const allowedOrigins = [
  "https://brianmickel.github.io",
  "https://www.brianmickel.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const frontendOrigin = process.env.FRONTEND_ORIGIN;
if (frontendOrigin) {
  allowedOrigins.push(frontendOrigin);
}

app.use(
  cors({
    origin: (origin, cb) => {
      if (origin === undefined || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
  })
);
app.use(express.json());

app.use("/api", apiRouter);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
