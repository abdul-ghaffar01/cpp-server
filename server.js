const express = require("express");
const { spawn } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["http://localhost:3000", "https://iabdulghaffar.com"], // Frontend origins
        methods: ["GET", "POST"]
    }
});

const PORT = 4000;
const MAX_USERS = 30;
const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const MAX_BUFFER_SIZE = 100;

const fileNames = {
    cbes: "console-based-ecommerce-store.out",
    dbms: "dbms-first-semester.out",
};

// Store sessions: { sessionId: { process, outputBuffer, timeout } }
const userProcesses = new Map();

app.get("/", (req, res) => res.json({ working: "Yeah perfect" }));

// 🔥 WebSocket handling
io.on("connection", (socket) => {
    console.log(`✅ Client connected: ${socket.id}`);

    // 🟢 Start new process
    socket.on("start-process", (application) => {
        try {
            if (userProcesses.size >= MAX_USERS) {
                return socket.emit("error", "Max users reached! Please try again later.");
            }

            if (!fileNames[application]) {
                return socket.emit("error", `Invalid application '${application}'`);
            }

            const sessionId = uuidv4();
            console.log(`▶️ Starting process for ${application} -> ${fileNames[application]}`);

            const process = spawn(`./${fileNames[application]}`, [], {
                stdio: ["pipe", "pipe", "pipe"],
                cwd: "apps",
            });

            // Handle spawn errors (binary missing, permission issues)
            process.on("error", (err) => {
                console.error(`❌ Spawn error for session ${sessionId}:`, err);
                socket.emit("error", `Failed to start process: ${err.message}`);
            });

            let outputBuffer = [];

            process.stdout.on("data", (data) => {
                const output = data.toString();
                outputBuffer.push(output);
                socket.emit("output", output);
            });

            process.stderr.on("data", (data) => {
                const errorOutput = `Error: ${data.toString()}`;
                outputBuffer.push(errorOutput);
                socket.emit("output", errorOutput);
            });

            process.on("close", (code) => {
                console.log(`🔴 Process ${sessionId} closed with code ${code}`);
                socket.emit("terminated", { code });
                userProcesses.delete(sessionId);
            });

            // Auto-kill on inactivity
            const timeout = setTimeout(() => {
                if (userProcesses.has(sessionId)) {
                    console.log(`⏳ Session ${sessionId} killed due to inactivity`);
                    process.kill();
                    userProcesses.delete(sessionId);
                    socket.emit("terminated", { reason: "Inactivity timeout" });
                }
            }, INACTIVITY_TIMEOUT);

            userProcesses.set(sessionId, { process, outputBuffer, timeout });
            socket.emit("session-started", { sessionId });

        } catch (err) {
            console.error(`🔥 Unexpected error in start-process:`, err);
            socket.emit("error", "Unexpected server error while starting process.");
        }
    });

    // 📝 Send input to the running process
    socket.on("send-input", ({ sessionId, input }) => {
        try {
            if (!sessionId || !input?.trim()) {
                return socket.emit("error", "Invalid input or session ID.");
            }

            const session = userProcesses.get(sessionId);
            if (!session) return socket.emit("error", "Session not found or already terminated.");

            session.outputBuffer.push(`${input}\n`);
            session.process.stdin.write(input + "\n");
        } catch (err) {
            console.error(`🔥 Error in send-input:`, err);
            socket.emit("error", "Failed to send input to the process.");
        }
    });

    // 🔴 Stop a process
    socket.on("stop-process", (sessionId) => {
        try {
            const session = userProcesses.get(sessionId);
            if (!session) return socket.emit("error", "Session not found or already stopped.");

            clearTimeout(session.timeout);
            session.process.kill();
            userProcesses.delete(sessionId);
            console.log(`🛑 Session ${sessionId} stopped manually`);
            socket.emit("terminated", { reason: "Process stopped manually" });
        } catch (err) {
            console.error(`🔥 Error in stop-process:`, err);
            socket.emit("error", "Failed to stop process.");
        }
    });

    // ❌ Handle disconnect
    socket.on("disconnect", () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
    });

    // Global error catch
    socket.on("error", (err) => {
        console.error(`⚠️ Socket error from ${socket.id}:`, err);
        socket.emit("error", "An unexpected socket error occurred.");
    });
});

server.listen(PORT, () => console.log(`🚀 WebSocket server running on port ${PORT}`));
