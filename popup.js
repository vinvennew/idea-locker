document.addEventListener("DOMContentLoaded", () => {
    const pasteArea = document.getElementById("pasteArea");
    const filenameInput = document.getElementById("filenameInput");
    const saveButton = document.getElementById("saveButton");
    const fileTypeSelect = document.getElementById("fileType");
    const searchInput = document.getElementById("searchInput");
    const feedback = document.getElementById("feedback");
    const treeDiv = document.getElementById("tree");
    const helpButton = document.getElementById("helpButton");
    const pinButton = document.getElementById("pinButton");
    const instructions = document.getElementById("instructions");
  
    if (!treeDiv) {
      console.error("Tree div not found!");
      return;
    }
  
    // 检测用户语言
    const userLang = navigator.language || navigator.userLanguage;
    const isChinese = userLang.startsWith("zh");
  
    // 加载 README.md 并根据语言显示说明
    fetch(chrome.runtime.getURL("README.md"))
      .then(response => {
        if (!response.ok) throw new Error("Failed to fetch README.md");
        return response.text();
      })
      .then(text => {
        const sections = text.split("---");
        if (sections.length < 3) {
          console.error("README.md format invalid, missing sections");
          instructions.innerHTML = "Error: Unable to load instructions.";
          return;
        }
        const instructionsContent = isChinese ? sections[2]?.trim() : sections[1]?.trim();
        if (!instructionsContent) {
          console.error("Selected README.md section is empty");
          instructions.innerHTML = "Error: Instructions content not found.";
          return;
        }
        instructions.innerHTML = instructionsContent
          .replace(/## /g, "<strong>")
          .replace(/\n/g, "<br>")
          .replace(/-\s/g, "<li>")
          .replace(/\*\//g, "</strong>");
      })
      .catch(error => {
        console.error("Failed to load README.md:", error);
        instructions.innerHTML = "Error: Unable to load instructions.";
      });
  
    saveButton.addEventListener("click", () => {
      const markdown = pasteArea.value.trim();
      if (markdown) {
        const customFilename = filenameInput.value.trim();
        chrome.runtime.sendMessage({
          action: "processMarkdown",
          markdown: markdown,
          fileType: fileTypeSelect.value,
          customFilename: customFilename || undefined
        });
        pasteArea.value = "";
        filenameInput.value = "";
        showFeedback();
      } else {
        alert("Please enter some Markdown content!");
      }
    });
  
    searchInput.addEventListener("input", () => {
      renderTree(searchInput.value.toLowerCase());
    });
  
    pinButton.addEventListener('click', () => {
        chrome.windows.create({
            url: "popup.html?detached=true",
            type: "popup", 
            width: 450,
            height: 600
        });
        // Close the current popup after opening the new window
        window.close(); 
    });
  
    // Check if this window was opened as detached 
    const params = new URLSearchParams(window.location.search);
    if (params.get('detached') === 'true') {
        // Remove the 'open in new window' button as it's already in a new window
        if(pinButton) pinButton.style.display = 'none'; 
    }
  
    helpButton.addEventListener("click", (event) => {
      event.stopPropagation(); // Prevent click from bubbling to body
      instructions.classList.toggle('show');
    });
  
    // 点击主 UI 或 Esc 键关闭弹窗
    document.addEventListener("click", (event) => {
      // Close if click is outside instructions and not on help button
      if (instructions.classList.contains('show') && !instructions.contains(event.target) && !helpButton.contains(event.target)) {
        instructions.classList.remove('show');
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && instructions.classList.contains('show')) {
        instructions.classList.remove('show');
      }
    });
  
    function showFeedback() {
      // Use classList to trigger CSS animation
      feedback.classList.add('show');
      // Remove the class after the animation duration + delay
      setTimeout(() => {
        feedback.classList.remove('show');
      }, 2500); // Match animation duration + display time
    }
  
    function renderTree(searchTerm = "") {
      treeDiv.innerHTML = "";
      chrome.storage.local.get(["markdownFiles"], (result) => {
        const files = result.markdownFiles || {};
        
        // Find the timestamp of the most recently saved file across all dates
        let latestTimestamp = 0;
        Object.values(files).flat().forEach(file => {
          if (file.savedAt && file.savedAt > latestTimestamp) {
            latestTimestamp = file.savedAt;
          }
        });

        // Get date keys and sort them in descending order (newest first)
        const sortedDates = Object.keys(files).sort((a, b) => b.localeCompare(a));

        // Iterate over sorted dates
        for (const date of sortedDates) {
          // Filter files based on search term first
          const dateFiles = files[date] || [];
          const filteredFiles = dateFiles.filter(file => 
            (file.title?.toLowerCase() || "").includes(searchTerm) || 
            (file.filename?.toLowerCase() || "").includes(searchTerm)
          );
          
          // If no files match the search term for this date, skip this date folder
          if (filteredFiles.length === 0) continue;
          
          // Create and append the folder element
          const folderDiv = document.createElement("div");
          folderDiv.className = "folder";
          folderDiv.textContent = date;
          treeDiv.appendChild(folderDiv);
          
          // Create the file list element
          const list = document.createElement("ul");
          list.className = "file-list";

          // Sort the filtered files within the date folder (newest first - reverse the array)
          // Note: We need the original index for deletion, so we map before reversing
          const filesWithOriginalIndex = filteredFiles.map((file, index) => ({ ...file, originalIndex: dateFiles.indexOf(file) })).reverse();

          // Add list items for each file
          filesWithOriginalIndex.forEach(file => {
            const li = document.createElement("li");
            
            // Add class if this is the latest file
            if (file.savedAt === latestTimestamp) {
              li.classList.add('latest-file');
            }
            
            const titleSpan = document.createElement("span");
            titleSpan.textContent = file.filename;

            // --- Preview Tooltip Logic Start ---
            let tooltipTimeout;
            let tooltipElement;
            let hideTooltipTimeout; // Timeout ID for hiding the tooltip
            const mouseMoveHandler = (event) => {
              if (!tooltipElement) return; // Exit if tooltip isn't visible
              
              // --- Re-calculate Position on Mouse Move (with Scroll Offset) ---
              const cursorX = event.clientX; // Mouse X relative to viewport
              const cursorY = event.clientY; // Mouse Y relative to viewport
              const scrollX = document.documentElement.scrollLeft; // Horizontal scroll
              const scrollY = document.documentElement.scrollTop; // Vertical scroll
              const popupWidth = document.documentElement.clientWidth;
              const popupHeight = document.documentElement.clientHeight;
              const tooltipRect = tooltipElement.getBoundingClientRect(); // Tooltip dimensions
              const offsetX = 15;
              const offsetY = 10;

              // Calculate desired position relative to the document
              let absoluteLeft = cursorX + scrollX + offsetX;
              let absoluteTop = cursorY + scrollY + offsetY;

              // Check boundaries based on viewport coordinates
              // Check right edge
              if (cursorX + offsetX + tooltipRect.width > popupWidth - 10) {
                absoluteLeft = cursorX + scrollX - tooltipRect.width - offsetX;
              }
              // Check left edge (after potential flip)
              // (Calculate effective left relative to viewport for check)
              let leftRelativeToViewport = absoluteLeft - scrollX;
              if (leftRelativeToViewport < 10) {
                absoluteLeft = 10 + scrollX; 
              }

              // Check bottom edge
              if (cursorY + offsetY + tooltipRect.height > popupHeight - 10) {
                absoluteTop = cursorY + scrollY - tooltipRect.height - offsetY;
              }
              // Check top edge (after potential flip)
              // (Calculate effective top relative to viewport for check)
              let topRelativeToViewport = absoluteTop - scrollY;
              if (topRelativeToViewport < 10) {
                absoluteTop = 10 + scrollY;
              }
              // --- End Re-calculation ---

              tooltipElement.style.left = `${absoluteLeft}px`;
              tooltipElement.style.top = `${absoluteTop}px`;
            };

            titleSpan.addEventListener('mouseenter', (event) => {
              // 1. Clear any hide timer possibly pending from leaving the tooltip
              clearTimeout(hideTooltipTimeout);
              // 2. If a tooltip is already shown for this item, do nothing else
              if (tooltipElement) return;
              // 3. Clear show timer (if mouse moved out and back in quickly)
              clearTimeout(tooltipTimeout);
              // 4. Remove any other tooltips that might exist 
              document.querySelectorAll('.file-preview-tooltip').forEach(el => el.remove());
              // 5. Ensure no move listener is attached yet
              titleSpan.removeEventListener('mousemove', mouseMoveHandler);

              // 6. Start timer to show the tooltip
              tooltipTimeout = setTimeout(() => {
                tooltipElement = document.createElement('div');
                tooltipElement.className = 'file-preview-tooltip';
                const previewContent = document.createElement('pre');
                const truncatedContent = file.content.length > 300 ? file.content.substring(0, 300) + '...' : file.content;
                previewContent.textContent = truncatedContent;
                tooltipElement.appendChild(previewContent); // Add content first

                document.body.appendChild(tooltipElement);

                // --- Add listeners to the tooltip itself --- 
                tooltipElement.addEventListener('mouseenter', () => {
                  // Mouse entered the tooltip, cancel any pending hide action
                  clearTimeout(hideTooltipTimeout);
                });
                tooltipElement.addEventListener('mouseleave', () => {
                  // Mouse left the tooltip, start hide timer
                  hideTooltipTimeout = setTimeout(() => {
                     if (tooltipElement) {
                         tooltipElement.remove();
                         tooltipElement = null;
                         titleSpan.removeEventListener('mousemove', mouseMoveHandler);
                     }
                  }, 200); 
                });
                // --- End tooltip listeners ---

                // --- Initial Position Calculation (remains the same) ---
                const cursorX = event.clientX;
                const cursorY = event.clientY;
                const scrollX = document.documentElement.scrollLeft;
                const scrollY = document.documentElement.scrollTop;
                const popupWidth = document.documentElement.clientWidth;
                const popupHeight = document.documentElement.clientHeight;
                const tooltipRect = tooltipElement.getBoundingClientRect();
                const offsetX = 15;
                const offsetY = 10;
                let absoluteLeft = cursorX + scrollX + offsetX;
                let absoluteTop = cursorY + scrollY + offsetY;
                if (cursorX + offsetX + tooltipRect.width > popupWidth - 10) { absoluteLeft = cursorX + scrollX - tooltipRect.width - offsetX; }
                let leftRelativeToViewport = absoluteLeft - scrollX;
                if (leftRelativeToViewport < 10) { absoluteLeft = 10 + scrollX; }
                if (cursorY + offsetY + tooltipRect.height > popupHeight - 10) { absoluteTop = cursorY + scrollY - tooltipRect.height - offsetY; }
                let topRelativeToViewport = absoluteTop - scrollY;
                if (topRelativeToViewport < 10) { absoluteTop = 10 + scrollY; }
                tooltipElement.style.left = `${absoluteLeft}px`;
                tooltipElement.style.top = `${absoluteTop}px`;

                // Add mousemove listener AFTER tooltip is shown
                titleSpan.addEventListener('mousemove', mouseMoveHandler);

              }, 500); // Delay before showing tooltip
            });

            titleSpan.addEventListener('mouseleave', () => {
              clearTimeout(tooltipTimeout); // Cancel showing if mouse leaves quickly
              // Start hide timer (will be cancelled if mouse enters tooltip)
              hideTooltipTimeout = setTimeout(() => {
                 if (tooltipElement) {
                     tooltipElement.remove();
                     tooltipElement = null;
                     titleSpan.removeEventListener('mousemove', mouseMoveHandler);
                 }
              }, 200); 
            });
            // --- End Preview Tooltip Logic ---

            // Append elements to the list item in the correct order
            li.appendChild(titleSpan);
            
            // --- Create Open Button --- 
            const openButton = document.createElement('button');
            openButton.textContent = 'Open'; // Or use an icon
            openButton.className = 'open-button file-action-button';
            openButton.title = 'Open file content in new tab';
            openButton.onclick = (e) => {
                e.stopPropagation();
                const blob = new Blob([file.content], { 
                  type: file.filename.endsWith(".md") ? "text/markdown;charset=utf-8" : "text/html;charset=utf-8" 
                });
                const url = URL.createObjectURL(blob);
                window.open(url);
                // Revoke after a short delay to allow the new tab to load
                setTimeout(() => URL.revokeObjectURL(url), 100); 
            };
            li.appendChild(openButton); // Append Open button first
            // --- End Open Button ---

            // --- Create Copy Button ---
            const copyButton = document.createElement('button');
            copyButton.textContent = 'Copy';
            copyButton.className = 'copy-button file-action-button';
            copyButton.title = 'Copy file content';
            copyButton.onclick = (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(file.content) 
                .then(() => {
                    console.log("Content copied successfully.");
                    copyButton.textContent = 'Copied!';
                    setTimeout(() => { copyButton.textContent = 'Copy'; }, 1500);
                }).catch(err => {
                    console.error("Error copying file content:", err);
                    alert("Failed to copy content.");
                    copyButton.textContent = 'Error';
                     setTimeout(() => { copyButton.textContent = 'Copy'; }, 1500);
                });
            };
            li.appendChild(copyButton); // Append Copy button after Open
            // --- End Copy Button ---

            // --- Create Delete Button ---
            const deleteButton = document.createElement("button");
            deleteButton.textContent = "Delete";
            deleteButton.className = 'delete-button file-action-button';
            deleteButton.onclick = () => {
              deleteFile(date, file.originalIndex);
            };
            li.appendChild(deleteButton); // Append Delete button last

            list.appendChild(li);
          });
          treeDiv.appendChild(list);
        }
      });
    }
  
    function deleteFile(date, originalIndex) { // Use originalIndex now
      console.log(`Requesting delete for date: ${date}, originalIndex: ${originalIndex}`);
      // Send message to background script to handle deletion
      chrome.runtime.sendMessage({ 
          action: "deleteDownload", 
          date: date, 
          originalIndex: originalIndex 
      }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("Error sending delete message:", chrome.runtime.lastError.message);
            alert("Error communicating with background script for deletion.");
          } else if (response && response.success) {
            console.log("Deletion processed by background script.");
            // Re-render the tree after background confirms processing
            renderTree(searchInput.value.toLowerCase()); 
          } else {
             console.error("Background script reported error during deletion:", response?.error);
             alert(`Failed to delete file: ${response?.error || 'Unknown error'}`);
             // Optionally re-render even on failure if storage might be inconsistent
             renderTree(searchInput.value.toLowerCase());
          }
      });
      // Do not modify storage or re-render here directly anymore.
    }
  
    renderTree();
  });