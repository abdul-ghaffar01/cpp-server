const express = require("express");
const { spawn } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors")
const app = express();
app.use(express.json());

const PORT = 4000;
const myServer = process.env.IP ? `http://${process.env.IP}:3001` : "http://localhost:3001"

app.use(cors({
    origin: myServer,
}));

// Store up to 30 user processes
const userProcesses = new Map(); // { sessionId: { process, outputBuffer, timeout } }
const MAX_USERS = 30;
const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

const fileNames = {
    cbes: "console-based-ecommerce-store.out"
}

/** 📌 Start a new process for a user */
app.post("/start-process", (req, res) => {
    if (userProcesses.size >= MAX_USERS) {
        return res.status(429).json({ error: "Max users reached! Try again later." });
    }

    const { application } = req.body;

    const sessionId = uuidv4();
    const process = spawn(`./apps/${fileNames[application]}`, [], { stdio: ["pipe", "pipe", "pipe"] });
    // const process = spawn(`./apps/console-based-ecommerce-store.out`, [], { stdio: ["pipe", "pipe", "pipe"] });

    let outputBuffer = [];

    process.stdout.on("data", (data) => {
        outputBuffer.push(data.toString());
    });

    process.stderr.on("data", (data) => {
        outputBuffer.push(`Error: ${data.toString()}`);
    });

    process.on("close", (code) => {
        console.log(`Process ${sessionId} exited with code ${code}`);
        userProcesses.delete(sessionId);
    });

    // Set auto-clean timeout
    const timeout = setTimeout(() => {
        process.kill();
        userProcesses.delete(sessionId);
        console.log(`Process ${sessionId} auto-terminated due to inactivity.`);
    }, INACTIVITY_TIMEOUT);

    // Store user session
    userProcesses.set(sessionId, { process, outputBuffer, timeout });

    res.json({ message: "Process started!", sessionId });
});

/** 📌 Send input to a specific process */
app.post("/send-input", (req, res) => {
    const { sessionId, input } = req.body;

    if (!userProcesses.has(sessionId)) {
        return res.status(400).json({ error: "Invalid session ID or process not running." });
    }

    const userProcess = userProcesses.get(sessionId);
    userProcess.process.stdin.write(input + "\n");

    // Reset inactivity timeout
    clearTimeout(userProcess.timeout);
    userProcess.timeout = setTimeout(() => {
        userProcess.process.kill();
        userProcesses.delete(sessionId);
        console.log(`Process ${sessionId} auto-terminated due to inactivity.`);
    }, INACTIVITY_TIMEOUT);

    res.json({ message: "Input sent!", input });
});

/** 📌 Get output of a specific process */
const MAX_BUFFER_SIZE = 100; // Keep the last 100 lines of output

/** 📌 Get output of a specific process */
app.get("/get-output", (req, res) => {
    const { sessionId } = req.query;
    console.log(sessionId, "this is session id");

    if (!userProcesses.has(sessionId)) {
        return res.status(400).json({ error: "Invalid session ID or process not running." });
    }

    const userProcess = userProcesses.get(sessionId);
    const output = userProcess.outputBuffer.join("").trim();

    // Implement a rolling buffer
    if (userProcess.outputBuffer.length > MAX_BUFFER_SIZE) {
        userProcess.outputBuffer = userProcess.outputBuffer.slice(-MAX_BUFFER_SIZE);
    }

    res.json({ sessionId, output });
});
/** 📌 Stop a specific process */
app.post("/stop-process", (req, res) => {
    const { sessionId } = req.body;

    if (!userProcesses.has(sessionId)) {
        return res.status(400).json({ error: "Invalid session ID or process not running." });
    }

    const userProcess = userProcesses.get(sessionId);
    clearTimeout(userProcess.timeout);
    userProcess.process.kill();
    userProcesses.delete(sessionId);

    res.json({ message: `Process ${sessionId} stopped.` });
});

app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});
