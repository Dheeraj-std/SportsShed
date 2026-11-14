
const express = require("express");
const router = express.Router();
const { db } = require("../database/db");

router.get("/", (req, res) => {
    db.all("SELECT * FROM loans", (err, rows) => {
        if (err) {
            res.status(500).json({ message: "Error getting loans" });
        } else {
            res.status(200).json(rows);
        }
    });
});

router.get("/joined", (req, res) => {
    const sql = `
        SELECT
            loans.loan_id,
            players.player_name,
            kits.kit_name,
            loans.issue_date,
            loans.return_date
        FROM loans
        JOIN players ON loans.player_id = players.player_id
        JOIN kits ON loans.kit_id = kits.kit_id
    `;

    db.all(sql, (err, rows) => {
        if (err) {
            res.status(500).json({ message: "Error getting joined loans" });
        } else {
            res.status(200).json(rows);
        }
    });
});

router.post("/", (req, res) => {
    const { player_id, kit_id, issue_date } = req.body;

    if (!player_id || !kit_id || !issue_date) {
        return res.status(400).json({
            message: "Please provide player_id, kit_id and issue_date"
        });
    }

    const sql = `
        INSERT INTO loans (player_id, kit_id, issue_date)
        VALUES (?, ?, ?)
    `;

    db.run(sql, [player_id, kit_id, issue_date], function(err) {
        if (err) {
            return res.status(400).json({
                message: "Error creating loan"
            });
        }

        res.status(201).json({
            message: "Loan created successfully",
            loan_id: this.lastID
        });
    });
});

module.exports = router;
