
const express = require("express");

const app = express();
const PORT = 3000;

// Import route files
const playersRoutes = require("./routes/players");
const kitsRoutes = require("./routes/kits");
const loansRoutes = require("./routes/loans");

// Middleware to read JSON request bodies
app.use(express.json());

// Home route
app.get("/", (req, res) => {
    res.status(200).json({
        message: "Welcome to SportsShed API",
        status: "Server is running successfully",
        project: "Sports Equipment Issue Management System"
    });
});

// Health check route
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "OK",
        message: "SportsShed server is healthy"
    });
});

// Connect route files
app.use("/players", playersRoutes);
app.use("/kits", kitsRoutes);
app.use("/loans", loansRoutes);

// Start server
app.listen(PORT, () => {
    console.log(`SportsShed server running at http://localhost:${PORT}`);
});
