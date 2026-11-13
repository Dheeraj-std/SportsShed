
const express = require("express");
const router = express.Router();

// Test Kits API
router.get("/", (req, res) => {
    res.status(200).json({
        message: "Kits API is working"
    });
});

module.exports = router;
