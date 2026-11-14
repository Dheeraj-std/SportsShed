
const express = require("express");
const router = express.Router();
const { db } = require("../database/db");
const { validateKit } = require("../middleware/validation");

// 1. Add a new kit
router.post("/", validateKit, (req, res) => {
    const { kit_name, sport, quantity } = req.body;

    const sql = `
        INSERT INTO kits (kit_name, sport, quantity, available_quantity)
        VALUES (?, ?, ?, ?)
    `;

    db.run(sql, [kit_name, sport, quantity, quantity], function(err) {
        if (err) {
            return res.status(400).json({
                message: "Error adding kit"
            });
        }

        res.status(201).json({
            message: "Kit added successfully",
            kit_id: this.lastID
        });
    });
});

// 2. Get all kits
router.get("/", (req, res) => {
    const sql = "SELECT * FROM kits";

    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({
                message: "Error getting kits"
            });
        }

        res.status(200).json(rows);
    });
});

// 3. Get a kit by ID
router.get("/:id", (req, res) => {
    const id = req.params.id;

    const sql = "SELECT * FROM kits WHERE kit_id = ?";

    db.get(sql, [id], (err, row) => {
        if (err) {
            return res.status(500).json({
                message: "Error getting kit"
            });
        }

        if (!row) {
            return res.status(404).json({
                message: "Kit not found"
            });
        }

        res.status(200).json(row);
    });
});

// 4. Update kit details
router.put("/:id", validateKit, (req, res) => {
    const id = req.params.id;
    const { kit_name, sport, quantity } = req.body;

    const sql = `
        UPDATE kits
        SET kit_name = ?, sport = ?, quantity = ?,
            available_quantity = available_quantity + (? - quantity)
        WHERE kit_id = ?
    `;

    db.run(sql, [kit_name, sport, quantity, quantity, id], function(err) {
        if (err) {
            return res.status(400).json({
                message: "Error updating kit"
            });
        }

        if (this.changes === 0) {
            return res.status(404).json({
                message: "Kit not found"
            });
        }

        res.status(200).json({
            message: "Kit updated successfully"
        });
    });
});

// 5. Delete a kit
router.delete("/:id", (req, res) => {
    const id = req.params.id;

    const sql = "DELETE FROM kits WHERE kit_id = ?";

    db.run(sql, [id], function(err) {
        if (err) {
            return res.status(400).json({
                message: "Error deleting kit. The kit may have loan records."
            });
        }

        if (this.changes === 0) {
            return res.status(404).json({
                message: "Kit not found"
            });
        }

        res.status(200).json({
            message: "Kit deleted successfully"
        });
    });
});

module.exports = router;
