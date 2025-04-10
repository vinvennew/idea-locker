console.log("Content script loaded");
console.log("Content script loaded");
// 不再需要监听右键消息，保留空文件以符合 manifest.json 配置
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received in content.js:", message);
  if (message.action === "saveMarkdown") {
    const selectedText = window.getSelection().toString();
    if (selectedText) {
      chrome.runtime.sendMessage({
        action: "processMarkdown",
        markdown: selectedText,
        fileType: "html"
      });
    } else {
      alert("Please select some Markdown content!");
    }
  }
});