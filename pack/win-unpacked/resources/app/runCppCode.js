const { app } = require('electron');
const path = require("path");
const { exec, spawn } = require("child_process");
const os = require("os");
const fs = require("fs");
const pidusage = require("pidusage");
const { memoryUsage } = require('process');

const isDev = process.env.NODE_ENV !== 'production';

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

        // 插入時間統計邏輯
        // const instrumentedCode = instrumentMainFunction(code);
        fs.writeFileSync(sourceFile, code);
    }

    console.log("runCppCode-run");

    // 編譯命令
    const gpp = isDev 
        ? path.join(__dirname, 'bin', 'mingw64', 'bin', 'g++.exe') 
        : path.join(process.resourcesPath, 'bin', 'mingw64', 'bin', 'g++.exe');
        
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

        const proc = spawn(outputFile);
        const pid = proc.pid;

        let stdoutData = "";
        let stderrData = "";
        let memoryUsage = 0;
        let cpuTimeMs = 0;


        // 輸入
        proc.stdin.write(inputData);
        proc.stdin.end();

        proc.stdout.on("data", data => stdoutData += data.toString());
        proc.stderr.on("data", data => stderrData += data.toString());


        proc.on("close", async (code) => {

            safeCallback({
                status: code === 0 ? "success" : "runtime_error",
                stdout: stdoutData,
                stderr: stderrData,
                exitCode: code,
                timeMs: cpuTimeMs,
                memoryKb: memoryUsage
            });
        });

        // 超時 (10s)
        const timeoutMillis = 10000;
        setTimeout(() => {

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
/*
// 在 user 的代碼裡偷偷插入計算 時間&記憶體 的代碼
function instrumentMainFunction(code) {
    const lines = code.split('\n');
    let inMain = false;
    let braceCount = 0;
    let output = [];
    let insertedHeader = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // 插入 #include <ctime>（若原碼未自行引入）
        if (!insertedHeader && line.match(/#include\s+<.*>/)) {
            output.push(line);
            if (!code.includes('#include <ctime>')) {
                output.push('#include <ctime>');
            }
            insertedHeader = true;
            continue;
        }

        // 找到 main() 開頭
        if (!inMain && line.match(/\bint\s+main\s*\([^)]*\)\s*\{/)) {
            inMain = true;
            braceCount = 1;
            output.push(line);
            output.push('    std::clock_t __start = std::clock();');
            continue;
        }

        // 在 main() 的結尾 return 前插入結束時間
        if (inMain) {
            braceCount += (line.match(/{/g) || []).length;
            braceCount -= (line.match(/}/g) || []).length;

            // 找到 return
            if (line.match(/\breturn\b.*;/)) {
                output.push('    std::clock_t __end = std::clock();');
                output.push('    std::cout << "\\n[CPU Time] " << 1000.0 * (__end - __start) / CLOCKS_PER_SEC << " ms" << std::endl;');
            }
        }

        output.push(line);
    }

    return output.join('\n');
}
*/

module.exports = { runCppCode };