const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const connectionStatusSpan = document.getElementById('connection-status');
const hostInfoSpan = document.getElementById('host-info'); // Will display Server URL now
// Remove references to manual connection elements
// const manualConnectArea = document.getElementById('manual-connect-area');
// const manualIpInput = document.getElementById('manual-ip');
// const connectButton = document.getElementById('connect-button');

let localHostname = ''; // Will be set based on status updates

// --- Helper Functions ---
function addMessage(messageData) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message');
    const messageIsFromSelf = messageData.sender === localHostname;
    msgDiv.classList.add(messageIsFromSelf ? 'message-local' : 'message-remote');

    const senderSpan = document.createElement('span');
    senderSpan.classList.add('sender');
    senderSpan.textContent = messageIsFromSelf ? 'Me' : (messageData.sender || 'Unknown');

    const textNode = document.createTextNode(messageData.text);

    const timestampSpan = document.createElement('span');
    timestampSpan.classList.add('timestamp');
    timestampSpan.textContent = messageData.timestamp ? new Date(messageData.timestamp).toLocaleTimeString() : '';

    msgDiv.appendChild(senderSpan);
    msgDiv.appendChild(textNode);
    msgDiv.appendChild(timestampSpan);

    messagesDiv.appendChild(msgDiv);
    const isScrolledToBottom = messagesDiv.scrollHeight - messagesDiv.clientHeight <= messagesDiv.scrollTop + 1;
    if (isScrolledToBottom) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}

function clearMessages() {
    messagesDiv.innerHTML = '';
}

function updateStatus(status) {
    console.log("Status Update:", status);
    let statusText = '';
    let serverInfoText = '';
    // Manual connect area is removed from HTML and logic

    if (status.localHostname) {
        localHostname = status.localHostname;
    }

    if (status.connected) {
        statusText = 'Connected';
        serverInfoText = `(Server: ${status.serverIp})`; // Display the target server URL
    } else if (status.connecting) {
        statusText = `Connecting to ${status.serverIp || 'server'}...`;
        serverInfoText = '';
    } else if (status.error) {
        // Display error, connection attempts will continue automatically based on main.js logic
        statusText = `Error: ${status.error}`;
        serverInfoText = '';
    } else { // Default to disconnected/initial state
        statusText = 'Disconnected';
        serverInfoText = `(Attempting to connect to: ${status.serverIp})`;
    }

    connectionStatusSpan.textContent = statusText;
    hostInfoSpan.textContent = serverInfoText;

    const isConnected = status.connected === true;
    messageInput.disabled = !isConnected;
    sendButton.disabled = !isConnected;
}


// --- Event Listeners ---
sendButton.addEventListener('click', () => {
    const text = messageInput.value.trim();
    if (text && !messageInput.disabled) {
        window.electronAPI.sendMessage(text);
        messageInput.value = '';
    }
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !messageInput.disabled) {
        sendButton.click();
    }
});

// Remove manual connect button listener
// connectButton.addEventListener('click', () => { ... });

// --- IPC Listeners ---
window.electronAPI.onMessageReceived((messageData) => {
    console.log('Renderer received message:', messageData);
    addMessage(messageData);
});

window.electronAPI.onLoadHistory((history) => {
    console.log('Renderer loading history:', history);
    clearMessages();
    history.forEach(msg => addMessage(msg));
});

window.electronAPI.onStatusUpdate((status) => {
    updateStatus(status);
});

window.electronAPI.onSendError((errorMsg) => {
    console.error('Send Error:', errorMsg);
    const errorDiv = document.createElement('div');
    errorDiv.style.color = 'red';
    errorDiv.style.fontStyle = 'italic';
    errorDiv.style.padding = '5px 10px';
    errorDiv.textContent = `Error: ${errorMsg}`;
    messagesDiv.appendChild(errorDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    setTimeout(() => {
        if (errorDiv.parentNode === messagesDiv) {
            messagesDiv.removeChild(errorDiv);
        }
    }, 5000);
});

// Request initial status
window.electronAPI.requestStatus();

// Clean up listeners
window.addEventListener('beforeunload', () => {
    window.electronAPI.cleanupListeners();
});

console.log('renderer.js loaded');
