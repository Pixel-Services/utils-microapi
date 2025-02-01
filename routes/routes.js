const express = require("express");
const mrpackUtilRouter = require("./mrpack");

const router = express.Router();

router.use("/mrpack", mrpackUtilRouter);

router.get("/", (req, res) => {
  res.send("Welcome to the Pixel Services Utilities API!");
});

module.exports = router;