const http = new XMLHttpRequest();
let data;
let output = '';
let style = 0;
let escapeNewLine = false;
let spaceComment = false;

const onDocumentReady = () => {
  document.getElementById('url-field').value = getQueryParamUrl();
  if (getFieldUrl()) {
    startExport();
  }
};

const getQueryParamUrl = () => new URLSearchParams(window.location.search).get(
    'url') ?? null;
const getFieldUrl = () => document.getElementById('url-field').value;

function fetchData(url) {
  output = '';

  http.open('GET', `${url}.json`);
  http.responseType = 'json';
  http.send();

  http.onload = function () {
    data = http.response;
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
    download(document.getElementById('output-display').textContent, 'output.md', 'text/plain');
  };
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
  I believe it is acceptible to use this despite it's restrictions*/
  try {
    await navigator.clipboard.writeText(document.getElementById('output-display').textContent);
  } catch (error) {
    console.error(error.message);
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
