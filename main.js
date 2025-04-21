// 用於控制應用程式生命週期和建立本機瀏覽器視窗的模組
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { exec, spawn } = require('child_process');

const iconv = require('iconv-lite');
const path = require('node:path');
const pathModule = require('path');
const fs = require('fs');

const { runCppCode } = require("./runCppCode");


let mainWindow;
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



app.whenReady().then(() => { // 創建瀏覽器視窗時調用
    createWindow();

    ipcMain.handle("run-cpp", async (event, code, inputData, filePath) => {
        return new Promise((resolve) => {
            runCppCode(code, inputData, filePath, (result) => {
                resolve(result);
            });
        });
    });

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
        event.reply('file-saved', { success: true, path: filePath, name: pathModule.basename(filePath) });
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
            event.reply('file-saved', { success: true, path: filePath, name: pathModule.basename(filePath) });
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
        else {
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

    console.log(`compile-cpp ${sourceFile}`);

    // 編譯命令
    const gpp = path.join(__dirname, 'bin', 'mingw64', 'bin', 'g++.exe');

    // 使用 g++ 編譯
    const command = `"${gpp}" "${sourceFile}" -o "${outputFile}"`;

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

// message-box --------------------------------------------------------------------------------------------
ipcMain.handle('show-message-box', async (_, options) => {
    const result = await dialog.showMessageBox(BrowserWindow.getFocusedWindow(), options);
    return result;
});
