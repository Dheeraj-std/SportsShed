
const express = require("express");
const router = express.Router();

// Test Loans API
router.get("/", (req, res) => {
    res.status(200).json({
        message: "Loans API is working"
    });
});

module.exports = router;
