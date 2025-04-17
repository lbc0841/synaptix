// 用於控制應用程式生命週期和建立本機瀏覽器視窗的模組
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { exec, spawn } = require('child_process');

const iconv = require('iconv-lite');
const path = require('node:path');
const fs = require('fs');


const createWindow = () => {
    // 建立瀏覽器視窗
    mainWindow = new BrowserWindow({
        width: 800,  //視窗寬
        height: 600, //視窗高
        backgroundColor: '#1e1e1e', // 深色背景

        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    // 全螢幕
    // mainWindow.setFullScreen(true);
    mainWindow.maximize();

    // 加载 index.html
    mainWindow.loadFile('index.html');

    // 關閉視窗時
    mainWindow.on('closed', function () {
        mainWindow = null;
    });

    // 打开开发工具
    // mainWindow.webContents.openDevTools();
}

// 这段程序将会在 Electron 结束初始化
// 和创建浏览器窗口的时候调用
// 部分 API 在 ready 事件触发后才能使用。
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        // 在 macOS 系统内, 如果没有已开启的应用窗口
        // 点击托盘图标时通常会重新创建一个新窗口
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('activate', function () {
    if (mainWindow === null) createWindow();
});

// 除了 macOS 外，当所有窗口都被关闭的时候退出程序。 因此, 通常
// 对应用程序和它们的菜单栏来说应该时刻保持激活状态, 
// 直到用户使用 Cmd + Q 明确退出
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

// app.quit().then(() => app.relaunch());


// 儲存文件 --------------------------------------------------------------------------------------------
// 儲存
ipcMain.on('save-file', (event, { content, path: filePath }) => {
    try {
        fs.writeFileSync(filePath, content);
        event.reply('file-saved', { success: true, path: filePath });
    }
    catch (err) {
        event.reply('file-saved', { success: false, error: err.message });
    }
});

// 另存新檔
ipcMain.on('save-file-dialog', async (event, content) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
        title: '另存新檔',
        defaultPath: 'untitled.cpp',
        filters: [{ name: 'C++ Files', extensions: ['cpp', 'h', 'hpp', 'cc'] }]
    });

    if (!canceled && filePath) {
        try {
            fs.writeFileSync(filePath, content);
            event.reply('file-saved', { success: true, path: filePath });
        }
        catch (err) {
            event.reply('file-saved', { success: false, error: err.message });
        }
    }
    else {
        // 取消儲存
    }
});

// 開啟文件  --------------------------------------------------------------------------------------------
ipcMain.on('open-file-dialog', (event) => {
    dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'C++ Files', extensions: ['cpp', 'h', 'hpp', 'cc'] }
        ]
    }).then(result => {
        if (!result.canceled && result.filePaths.length > 0) {
            const filePath = result.filePaths[0];
            try {
                const content = fs.readFileSync(filePath, 'utf8');

                event.reply('file-opened', {
                    success: true,
                    path: filePath,
                    content: content,
                    filename: path.basename(filePath)
                });
            }
            catch (err) {
                event.reply('file-opened', {
                    success: false,
                    error: err.message
                });
            }
        }
        else{
            // 取消開啟檔案
        }
    }).catch(err => {
        event.reply('file-opened', {
            success: false,
            error: '開啟檔案對話框時發生錯誤'
        });
    });
});

// 編譯代碼 --------------------------------------------------------------------------------------------
ipcMain.on('compile-cpp', (event, code, filepath) => {

    const tempDir = path.join(app.getPath('temp'), 'cpp-editor');
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

    // 執行編譯命令 (根據不同平台可能需要調整)
    const command = `g++ "${sourceFile}" -o "${outputFile}"`;

    exec(command, { encoding: 'buffer' }, (error, stdout, stderr) => {
        if (error) {

            // 文字編碼
            let decodedError;
            if (process.platform === 'win32') {
                decodedError = iconv.decode(stderr, 'cp950');
            }
            else {
                decodedError = stderr.toString('utf-8');  // Linux/macOS 預設為 UTF-8
            }
            
            event.reply('compilation-result', {
                success: false,
                error: decodedError
            });
        }
        else {

            event.reply('compilation-result', {
                success: true,
                output: stdout,
                executablePath: outputFile
            });
        }
    });
});

// 運行代碼 --------------------------------------------------------------------------------------------
ipcMain.on('run-executable', (event, executablePath) => {
    const start = process.hrtime();  // 高精度時間測量

    const child = spawn(executablePath);

    let stdoutData = '';
    let stderrData = '';

    child.stdin.write(inputData || '');
    child.stdin.end();

    child.stdout.on('data', (data) => {
        stdoutData += data.toString();
    });

    child.stderr.on('data', (data) => {
        stderrData += data.toString();
    });

    child.on('close', (code) => {
        const end = process.hrtime(start);
        const execTimeMs = end[0] * 1000 + end[1] / 1e6; // 轉換為毫秒

        // 注意：這裡是 parent process 的記憶體用量，非 child 的準確值
        const memoryUsage = process.memoryUsage();

        event.reply('execution-result', {
            success: code === 0,
            output: stdoutData,
            error: code !== 0 ? stderrData : null,
            exitCode: code,
            execTimeMs: execTimeMs.toFixed(2),
            memory: {
                rss: memoryUsage.rss,
                heapUsed: memoryUsage.heapUsed
            }
        });
    });
});
