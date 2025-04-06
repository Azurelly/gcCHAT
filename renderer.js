// --- DOM Elements ---
// Auth View
const authView = document.getElementById('auth-view');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('login-button');
const signupButton = document.getElementById('signup-button');
const authTitle = document.getElementById('auth-title');
const toggleAuthLink = document.getElementById('toggle-signup');
const toggleAuthMessage = document.getElementById('toggle-auth-message');
const authErrorDiv = document.getElementById('auth-error');

// Chat View
const chatView = document.getElementById('chat-view');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const connectionStatusSpan = document.getElementById('connection-status');
const hostInfoSpan = document.getElementById('host-info'); // Server URL
const userInfoSpan = document.getElementById('user-info'); // Logged in user

// --- State ---
let localUsername = ''; // Will be set on successful login
let isLoginMode = true; // Start in login mode

// --- UI Switching ---
function showAuthView(showLogin = true) {
    isLoginMode = showLogin;
    authTitle.textContent = isLoginMode ? 'Login' : 'Sign Up';
    loginButton.style.display = isLoginMode ? 'block' : 'none';
    signupButton.style.display = isLoginMode ? 'none' : 'block';
    toggleAuthMessage.innerHTML = isLoginMode
        ? `Don't have an account? <a href="#" id="toggle-signup">Sign up here</a>.`
        : `Already have an account? <a href="#" id="toggle-login">Login here</a>.`;
    // Re-attach listeners after innerHTML change
    attachToggleListeners();

    authView.style.display = 'block';
    chatView.style.display = 'none';
    document.body.style.justifyContent = 'center'; // Center auth view
    document.body.style.alignItems = 'center';
    hideAuthError(); // Clear errors when switching modes
}

function showChatView() {
    authView.style.display = 'none';
    chatView.style.display = 'flex'; // Use flex for chat layout
    document.body.style.justifyContent = 'flex-start'; // Reset body alignment
    document.body.style.alignItems = 'stretch';
    messageInput.focus(); // Focus message input when chat appears
}

function showAuthError(message) {
    authErrorDiv.textContent = message;
    authErrorDiv.style.display = 'block';
}

function hideAuthError() {
    authErrorDiv.textContent = '';
    authErrorDiv.style.display = 'none';
}


// --- Helper Functions ---
function addMessage(messageData) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message');
    // Determine sender based on authenticated username
    const messageIsFromSelf = messageData.sender === localUsername;
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
    let userInfoText = '';

    // Update local username if logged in
    localUsername = status.username || ''; // Use username from status if available

    if (status.connected) { // Connected means logged in successfully
        statusText = 'Online';
        serverInfoText = `(Server: ${status.serverIp})`;
        userInfoText = `Logged in as: ${localUsername}`;
        showChatView(); // Show chat on successful login/connection
    } else if (status.wsConnected) { // WebSocket connected, but not logged in yet
        statusText = 'Connected (Not Logged In)';
        serverInfoText = `(Server: ${status.serverIp})`;
        userInfoText = '';
        showAuthView(isLoginMode); // Stay on auth view
    } else if (status.connecting) {
        statusText = `Connecting to ${status.serverIp || 'server'}...`;
        serverInfoText = '';
        userInfoText = '';
        showAuthView(isLoginMode); // Show auth view while connecting
    } else if (status.error) {
        statusText = `Error: ${status.error}`;
        serverInfoText = '';
        userInfoText = '';
        showAuthView(isLoginMode); // Show auth view on error
        // Don't show auth error here, let specific login/signup handlers do it
    } else { // Default to disconnected state
        statusText = 'Disconnected';
        serverInfoText = `(Server: ${status.serverIp})`;
        userInfoText = '';
        showAuthView(isLoginMode); // Show auth view if disconnected
    }

    connectionStatusSpan.textContent = statusText;
    hostInfoSpan.textContent = serverInfoText;
    userInfoSpan.textContent = userInfoText;

    // Enable/disable chat input based on login status
    const isLoggedIn = status.connected === true;
    messageInput.disabled = !isLoggedIn;
    sendButton.disabled = !isLoggedIn;
}


// --- Event Listeners ---
loginButton.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (username && password) {
        hideAuthError();
        console.log('Sending login request for:', username);
        window.electronAPI.sendLogin({ username, password });
    } else {
        showAuthError('Please enter both username and password.');
    }
});

signupButton.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (username && password) {
        hideAuthError();
        console.log('Sending signup request for:', username);
        window.electronAPI.sendSignup({ username, password });
    } else {
        showAuthError('Please enter both username and password.');
    }
});

// Need function to re-attach listeners because innerHTML is changed
function attachToggleListeners() {
    const signupLink = document.getElementById('toggle-signup');
    const loginLink = document.getElementById('toggle-login');
    if (signupLink) {
        signupLink.addEventListener('click', (e) => {
            e.preventDefault();
            showAuthView(false); // Show signup mode
        });
    }
    if (loginLink) {
        loginLink.addEventListener('click', (e) => {
            e.preventDefault();
            showAuthView(true); // Show login mode
        });
    }
}
// Initial attachment
attachToggleListeners();


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

// Also allow Enter key in password field to trigger login/signup
passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        if (isLoginMode) {
            loginButton.click();
        } else {
            signupButton.click();
        }
    }
});


// --- IPC Listeners ---
window.electronAPI.onSignupResponse(response => {
    console.log('Signup Response:', response);
    if (response.success) {
        // Optionally switch to login view after successful signup
        showAuthView(true);
        // Show a success message (maybe not in the error div)
        alert('Signup successful! Please log in.'); // Simple alert for now
    } else {
        showAuthError(response.error || 'Signup failed.');
    }
});

window.electronAPI.onLoginResponse(response => {
    console.log('Login Response:', response);
    if (response.success) {
        localUsername = response.username; // Store username
        // Status update will handle showing chat view
        // showChatView(); // Let status update handle this
        hideAuthError();
    } else {
        showAuthError(response.error || 'Login failed.');
    }
});


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
    // Display error in chat view if it's visible, otherwise maybe auth view?
    if (chatView.style.display !== 'none') {
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
    } else {
        showAuthError(`Send Error: ${errorMsg}`); // Show in auth view if chat isn't visible
    }
});

// Request initial status
window.electronAPI.requestStatus();

// Clean up listeners
window.addEventListener('beforeunload', () => {
    window.electronAPI.cleanupListeners();
});

// Initialize view
showAuthView(true); // Start in login mode

console.log('renderer.js loaded with auth logic');
