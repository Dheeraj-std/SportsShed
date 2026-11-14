const { db } = require("../database/db");

/**
 * Service to enforce business rules for loans:
 * 1. Kit Availability Check: Prevent double booking of equipment.
 * 2. Active Loan Enforcement: Same kit cannot have two active loans simultaneously.
 * 3. Equipment Return Handling: Mark loan as returned and restore kit availability.
 */

/**
 * Check if a kit is available for loan (no active loan and in stock).
 * Active loan definition: status = 'ACTIVE' OR return_date IS NULL.
 */
function checkKitAvailability(kit_id, callback) {
    const kitSql = "SELECT * FROM kits WHERE kit_id = ?";
    db.get(kitSql, [kit_id], (err, kit) => {
        if (err) {
            return callback({ status: 500, message: "Error checking kit availability: " + err.message });
        }
        if (!kit) {
            return callback({ status: 404, message: "Kit not found" });
        }

        // Check if there is an active loan for this kit
        const activeLoanSql = `
            SELECT * FROM loans 
            WHERE kit_id = ? AND (status = 'ACTIVE' OR return_date IS NULL)
        `;
        db.get(activeLoanSql, [kit_id], (err, activeLoan) => {
            if (err) {
                return callback({ status: 500, message: "Error verifying active loans: " + err.message });
            }

            if (activeLoan) {
                return callback(null, {
                    exists: true,
                    available: false,
                    reason: "ACTIVE_LOAN",
                    message: `Kit ${kit_id} (${kit.kit_name}) is currently on loan and cannot be double booked.`,
                    kit,
                    activeLoan
                });
            }

            // Also check available quantity
            if (kit.available_quantity <= 0) {
                return callback(null, {
                    exists: true,
                    available: false,
                    reason: "OUT_OF_STOCK",
                    message: `Kit ${kit_id} (${kit.kit_name}) is currently out of stock.`,
                    kit
                });
            }

            return callback(null, {
                exists: true,
                available: true,
                kit
            });
        });
    });
}

/**
 * Create a new loan with full validation and double-booking prevention.
 */
function createLoanWithValidation({ player_id, kit_id, issue_date }, callback) {
    if (!player_id || !kit_id || !issue_date) {
        return callback({
            status: 400,
            message: "Please provide player_id, kit_id and issue_date"
        });
    }

    // Step 1: Verify player exists
    db.get("SELECT * FROM players WHERE player_id = ?", [player_id], (err, player) => {
        if (err) {
            return callback({ status: 500, message: "Error checking player: " + err.message });
        }
        if (!player) {
            return callback({ status: 404, message: "Player not found" });
        }

        // Step 2: Check kit availability
        checkKitAvailability(kit_id, (err, availability) => {
            if (err) {
                return callback(err);
            }

            if (!availability.available) {
                // Return 409 Conflict for double booking or unavailable equipment
                return callback({
                    status: 409,
                    message: availability.message,
                    conflict_reason: availability.reason,
                    active_loan: availability.activeLoan || null
                });
            }

            // Step 3: Insert new loan
            const insertLoanSql = `
                INSERT INTO loans (player_id, kit_id, issue_date, return_date, status)
                VALUES (?, ?, ?, NULL, 'ACTIVE')
            `;

            db.run(insertLoanSql, [player_id, kit_id, issue_date], function(err) {
                if (err) {
                    return callback({ status: 400, message: "Error creating loan: " + err.message });
                }

                const newLoanId = this.lastID;

                // Step 4: Decrement available_quantity in kits
                const updateKitSql = `
                    UPDATE kits
                    SET available_quantity = CASE WHEN available_quantity > 0 THEN available_quantity - 1 ELSE 0 END
                    WHERE kit_id = ?
                `;
                db.run(updateKitSql, [kit_id], function(updateErr) {
                    if (updateErr) {
                        console.error("Warning: Failed to update available quantity for kit", kit_id, updateErr.message);
                    }

                    return callback(null, {
                        message: "Loan created successfully",
                        loan_id: newLoanId,
                        loan: {
                            loan_id: newLoanId,
                            player_id,
                            player_name: player.player_name,
                            kit_id,
                            kit_name: availability.kit.kit_name,
                            issue_date,
                            return_date: null,
                            status: "ACTIVE"
                        }
                    });
                });
            });
        });
    });
}

/**
 * Return an active loan by loan_id.
 * Marks status as 'RETURNED', sets return_date, and increments kit's available_quantity.
 */
function returnLoan(loan_id, return_date, callback) {
    if (!loan_id) {
        return callback({ status: 400, message: "Loan ID is required to return a kit" });
    }

    // Step 1: Find the loan
    db.get("SELECT * FROM loans WHERE loan_id = ?", [loan_id], (err, loan) => {
        if (err) {
            return callback({ status: 500, message: "Error finding loan: " + err.message });
        }
        if (!loan) {
            return callback({ status: 404, message: "Loan not found" });
        }

        // Check if already returned
        if (loan.status === "RETURNED" || loan.return_date !== null) {
            return callback({
                status: 400,
                message: `Loan ${loan_id} has already been returned on ${loan.return_date}.`
            });
        }

        const actualReturnDate = return_date || new Date().toISOString().split("T")[0];

        // Step 2: Mark loan as returned
        const updateLoanSql = `
            UPDATE loans
            SET status = 'RETURNED', return_date = ?
            WHERE loan_id = ?
        `;

        db.run(updateLoanSql, [actualReturnDate, loan_id], function(err) {
            if (err) {
                return callback({ status: 500, message: "Error updating loan return: " + err.message });
            }

            // Step 3: Increment available quantity in kits
            const updateKitSql = `
                UPDATE kits
                SET available_quantity = MIN(quantity, available_quantity + 1)
                WHERE kit_id = ?
            `;
            db.run(updateKitSql, [loan.kit_id], function(kitErr) {
                if (kitErr) {
                    console.error("Warning: Failed to restore available quantity for kit", loan.kit_id, kitErr.message);
                }

                return callback(null, {
                    message: "Kit returned successfully. Loan marked as returned.",
                    loan_id: Number(loan_id),
                    kit_id: loan.kit_id,
                    player_id: loan.player_id,
                    issue_date: loan.issue_date,
                    return_date: actualReturnDate,
                    status: "RETURNED"
                });
            });
        });
    });
}

/**
 * Return an active loan by kit_id.
 */
function returnLoanByKit(kit_id, return_date, callback) {
    if (!kit_id) {
        return callback({ status: 400, message: "Kit ID is required" });
    }

    const sql = `
        SELECT * FROM loans
        WHERE kit_id = ? AND (status = 'ACTIVE' OR return_date IS NULL)
        ORDER BY loan_id DESC
        LIMIT 1
    `;

    db.get(sql, [kit_id], (err, activeLoan) => {
        if (err) {
            return callback({ status: 500, message: "Error searching active loan: " + err.message });
        }
        if (!activeLoan) {
            return callback({ status: 404, message: `No active loan found for Kit ID ${kit_id}.` });
        }

        return returnLoan(activeLoan.loan_id, return_date, callback);
    });
}

// Promise-based wrappers for convenient async usage
function checkKitAvailabilityAsync(kit_id) {
    return new Promise((resolve, reject) => {
        checkKitAvailability(kit_id, (err, res) => {
            if (err) reject(err);
            else resolve(res);
        });
    });
}

function createLoanAsync(data) {
    return new Promise((resolve, reject) => {
        createLoanWithValidation(data, (err, res) => {
            if (err) reject(err);
            else resolve(res);
        });
    });
}

function returnLoanAsync(loan_id, return_date) {
    return new Promise((resolve, reject) => {
        returnLoan(loan_id, return_date, (err, res) => {
            if (err) reject(err);
            else resolve(res);
        });
    });
}

function returnLoanByKitAsync(kit_id, return_date) {
    return new Promise((resolve, reject) => {
        returnLoanByKit(kit_id, return_date, (err, res) => {
            if (err) reject(err);
            else resolve(res);
        });
    });
}

module.exports = {
    checkKitAvailability,
    createLoanWithValidation,
    returnLoan,
    returnLoanByKit,
    checkKitAvailabilityAsync,
    createLoanAsync,
    returnLoanAsync,
    returnLoanByKitAsync
};
