const { app } = require('electron');
const fs = require("fs");
const path = require("path");
const { exec, spawn } = require("child_process");
const os = require("os");

function runCppCode(code, inputData, filepath, callback) {

    const tempDir = path.join(app.getPath('temp'), 'synaptix');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    let sourceFile;
    let outputFile;

    if (filepath) {
        sourceFile = filepath;
        outputFile = path.join(
            path.dirname(filepath),
            path.basename(filepath, path.extname(filepath))
        );
    }
    else {
        sourceFile = path.join(tempDir, 'temp.cpp');
        outputFile = path.join(tempDir, 'temp');

        fs.writeFileSync(sourceFile, code);
    }

    console.log("runCppCode");

    // 編譯命令
    const gpp = path.join(__dirname, 'bin', 'mingw64', 'bin', 'g++.exe');

    // 使用 g++ 編譯
    const command = `"${gpp}" "${sourceFile}" -o "${outputFile}"`;


    let responded = false;
    function safeCallback(result) {
        if (!responded) {
            responded = true;
            callback(result);
        }
    }

    exec(command, (compileErr, stdout, stderr) => {
        if (compileErr) {

            safeCallback({
                status: "compile_error",
                stdout: stdout?.toString() || "",
                stderr: stderr?.toString() || "Compilation failed",
                exitCode: compileErr.code || -1
            });
            return;
        }

        const getMemoryUsageKb = (pid, cb) => {
            exec(`tasklist /FI "PID eq ${pid}" /FO LIST`, (err, stdout) => {
                if (err || !stdout) return cb(null);
                const match = stdout.match(/Mem Usage:\s*([\d,]+) K/i);
                if (!match) return cb(null);
                cb(parseInt(match[1].replace(/,/g, ''), 10));
            });
        };

        const startTime = process.hrtime();
        const proc = spawn(outputFile);
        const pid = proc.pid;

        let stdoutData = "";
        let stderrData = "";

        // 查詢記憶體佔用 (提早做)
        // let memoryUsage = null;
        // getMemoryUsageKb(pid, (mem) => memoryUsage = mem);

        proc.stdin.write(inputData);
        proc.stdin.end();

        proc.stdout.on("data", data => stdoutData += data.toString());
        proc.stderr.on("data", data => stderrData += data.toString());

        const getMemoryUsageKbRetry = (pid, retries = 3, delayMs = 100, cb) => {
            let attempts = 0;
            const tryGet = () => {
                exec(`tasklist /FI "PID eq ${pid}" /FO LIST`, (err, stdout) => {
                    const match = stdout?.match(/Mem Usage:\s*([\d,]+) K/i);
                    if (!err && match) {
                        cb(parseInt(match[1].replace(/,/g, ''), 10));
                    } else if (++attempts >= retries) {
                        cb(null);
                    } else {
                        setTimeout(tryGet, delayMs);
                    }
                });
            };
            tryGet();
        };

        proc.on("close", (code) => {
            const [sec, nano] = process.hrtime(startTime);
            const durationMs = (sec * 1000 + nano / 1e6).toFixed(2);

            getMemoryUsageKbRetry(pid, 3, 5, (mem) => {
                safeCallback({
                    status: code === 0 ? "success" : "runtime_error",
                    stdout: stdoutData,
                    stderr: stderrData,
                    exitCode: code,
                    timeMs: parseFloat(durationMs),
                    memoryKb: mem
                });
            });
        });

        setTimeout(() => {
            safeCallback({
                status: "timeout",
                stdout: stdoutData,
                stderr: "Execution timed out",
                exitCode: null,
                timeMs: null,
                memoryKb: null
            });
        }, 2000);
    });
}

module.exports = { runCppCode };