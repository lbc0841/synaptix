// 用於控制應用程式生命週期和建立本機瀏覽器視窗的模組
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('fs');
const { exec } = require('child_process');


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

// 在当前文件中你可以引入所有的主进程代码
// 也可以拆分成几个文件，然后用 require 导入。


// 編譯C++代碼
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
    } else {
        sourceFile = path.join(tempDir, 'temp.cpp');
        outputFile = path.join(tempDir, 'temp');
        fs.writeFileSync(sourceFile, code);
    }

    // 執行編譯命令 (根據不同平台可能需要調整)
    const command = `g++ "${sourceFile}" -o "${outputFile}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            event.reply('compilation-result', {
                success: false,
                error: stderr
            });
        } else {
            event.reply('compilation-result', {
                success: true,
                output: stdout,
                executablePath: outputFile
            });
        }
    });
});

// 運行編譯後的程序
ipcMain.on('run-executable', (event, executablePath) => {
    exec(executablePath, (error, stdout, stderr) => {
        if (error) {
            event.reply('execution-result', {
                success: false,
                error: stderr
            });
        } else {
            event.reply('execution-result', {
                success: true,
                output: stdout
            });
        }
    });
});

// 處理文件操作
ipcMain.on('save-file', (event, { content, path: filePath }) => {
    try {
        fs.writeFileSync(filePath, content);
        event.reply('file-saved', { success: true, path: filePath });
    } catch (err) {
        event.reply('file-saved', { success: false, error: err.message });
    }
});

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
            } catch (err) {
                event.reply('file-opened', {
                    success: false,
                    error: err.message
                });
            }
        }
    });
});

ipcMain.on('new-file-dialog', (event) => {
    console.log('顯示新建文件對話框');

    dialog.showSaveDialog(mainWindow, {
        title: '新建文件',
        filters: [
            { name: 'C++ Files', extensions: ['cpp'] }
        ]
    }).then(result => {
        if (!result.canceled && result.filePath) {
            try {
                // 創建空文件
                fs.writeFileSync(result.filePath, '');
                event.reply('file-created', {
                    success: true,
                    path: result.filePath,
                    filename: path.basename(result.filePath)
                });
            } catch (err) {
                event.reply('file-created', {
                    success: false,
                    error: err.message
                });
            }
        }
    });
});