const { contextBridge, ipcRenderer } = require('electron');


// 所有的 Node.js API接口 都可以在 preload 进程中被调用.
// 它拥有与Chrome扩展一样的沙盒。
window.addEventListener('DOMContentLoaded', () => {
    const replaceText = (selector, text) => {
        const element = document.getElementById(selector)
        if (element) element.innerText = text
    }

    for (const dependency of ['chrome', 'node', 'electron']) {
        replaceText(`${dependency}-version`, process.versions[dependency])
    }
})


// contextBridge  --------------------------------------------------------------------------------------------
contextBridge.exposeInMainWorld('cppCompiler', {
    compile: (code, filepath) => {
        ipcRenderer.send('compile-cpp', code, filepath);
    },
    onCompileResult: (callback) => {
        ipcRenderer.once('compilation-result', (_event, result) => {
            callback(result);
        });
    },

    run: (code, input, filepath) => {
        ipcRenderer.send('compile-cpp', code, input, filepath);
    },
    onRunResults: (callback) => {
        ipcRenderer.once('run-result', (_event, result) => {
            callback(result);
        });
    }


});

contextBridge.exposeInMainWorld('fileManager', {
    openFile: () => {
        ipcRenderer.send('open-file-dialog');
    },
    onOpenFileResult: (callback) => {
        ipcRenderer.once('file-opened', (event, result) => {
            callback(result);
        });
    },

    saveFile: (content, path) => {
        ipcRenderer.send('save-file', { content, path });
    },
    saveFileAs: (content) => {
        ipcRenderer.send('save-file-dialog', content);
    },
    onSaveFileResult: (callback) => {
        ipcRenderer.once('file-saved', (event, result) => {
            callback(result);
        });
    }

});


contextBridge.exposeInMainWorld("cppRunner", {
    runCode: (code, input, filepath) => ipcRenderer.invoke("run-cpp", code, input, filepath)
});