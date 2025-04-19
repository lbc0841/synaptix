const { app } = require('electron');
const fs = require("fs");
const path = require("path");
const { exec, spawn } = require("child_process");
const os = require("os");
const pidusage = require("pidusage");
const { memoryUsage } = require('process');

function runCppCode(code, inputData, filepath, callback) {

    const tempDir = path.join(app.getPath('temp'), 'synaptix');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    let sourceFile;
    let outputFile;

    // 判斷是 暫存檔案 還是 使用者的檔案
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

    console.log("runCppCode-run");

    // 編譯命令
    const gpp = path.join(__dirname, 'bin', 'mingw64', 'bin', 'g++.exe');

    // 使用 g++ 編譯
    const command = `"${gpp}" "${sourceFile}" -o "${outputFile}" -O2 -std=c++14`;


    let responded = false;
    function safeCallback(result) {
        if (!responded) {
            responded = true;
            callback(result);
        }
    }

    exec(command, (compileErr, stdout, stderr) => {
        // 編譯錯誤
        if (compileErr) {

            safeCallback({
                status: "compile_error",
                stdout: stdout?.toString() || "",
                stderr: stderr?.toString() || "Compilation failed",
                exitCode: compileErr.code || -1
            });
            return;
        }

        // const startCpuTime = process.cpuUsage();
        const proc = spawn(outputFile);
        const pid = proc.pid;

        let stdoutData = "";
        let stderrData = "";
        let memoryUsage = 0;
        let cpuTimeMs = 0;

        // 查詢 時間 & 記憶體
        let isProcessAlive = true;
        const memoryTimer = setInterval(() => {
            if (!isProcessAlive) {
                clearInterval(memoryTimer);
                return;
            }

            pidusage(pid).then(stat => {
                const currentMem = Math.round(stat.memory / 1024);
                if (currentMem > memoryUsage) memoryUsage = currentMem;

                cpuTimeMs = stat.ctime; // 持續更新最後一次可取得的 CPU 時間（ms）
            })
            .catch((err) => {
                if (err && err.code === 'ENOENT') {
                    isProcessAlive = false;
                    console.error("pidusage error:", err);
                }
                else {
                    console.error("pidusage error:", err);
                }
            });
        }, 0.2);

        // 輸入
        proc.stdin.write(inputData);
        proc.stdin.end();

        proc.stdout.on("data", data => stdoutData += data.toString());
        proc.stderr.on("data", data => stderrData += data.toString());


        proc.on("close", async (code) => {
            clearInterval(memoryTimer);
            pidusage.clear();
            // const cpuDiff = process.cpuUsage(startCpuTime);
            // const durationMs = ((cpuDiff.user + cpuDiff.system) / 1000).toFixed(2); // 單位轉為毫秒

            safeCallback({
                status: code === 0 ? "success" : "runtime_error",
                stdout: stdoutData,
                stderr: stderrData,
                exitCode: code,
                timeMs: cpuTimeMs,          // ← 這是 C++ 子程序真正使用的 CPU 時間
                memoryKb: memoryUsage
            });


        });

        // 超時 (10s)
        const timeoutMillis = 10000;
        setTimeout(() => {

            clearInterval(memoryTimer);
            pidusage.clear();

            safeCallback({
                status: "timeout",
                stdout: stdoutData,
                stderr: "Execution timed out",
                exitCode: null,
                timeMs: null,
                memoryKb: null
            });
        }, timeoutMillis);
    });
}

module.exports = { runCppCode };