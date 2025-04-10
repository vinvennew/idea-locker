/**
 * 软件名称: IEDA LOCKER
 * 功能概述: 该软件是一个 Chrome 扩展程序，用于保存 Markdown 内容为 HTML 或 Markdown 文件，
 * 并以日期为基础构建目录树结构进行管理。用户可以方便地保存、搜索和删除已保存的文件。
 * 
 * 功能详细说明:
 * 1. 保存 Markdown 内容: 用户可以在弹出窗口中粘贴 Markdown 内容，选择保存为 HTML 或 Markdown 文件，
 *    还可以自定义文件名。保存后，文件会以日期为目录结构进行存储，同时保存到本地存储中。
 * 2. 搜索功能: 用户可以在搜索框中输入关键词，搜索已保存的文件，搜索结果会实时更新。
 * 3. 删除文件: 用户可以在文件列表中点击"Delete"按钮删除指定的文件，删除后会自动更新文件列表。
 * 
 * 使用方法:
 * 1. 打开 Chrome 浏览器，安装该扩展程序。
 * 2. 点击扩展程序图标，弹出扩展窗口。
 * 3. 在文本框中粘贴 Markdown 内容。
 * 4. 若需要自定义文件名，在"Enter filename"输入框中输入文件名；若不输入，则使用默认文件名（格式为 YYYY-MM-DD-HH-MM-SS）。
 * 5. 通过下拉框选择保存文件的类型（HTML 或 Markdown）。
 * 6. 点击"Save"按钮，软件会将 Markdown 内容保存为指定类型的文件，并下载到默认路径。
 * 7. 保存成功后，会弹出提示信息，2 秒后自动消失。
 * 8. 若需要搜索已保存的文件，在搜索框中输入关键词，文件列表会实时更新显示匹配的文件。
 * 9. 若需要删除已保存的文件，在文件列表中找到对应的文件，点击"Delete"按钮即可删除。
 */
importScripts("node_modules/markdown-it/dist/markdown-it.min.js");

console.log("Background script loaded");

const md = new markdownit();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "processMarkdown") {
    const markdown = message.markdown;
    const date = new Date();
    const dateStr = date.toISOString().split("T")[0];
    const timeStr = date.toTimeString().split(" ")[0].replace(/:/g, "-");
    const fileType = message.fileType || "html";
    const baseFilename = message.customFilename || `${dateStr}-${timeStr}`;
    const filename = `${baseFilename}.${fileType}`;
    const fullPath = `${dateStr}/${filename}`;
    const fileTitle = markdown.split("\n")[0].replace(/^#+/, "").trim() || "Untitled";
    const saveTimestamp = Date.now(); 

    // --- Handle HTML/MD Saving (Simplified) ---
    const content = fileType === "md" ? markdown : `<pre style="white-space: pre-wrap;">${md.render(markdown)}</pre>`;
    const dataUrl = `data:text/${fileType};charset=utf-8,${encodeURIComponent(content)}`;

    chrome.downloads.download({
        url: dataUrl,
        filename: fullPath,
        saveAs: false
    }, (downloadId) => {
        if (chrome.runtime.lastError) {
            console.error("Download failed:", chrome.runtime.lastError.message);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else if (downloadId) {
            console.log("File downloaded with ID:", downloadId);
            chrome.storage.local.get(["markdownFiles"], (result) => {
                const files = result.markdownFiles || {};
                if (!files[dateStr]) files[dateStr] = [];
                files[dateStr].push({ 
                    title: fileTitle,
                    filename,
                    content: markdown, // Save original markdown for preview
                    savedAt: saveTimestamp,
                    downloadId: downloadId 
                });
                chrome.storage.local.set({ markdownFiles: files }, () => {
                    console.log("Metadata saved to storage for ID:", downloadId);
                    sendResponse({ success: true, downloadId: downloadId });
                });
            });
        } else {
            console.error("Download initiated but no downloadId received.");
            sendResponse({ success: false, error: "No downloadId received." });
        }
    });
    return true; // Async response
    // --- End HTML/MD Saving ---

  } else if (message.action === "deleteDownload") {
    const { date, originalIndex } = message;
    console.log(`Received request to delete file at date: ${date}, index: ${originalIndex}`);

    chrome.storage.local.get(["markdownFiles"], (result) => {
      let files = result.markdownFiles || {};
      let fileToDelete = null;
      let downloadIdToDelete = null;
      
      if (files[date] && files[date][originalIndex] !== undefined) {
          fileToDelete = files[date][originalIndex];
          downloadIdToDelete = fileToDelete.downloadId;
          
          // Remove from storage first
          files[date].splice(originalIndex, 1);
          if (files[date].length === 0) delete files[date];

          chrome.storage.local.set({ markdownFiles: files }, () => {
            console.log("Removed file entry from storage.");

            if (downloadIdToDelete) {
              console.log("Attempting to remove file and erase history for download ID:", downloadIdToDelete);
              chrome.downloads.removeFile(downloadIdToDelete, () => {
                 if (chrome.runtime.lastError) {
                    console.warn(`Failed to remove file for ID ${downloadIdToDelete}:`, chrome.runtime.lastError.message, "(File might already be deleted externally)");
                 } else {
                    console.log(`Successfully removed file for ID: ${downloadIdToDelete}`);
                 }
                 // Always try to erase from history
                 chrome.downloads.erase({ id: downloadIdToDelete }, () => {
                     if (chrome.runtime.lastError) {
                         console.warn(`Failed to erase download history for ID ${downloadIdToDelete}:`, chrome.runtime.lastError.message);
                     } else {
                         console.log(`Successfully erased download history for ID: ${downloadIdToDelete}`);
                     }
                     sendResponse({ success: true }); // Report success after attempting removal/erase
                 });
              });
            } else {
              console.warn("No downloadId found for the file entry, cannot remove file/erase history.");
              sendResponse({ success: true }); // Still report success as storage entry is removed
            }
          });
      } else {
        console.error("File not found in storage for deletion.");
        sendResponse({ success: false, error: "File not found in storage." });
      }
    });
    // Important: Return true for async response
    return true; 
  }
});