
const express = require("express");
const router = express.Router();
const { db } = require("../database/db");

// 1. Add a new player
router.post("/", (req, res) => {
    const { player_name, email, phone } = req.body;

    const sql = "INSERT INTO players (player_name, email, phone) VALUES (?, ?, ?)";

    db.run(sql, [player_name, email, phone], function(err) {
        if (err) {
            return res.status(400).json({ message: "Error adding player" });
        }

        res.status(201).json({
            message: "Player added successfully",
            player_id: this.lastID
        });
    });
});

// 2. Get all players
router.get("/", (req, res) => {
    const sql = "SELECT * FROM players";

    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ message: "Error getting players" });
        }

        res.status(200).json(rows);
    });
});

// 3. Get a player by ID
router.get("/:id", (req, res) => {
    const id = req.params.id;

    const sql = "SELECT * FROM players WHERE player_id = ?";

    db.get(sql, [id], (err, row) => {
        if (err) {
            return res.status(500).json({ message: "Error getting player" });
        }

        if (!row) {
            return res.status(404).json({ message: "Player not found" });
        }

        res.status(200).json(row);
    });
});

// 4. Update a player
router.put("/:id", (req, res) => {
    const id = req.params.id;
    const { player_name, email, phone } = req.body;

    const sql = "UPDATE players SET player_name = ?, email = ?, phone = ? WHERE player_id = ?";

    db.run(sql, [player_name, email, phone, id], function(err) {
        if (err) {
            return res.status(400).json({ message: "Error updating player" });
        }

        if (this.changes === 0) {
            return res.status(404).json({ message: "Player not found" });
        }

        res.status(200).json({ message: "Player updated successfully" });
    });
});

// 5. Delete a player
router.delete("/:id", (req, res) => {
    const id = req.params.id;

    const sql = "DELETE FROM players WHERE player_id = ?";

    db.run(sql, [id], function(err) {
        if (err) {
            return res.status(400).json({
                message: "Error deleting player. Player may have loan records."
            });
        }

        if (this.changes === 0) {
            return res.status(404).json({ message: "Player not found" });
        }

        res.status(200).json({ message: "Player deleted successfully" });
    });
});

module.exports = router;
