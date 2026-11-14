
const express = require("express");

const { initializeDatabase } = require("./database/db");

const app = express();
const PORT = 3000;

// Import route files
const playersRoutes = require("./routes/players");
const kitsRoutes = require("./routes/kits");
const loansRoutes = require("./routes/loans");

// Middleware
app.use(express.json());

// Home route
app.get("/", (req, res) => {
    res.status(200).json({
        message: "Welcome to SportsShed API",
        status: "Server is running successfully",
        project: "Sports Equipment Issue Management System"
    });
});

// Health check
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "OK",
        message: "SportsShed server is healthy"
    });
});

// API routes
app.use("/players", playersRoutes);
app.use("/kits", kitsRoutes);
app.use("/loans", loansRoutes);

// Initialize database BEFORE starting server
async function startServer() {
    try {
        await initializeDatabase();

        app.listen(PORT, () => {
            console.log(
                `SportsShed server running at http://localhost:${PORT}`
            );
        });
    } catch (error) {
        console.error("Failed to initialize database:", error.message);
        process.exit(1);
    }
}

startServer();
