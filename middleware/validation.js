
// ==========================================
// SPORTSSHED - INPUT VALIDATION MIDDLEWARE
// ==========================================

// 1. Validate Player Details
const validatePlayer = (req, res, next) => {
    const { player_name, email, phone } = req.body;

    // Check player name
    if (!player_name || typeof player_name !== "string" || !player_name.trim()) {
        return res.status(400).json({
            message: "Player name is required"
        });
    }

    // Check email format (email is optional)
    if (email !== undefined && email !== null && email !== "") {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (typeof email !== "string" || !emailPattern.test(email.trim())) {
            return res.status(400).json({
                message: "Please enter a valid email address"
            });
        }
    }

    // Check phone number (phone is optional)
    if (phone !== undefined && phone !== null && phone !== "") {
        const phonePattern = /^\d{10}$/;

        if (typeof phone !== "string" || !phonePattern.test(phone.trim())) {
            return res.status(400).json({
                message: "Phone number must contain exactly 10 digits"
            });
        }
    }

    next();
};


// 2. Validate Kit Details
const validateKit = (req, res, next) => {
    const { kit_name, sport, quantity } = req.body;

    // Check kit name
    if (!kit_name || typeof kit_name !== "string" || !kit_name.trim()) {
        return res.status(400).json({
            message: "Kit name is required"
        });
    }

    // Check sport
    if (!sport || typeof sport !== "string" || !sport.trim()) {
        return res.status(400).json({
            message: "Sport name is required"
        });
    }

    // Check quantity
    if (
        quantity === undefined ||
        quantity === null ||
        quantity === "" ||
        !Number.isInteger(quantity) ||
        quantity < 0
    ) {
        return res.status(400).json({
            message: "Quantity must be a non-negative integer"
        });
    }

    next();
};

// 4. Validate Loan Creation
const validateLoan = (req, res, next) => {
    const { player_id, kit_id, issue_date } = req.body || {};

    // Validate player ID
    if (
        player_id === undefined ||
        player_id === null ||
        !/^[1-9]\d*$/.test(String(player_id))
    ) {
        return res.status(400).json({
            message: "Please provide a valid player_id"
        });
    }

    // Validate kit ID
    if (
        kit_id === undefined ||
        kit_id === null ||
        !/^[1-9]\d*$/.test(String(kit_id))
    ) {
        return res.status(400).json({
            message: "Please provide a valid kit_id"
        });
    }

    // Validate issue date (YYYY-MM-DD)
    if (!isValidDate(issue_date)) {
        return res.status(400).json({
            message: "Please provide a valid issue_date in YYYY-MM-DD format"
        });
    }

    next();
};


// Helper function to validate real calendar dates
function isValidDate(date) {
    if (typeof date !== "string") {
        return false;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return false;
    }

    const parsedDate = new Date(date + "T00:00:00Z");

    return !isNaN(parsedDate.getTime()) &&
        parsedDate.toISOString().slice(0, 10) === date;
}


// 5. Validate Return Date
const validateReturnDate = (req, res, next) => {
    const { return_date } = req.body || {};

    if (
        return_date !== undefined &&
        return_date !== null &&
        return_date !== "" &&
        !isValidDate(return_date)
    ) {
        return res.status(400).json({
            message: "Please provide a valid return_date in YYYY-MM-DD format"
        });
    }

    next();
};


// 6. Export all validation functions

module.exports = {
    validatePlayer,
    validateKit,
    validateLoan,
    validateReturnDate
};

