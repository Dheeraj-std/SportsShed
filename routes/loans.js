const express = require("express");
const router = express.Router();
const { db } = require("../database/db");
const loanRules = require("../services/loanRules");

// 1. Retrieve all loans
router.get("/", (req, res) => {
    db.all("SELECT * FROM loans", [], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: "Error getting loans" });
        }
        res.status(200).json(rows);
    });
});

// 2. Retrieve joined loans (with player names and kit names)
router.get("/joined", (req, res) => {
    const sql = `
        SELECT
            loans.loan_id,
            players.player_name,
            kits.kit_name,
            loans.issue_date,
            loans.return_date,
            loans.status
        FROM loans
        JOIN players ON loans.player_id = players.player_id
        JOIN kits ON loans.kit_id = kits.kit_id
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: "Error getting joined loans" });
        }
        res.status(200).json(rows);
    });
});

// 3. Check kit availability endpoint
router.get("/check-availability/:kit_id", (req, res) => {
    const kit_id = req.params.kit_id;
    loanRules.checkKitAvailability(kit_id, (err, result) => {
        if (err) {
            return res.status(err.status || 500).json({ message: err.message });
        }
        res.status(200).json(result);
    });
});

// 4. Retrieve a specific loan by ID
router.get("/:id", (req, res) => {
    const id = req.params.id;
    const sql = "SELECT * FROM loans WHERE loan_id = ?";

    db.get(sql, [id], (err, row) => {
        if (err) {
            return res.status(500).json({ message: "Error getting loan" });
        }
        if (!row) {
            return res.status(404).json({ message: "Loan not found" });
        }
        res.status(200).json(row);
    });
});

// 5. Create a loan with NO DOUBLE BOOKING enforcement
router.post("/", (req, res) => {
    const { player_id, kit_id, issue_date } = req.body;

    if (!player_id || !kit_id || !issue_date) {
        return res.status(400).json({
            message: "Please provide player_id, kit_id and issue_date"
        });
    }

    loanRules.createLoanWithValidation({ player_id, kit_id, issue_date }, (err, result) => {
        if (err) {
            return res.status(err.status || 400).json({
                message: err.message,
                ...(err.conflict_reason && { conflict_reason: err.conflict_reason }),
                ...(err.active_loan && { active_loan: err.active_loan })
            });
        }

        res.status(201).json(result);
    });
});

// Helper handler for returning loans
function returnLoanHandler(req, res) {
    const loan_id = req.params.id;
    const { return_date } = req.body || {};

    loanRules.returnLoan(loan_id, return_date, (err, result) => {
        if (err) {
            return res.status(err.status || 400).json({ message: err.message });
        }
        res.status(200).json(result);
    });
}

// 6. Return loan endpoints (supports PUT, PATCH, and POST)
router.put("/:id/return", returnLoanHandler);
router.patch("/:id/return", returnLoanHandler);
router.post("/:id/return", returnLoanHandler);
router.put("/return/:id", returnLoanHandler);

// 7. General return endpoint via POST body (accepts { loan_id } or { kit_id })
router.post("/return", (req, res) => {
    const { loan_id, kit_id, return_date } = req.body || {};

    if (loan_id) {
        loanRules.returnLoan(loan_id, return_date, (err, result) => {
            if (err) {
                return res.status(err.status || 400).json({ message: err.message });
            }
            res.status(200).json(result);
        });
    } else if (kit_id) {
        loanRules.returnLoanByKit(kit_id, return_date, (err, result) => {
            if (err) {
                return res.status(err.status || 400).json({ message: err.message });
            }
            res.status(200).json(result);
        });
    } else {
        res.status(400).json({ message: "Please provide loan_id or kit_id to return" });
    }
});

// 8. Update a loan (supports marking as returned or general update)
router.put("/:id", (req, res) => {
    const loan_id = req.params.id;
    const { status, return_date } = req.body || {};

    if (status === "RETURNED" || return_date) {
        loanRules.returnLoan(loan_id, return_date, (err, result) => {
            if (err) {
                return res.status(err.status || 400).json({ message: err.message });
            }
            res.status(200).json(result);
        });
    } else {
        const sql = `
            UPDATE loans
            SET status = COALESCE(?, status),
                return_date = COALESCE(?, return_date)
            WHERE loan_id = ?
        `;
        db.run(sql, [status, return_date, loan_id], function (err) {
            if (err) {
                return res.status(400).json({ message: "Error updating loan: " + err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ message: "Loan not found" });
            }
            res.status(200).json({ message: "Loan updated successfully" });
        });
    }
});

module.exports = router;
