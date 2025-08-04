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

const MAX_BUFFER_SIZE = 100; // Keep the last 100 lines of output
// Store up to 30 user processes
const userProcesses = new Map(); // { sessionId: { process, outputBuffer, timeout } }
const MAX_USERS = 30;
const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

const fileNames = {
    cbes: "console-based-ecommerce-store.out",
    dbms: "dbms-first-semester.out",
}

// To test the server
app.get("/", (req, res)=>{
    return res.json({"working": "Yeah perfect"})
})

/** 📌 Start a new process for a user */
app.post("/start-process", (req, res) => {
    if (userProcesses.size >= MAX_USERS) {
        return res.status(429).json({ error: "Max users reached! Try again later." });
    }

    const { application } = req.body;
    console.log(application, fileNames[application])
    const sessionId = uuidv4();
    const process = spawn(`./${fileNames[application]}`, [], { stdio: ["pipe", "pipe", "pipe"], cwd: "apps" },);
    // const process = spawn(`./apps/console-based-ecommerce-store.out`, [], { stdio: ["pipe", "pipe", "pipe"] });

    let outputBuffer = [];

    process.stdout.on("data", (data) => {
        outputBuffer.push(data.toString());
    });

    process.stderr.on("data", (data) => {
        outputBuffer.push(`Error: ${data.toString()}`);
    });

    process.on("close", (code) => {
        console.log(`Process ${sessionId} exited with code ${code} after receiving input.`);
        userProcesses.delete(sessionId);
    });

    process.on("exit", (code, signal) => {
        console.log(`Process ${sessionId} exited with code ${code}, signal ${signal}`);
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

    // Append input to the output buffer (to keep track of history)
    userProcess.outputBuffer.push(`${input}\n`);

    // Send input to the process
    userProcess.process.stdin.write(input + "\n");

    let responseSent = false; // Ensure only one response is sent

    // Listen for process exit
    userProcess.process.once("exit", (code, signal) => {
        if (!responseSent) {
            console.log(`Process ${sessionId} exited after input. Code: ${code}, Signal: ${signal}`);

            // Capture the final output before deleting the session
            const history = userProcess.outputBuffer.join("").trim();

            // Send termination response with history
            res.json({
                message: "Input sent, but process terminated!",
                input,
                terminated: true,
                exitCode: code,
                signal,
                history
            });

            // Clean up process data
            userProcesses.delete(sessionId);
            responseSent = true;
        }
    });
    const output = userProcess.outputBuffer.join("").trim();

    // clearing the ansii codes 
    const cleanOutput = output.replace(/\x1B\[[0-9;]*m/g, '');

    // Delay checking if the process is still running
    setTimeout(() => {
        if (!responseSent && userProcesses.has(sessionId)) {
            res.json({
                message: "Input sent!",
                input,
                terminated: false,
                history: cleanOutput
            });
            responseSent = true;
        }
    }, 100); // Short delay to check if process terminated
});


/** 📌 Get output of a specific process */
app.get("/get-output", (req, res) => {
    const { sessionId } = req.query;

    if (!userProcesses.has(sessionId)) {
        return res.status(400).json({ error: "Invalid session ID or process not running." });
    }

    const userProcess = userProcesses.get(sessionId);
    const output = userProcess.outputBuffer.join("").trim();

    // Implement a rolling buffer
    if (userProcess.outputBuffer.length > MAX_BUFFER_SIZE) {
        userProcess.outputBuffer = userProcess.outputBuffer.slice(-MAX_BUFFER_SIZE);
    }
    const cleanOutput = output.replace(/\x1B\[[0-9;]*m/g, '');

    res.json({ sessionId, output: cleanOutput });
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
