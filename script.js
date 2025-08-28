const http = new XMLHttpRequest();
let data;
let output = '';
let style = 0;
let escapeNewLine = false;
let spaceComment = false;
var selectedProxy = 'auto';

// CORS Proxy configurations
const PROXY_CONFIG = {
  codetabs: {
    name: "CodeTabs",
    url: (redditUrl) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(redditUrl)}`,
    parseResponse: (response) => response
  },
  corslol: {
    name: 'CORS.lol',
    url: (redditUrl) => `https://api.cors.lol/?url=${encodeURIComponent(redditUrl)}`,
    parseResponse: (response) => response
  },
  direct: {
    name: 'Direct',
    url: (redditUrl) => redditUrl,
    parseResponse: (response) => response
  }
};

// Auto mode proxy order (try these in sequence)
const AUTO_PROXY_ORDER = ['codetabs', 'corslol', 'direct'];

const onDocumentReady = () => {
  document.getElementById('url-field').value = getQueryParamUrl();
  if (getFieldUrl()) {
    startExport();
  }
};

const getQueryParamUrl = () => new URLSearchParams(window.location.search).get(
    'url') ?? null;
const getFieldUrl = () => document.getElementById('url-field').value;

function formatRedditJsonUrl(url) {
  // Check if URL already has .json extension
  if (url.includes('.json')) {
    return url;
  }
  
  // Find the position of query parameters (?) and fragments (#)
  const queryIndex = url.indexOf('?');
  const fragmentIndex = url.indexOf('#');
  
  // Determine the earliest special character position
  let insertIndex = url.length;
  if (queryIndex !== -1) insertIndex = Math.min(insertIndex, queryIndex);
  if (fragmentIndex !== -1) insertIndex = Math.min(insertIndex, fragmentIndex);
  
  // Extract base URL and remainder
  let baseUrl = url.substring(0, insertIndex);
  const remainder = url.substring(insertIndex);
  
  // Remove trailing slash from baseUrl if present
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }
  
  // Insert .json at the appropriate position
  return `${baseUrl}.json${remainder}`;
}

function updateProxyStatus(message) {
  const statusElement = document.getElementById('proxyStatus');
  if (message) {
    statusElement.textContent = message;
    statusElement.style.display = 'block';
  } else {
    statusElement.style.display = 'none';
  }
}

async function fetchWithProxy(redditUrl, proxyKey) {
  const config = PROXY_CONFIG[proxyKey];
  const requestUrl = config.url(redditUrl);
  
  updateProxyStatus(`Trying ${config.name}...`);
  console.log(`Attempting with ${config.name}: ${requestUrl}`);
  
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', requestUrl);
    xhr.responseType = 'json';
    
    xhr.onload = function() {
      if (xhr.status === 200) {
        try {
          let responseData;
          
          // Handle different response formats
          if (xhr.response) {
            responseData = config.parseResponse(xhr.response);
          } else if (xhr.responseText) {
            // Try parsing as JSON if we got text
            try {
              responseData = JSON.parse(xhr.responseText);
            } catch (parseError) {
              reject(new Error(`Failed to parse JSON response from ${config.name}: ${parseError.message}`));
              return;
            }
          } else {
            reject(new Error(`Empty response from ${config.name}`));
            return;
          }
          
          console.log(`Response from ${config.name}:`, responseData);
          
          // Validate Reddit data structure
          if (responseData && Array.isArray(responseData) && responseData.length >= 2 &&
              responseData[0] && responseData[0].data && responseData[0].data.children &&
              responseData[1] && responseData[1].data && responseData[1].data.children) {
            updateProxyStatus(`✅ Success with ${config.name}`);
            resolve(responseData);
          } else {
            reject(new Error(`Invalid Reddit data structure from ${config.name}`));
          }
        } catch (e) {
          reject(new Error(`Parse error with ${config.name}: ${e.message}`));
        }
      } else {
        reject(new Error(`HTTP ${xhr.status} from ${config.name}`));
      }
    };
    
    xhr.onerror = function() {
      // Check for common CORS errors
      if (window.location.protocol === 'file:') {
        reject(new Error(`CORS error with ${config.name} - Try serving from HTTP server instead of opening file directly`));
      } else {
        reject(new Error(`Network error with ${config.name}`));
      }
    };
    
    xhr.ontimeout = function() {
      reject(new Error(`Timeout with ${config.name}`));
    };
    
    xhr.timeout = 10000; // 10 second timeout
    xhr.send();
  });
}

async function fetchData(url) {
  output = '';
  const redditUrl = formatRedditJsonUrl(url);
  
  try {
    let responseData = null;
    
    if (selectedProxy === 'auto') {
      // Try each proxy in sequence until one works
      for (const proxyKey of AUTO_PROXY_ORDER) {
        try {
          responseData = await fetchWithProxy(redditUrl, proxyKey);
          break; // Success! Exit the loop
        } catch (error) {
          console.warn(`${PROXY_CONFIG[proxyKey].name} failed:`, error.message);
          // Continue to next proxy
        }
      }
      
      if (!responseData) {
        updateProxyStatus('❌ All proxies failed');
        let errorMessage = 'Unable to fetch data with any proxy service. ';
        if (window.location.protocol === 'file:') {
          errorMessage += 'Try serving this page from an HTTP server (e.g., python -m http.server 8000) instead of opening the HTML file directly.';
        } else {
          errorMessage += 'Please check the Reddit URL or try again later.';
        }
        alert(errorMessage);
        return;
      }
    } else {
      // Use specific proxy
      responseData = await fetchWithProxy(redditUrl, selectedProxy);
    }
    
    // Process the data
    data = responseData;
    const post = data[0].data.children[0].data;
    const comments = data[1].data.children;
    displayTitle(post);
    output += '\n\n## Comments\n\n';
    comments.forEach(displayComment);

    console.log('Done');
    let output_display = document.getElementById('output-display');
    let output_block = document.getElementById('output-block');
    output_block.removeAttribute('hidden');
    output_display.innerHTML = output;
    download(output_display.textContent, 'output.md', 'text/plain');
    
  } catch (error) {
    console.error('Fetch error:', error);
    updateProxyStatus(`❌ Error: ${error.message}`);
    
    let errorMessage = `Failed to fetch Reddit data: ${error.message}`;
    
    // Add helpful suggestions based on error type
    if (error.message.includes('CORS error')) {
      errorMessage += '\n\nSuggestion: Try serving this page from an HTTP server instead of opening the HTML file directly.';
    } else if (error.message.includes('Invalid Reddit data structure')) {
      errorMessage += '\n\nSuggestion: Please verify the Reddit URL is correct and includes the full post URL.';
    } else if (error.message.includes('Network error') && selectedProxy === 'direct') {
      errorMessage += '\n\nSuggestion: Try enabling a CORS proxy from the dropdown above.';
    }
    
    alert(errorMessage);
  }
}

function setStyle() {
  if (document.getElementById('treeOption').checked) {
    style = 0;
  } else {
    style = 1;
  }

  if (document.getElementById('escapeNewLine').checked) {
    escapeNewLine = true;
  } else {
    escapeNewLine = false;
  }

  if (document.getElementById('spaceComment').checked) {
    spaceComment = true;
  } else {
    spaceComment = false;
  }

  selectedProxy = document.getElementById('proxySelection').value;
}

function startExport() {
  console.log('Start exporting');
  setStyle();

  let url = getFieldUrl();
  if (url) {
    fetchData(url);
  } else {
    console.log('No url provided');
  }
}

async function copyExport() {
  /*according to https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText
  this should only work in 'Secure Contexts' (https or localhost/loopback addresses)
  Since GitHub Pages supports https and getting a certificate for any other host is a 10 minute job
  I believe it is acceptable to use this despite its restrictions*/
  try {
    await navigator.clipboard.writeText(document.getElementById('output-display').textContent);
  } catch (error) {
    console.error('Failed to copy to clipboard:', error.message);
  }
}

function download(text, name, type) {
  document.getElementById('copyButton').removeAttribute('disabled');
  let download_button = document.getElementById('downloadButton');
  download_button.removeAttribute('disabled');
  let file = new Blob([text], {type: type});
  download_button.href = URL.createObjectURL(file);
  download_button.download = name;
}

function displayTitle(post) {
  output += `# ${post.title}\n`;
  if (post.selftext) {
    output += `\n${post.selftext}\n`;
  }
  output += `\n[permalink](http://reddit.com${post.permalink})`;
  output += `\nby *${post.author}* (↑ ${post.ups}/ ↓ ${post.downs})`;
}

function formatComment(text) {
  if (escapeNewLine) {
    return text.replace(/(\r\n|\n|\r)/gm, '');
  } else {
    return text;
  }
}

function displayComment(comment, index) {
  if (style == 0) {
    depthTag = '─'.repeat(comment.data.depth);
    if (depthTag != '') {
      output += `├${depthTag} `;
    } else {
      output += `##### `;
    }
  } else {
    depthTag = '\t'.repeat(comment.data.depth);
    if (depthTag != '') {
      output += `${depthTag}- `;
    } else {
      output += `- `;
    }
  }

  if (comment.data.body) {
    console.log(formatComment(comment.data.body));
    output += `${formatComment(
        comment.data.body)} ⏤ by *${comment.data.author}* (↑ ${
        comment.data.ups
    }/ ↓ ${comment.data.downs})\n`;
  } else {
    output += 'deleted \n';
  }

  if (comment.data.replies) {
    const subComment = comment.data.replies.data.children;
    subComment.forEach(displayComment);
  }

  if (comment.data.depth == 0 && comment.data.replies) {
    if (style == 0) {
      output += '└────\n\n';
    }
    if (spaceComment) {
      output += '\n';
    }
  }
}
