
const express = require("express");
const router = express.Router();

// Test Players API
router.get("/", (req, res) => {
    res.status(200).json({
        message: "Players API is working"
    });
});

module.exports = router;
