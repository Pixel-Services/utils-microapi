const express = require("express");
const fileUpload = require("express-fileupload");
const rateLimit = require("express-rate-limit");
const routes = require("./routes/routes.js");

const app = express();

app.use(express.static("public"));
app.use(
  fileUpload({
    limits: { fileSize: 100 * 1024 * 1024 },
    abortOnLimit: true,
  })
);

const uploadLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: 1,
  message: "Too many requests, please try again after 30 seconds",
});
app.use("/mrpack/upload", uploadLimiter);

app.use("/", routes);

module.exports = app;