// 初始化編輯器
let editor;
let currentOpenFilePath = null;
let activeTabId = null;
const openTabs = new Map(); // 使用 Map 來存儲所有打開的標籤頁

// hello world --------------------------------------------------------------------------------------------
const helloWorld_py =
    'print("hello, world")';

const helloWorld_c =
    '#include <stdio.h>\n\
\n\
int main(){\n\
\tprintf("hello, world");\n\
\n\
\treturn 0;\n\
}';

const helloWorld_cpp =
    '#include <iostream>\n\
using namespace std;\n\
\n\
int main(){\n\
\tcout << "hello, world";\n\
\n\
\treturn 0;\n\
}';

const helloWorld_java =
    'public class HelloWorld\n\
{\n\
\tpublic static void main(String[] args)\n\
\t{\n\
\t\tSystem.out.println("Hello World!");\n\
\t}\n\
}';



// Monaco 編輯器初始化 ------------------------------------------------------------------------------------
require.config({ paths: { 'vs': './node_modules/monaco-editor/min/vs' } });
require(['vs/editor/editor.main'], function () {
    // 創建編輯器實例
    editor = monaco.editor.create(document.getElementById('editor-container'), {
        language: 'cpp',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: {
            enabled: true
        },
        scrollBeyondLastLine: false,
        roundedSelection: false,
        renderIndentGuides: true,
        lineNumbers: 'on',
        folding: true
    });

    // 監聽光標位置變化，更新狀態欄
    editor.onDidChangeCursorPosition(function (e) {
        document.getElementById('cursor-position').textContent =
            `行 ${e.position.lineNumber}, 列 ${e.position.column}`;
    });

    // 創建默認標籤頁
    createNewTab('Unnamed.cpp', helloWorld_cpp);
});

// 創建新標籤頁 --------------------------------------------------------------------------------------------
function createNewTab(filename, content, filePath = null) {
    const tabId = 'tab-' + Date.now();
    const tabsContainer = document.getElementById('tabs');

    // 創建新標籤頁元素
    const tabElement = document.createElement('div');
    tabElement.className = 'tab';
    tabElement.id = tabId;
    tabElement.innerHTML = `
    <div class="tab-title">${filename}</div>
    <div class="tab-close">×</div>
    `;

    tabsContainer.appendChild(tabElement);

    // 存儲標籤頁信息
    openTabs.set(tabId, {
        filename,
        content: content || '',
        filePath
    });

    // 為標籤頁添加點擊事件
    tabElement.addEventListener('click', function (e) {
        if (!e.target.classList.contains('tab-close')) {
            activateTab(tabId);
        }
    });

    // 為關閉按鈕添加點擊事件
    tabElement.querySelector('.tab-close').addEventListener('click', function (e) {
        e.stopPropagation();
        closeTab(tabId);
    });

    // 啟用新標籤頁
    activateTab(tabId);
}

// 啟用標籤頁 --------------------------------------------------------------------------------------------
function activateTab(tabId) {
    // 移除所有標籤頁的活動狀態
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // 為當前標籤頁添加活動狀態
    const tabElement = document.getElementById(tabId);
    if (tabElement) {
        tabElement.classList.add('active');
    }

    // 保存當前標籤頁的內容（如果有）
    if (activeTabId && openTabs.has(activeTabId)) {
        openTabs.get(activeTabId).content = editor.getValue();
    }

    // 更新當前活動標籤頁
    activeTabId = tabId;
    currentOpenFilePath = openTabs.get(tabId).filePath;

    // 更新編輯器內容
    editor.setValue(openTabs.get(tabId).content);

    // 更新窗口標題
    document.title = openTabs.get(tabId).filename + ' - cpp';
}

// 關閉標籤頁 --------------------------------------------------------------------------------------------
function closeTab(tabId) {
    const tabElement = document.getElementById(tabId);
    const tabInfo = openTabs.get(tabId);

    // 如果正在關閉活動標籤頁，需要激活另一個標籤頁
    if (tabId === activeTabId) {
        // 查找下一個或前一個標籤
        const tabs = Array.from(document.querySelectorAll('.tab'));
        const currentIndex = tabs.findIndex(tab => tab.id === tabId);

        if (tabs.length > 1) {
            const nextTab = tabs[currentIndex + 1] || tabs[currentIndex - 1];
            if (nextTab) {
                activateTab(nextTab.id);
            }
        }
        else {
            // 如果沒有標籤頁，創建一個新的標籤頁
            createNewTab('Unnamed.cpp', helloWorld_cpp);
        }
    }

    // 移除標籤頁元素和數據
    tabElement.remove();
    openTabs.delete(tabId);
}



// 打開文件 --------------------------------------------------------------------------------------------
const openFileButton = document.getElementById('open-file-button');
openFileButton.addEventListener('click', function () {
    window.fileManager.openFile();
});

// 接收文件打開結果
window.fileManager.onOpenFileResult((result) => {
    if (result.success) {
        createNewTab(result.filename, result.content, result.path);
        addConsoleMessage(`Opend ${result.path}`, 'success');
    }
    else {
        addConsoleMessage(`Error: ${result.error}`, 'error');
    }
});

// 儲存文件 --------------------------------------------------------------------------------------------
const saveFileButton = document.getElementById('save-file-button');
saveFileButton.addEventListener('click', function () {
    if (activeTabId && openTabs.has(activeTabId)) {
        const tabInfo = openTabs.get(activeTabId);
        const content = editor.getValue();

        if (tabInfo.filePath) {
            // 儲存
            window.fileManager.saveFile(content, tabInfo.filePath);
        }
        else {
            // 另儲新檔
            window.fileManager.saveFileAs(content);
        }
    }
});

// 接收文件儲存結果
window.fileManager.onSaveFileResult((result) => {
    if (result.success) {
        addConsoleMessage(`文件已保存: ${result.path}`, 'success');

        if (activeTabId && openTabs.has(activeTabId)) {

            const tabInfo = openTabs.get(activeTabId);
            tabInfo.filePath = result.path; // 更新 file path
            tabInfo.filename = result.name; // 更新 file name

            updateTabTitle(activeTabId, tabInfo.filename); // 更新 UI
        }
    }
    else {
        addConsoleMessage(`保存文件失敗: ${result.error}`, 'error');
    }
});


// 編譯代碼 --------------------------------------------------------------------------------------------
const compileButton = document.getElementById('compile-button');
compileButton.addEventListener('click', function () {
    if (activeTabId && openTabs.has(activeTabId)) {
        const content = editor.getValue();
        const filePath = openTabs.get(activeTabId).filePath;

        clearConsole();

        // 顯示編譯中訊息
        addConsoleMessage('正在編譯...', 'info');

        window.cppCompiler.compile('compile-cpp', content, null);
    }
});

// 接收編譯結果
window.cppCompiler.onResult((result) => {
    if (result.success) {
        // console.log('編譯成功，執行檔路徑:', result.executablePath);
        addConsoleMessage('編譯成功');
    } else {
        // console.error('編譯失敗:', result.error);
        addConsoleMessage('Error : ' + result.error, 'error');
    }
});


// 運行代碼 --------------------------------------------------------------------------------------------
// 存儲最後一次編譯成功的可執行文件路徑
let lastExecutablePath = null;
const runButton = document.getElementById('run-button');
runButton.addEventListener('click', function () {
    if (lastExecutablePath) {
        addConsoleMessage('正在運行程序...', 'info');
        // window.electronAPI.send('run-executable', lastExecutablePath);
    } else {
        addConsoleMessage('請先編譯程序', 'error');
    }
});

// 清空控制台 --------------------------------------------------------------------------------------------
const clearConsoleButton = document.getElementById('clear-console');
clearConsoleButton.addEventListener('click', function () {
    clearConsole();
});

// 新增分頁 ----------------------------------------------------------------------------------------------
const newTabButton = document.getElementById('new-tab');
newTabButton.addEventListener('click', function () {
    createNewTab('Unnamed.cpp', helloWorld_cpp);
});



// 接收執行結果
window.electronAPI.on('execution-result', (event, result) => {
    if (result.success) {
        addConsoleMessage('程序輸出:\n' + result.output, 'output');
    } else {
        addConsoleMessage('執行錯誤:\n' + result.error, 'error');
    }
});

// 向控制台添加消息 ---------------------------------------------------------------------------
function addConsoleMessage(message, type = 'info') {
    const consoleOutput = document.getElementById('console-output');
    const messageElement = document.createElement('div');
    messageElement.className = type;


    messageElement.textContent = message;
    consoleOutput.appendChild(messageElement);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// 清空控制台 --------------------------------------------------------------------------------
function clearConsole() {
    document.getElementById('console-output').innerHTML = '';
}

// 更新 tab 標題 --------------------------------------------------------------------------------
function updateTabTitle(tabId, newTitle) {

    const tabElement = document.getElementById(tabId);
    if (tabElement) {
        const titleElement = tabElement.querySelector('.tab-title');
        if (titleElement) {
            titleElement.textContent = newTitle;
        }
    }
}
