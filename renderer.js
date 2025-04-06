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
    messageInput.disabled = false; // Enable input on showing chat
    sendButton.disabled = false;
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

    // Update local username if provided by status (e.g., on initial load if already logged in)
    // Login response is the primary source for setting localUsername after login action
    if (status.username) {
         localUsername = status.username;
    }

    // Determine UI state based on WebSocket connection and login status
    if (status.connected) { // Logged in
        statusText = 'Online';
        serverInfoText = `(Server: ${status.serverIp})`;
        userInfoText = `Logged in as: ${localUsername}`;
        // Don't call showChatView here - let login response handle it
    } else if (status.wsConnected) { // Socket connected, but not logged in
        statusText = 'Connected (Not Logged In)';
        serverInfoText = `(Server: ${status.serverIp})`;
        userInfoText = '';
        if (authView.style.display === 'none') showAuthView(isLoginMode); // Show auth if chat was visible
    } else if (status.connecting) {
        statusText = `Connecting to ${status.serverIp || 'server'}...`;
        serverInfoText = '';
        userInfoText = '';
        if (authView.style.display === 'none') showAuthView(isLoginMode);
    } else if (status.error) {
        statusText = `Error: ${status.error}`;
        serverInfoText = '';
        userInfoText = '';
         if (authView.style.display === 'none') showAuthView(isLoginMode);
        // Don't show auth error here, let specific login/signup handlers do it
    } else { // Default to disconnected state
        statusText = 'Disconnected';
        serverInfoText = `(Server: ${status.serverIp})`;
        userInfoText = '';
         if (authView.style.display === 'none') showAuthView(isLoginMode);
    }

    connectionStatusSpan.textContent = statusText;
    hostInfoSpan.textContent = serverInfoText;
    userInfoSpan.textContent = userInfoText;

    // Enable/disable chat input based on login status (localUsername being set)
    const isLoggedIn = !!localUsername;
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

function attachToggleListeners() {
    const signupLink = document.getElementById('toggle-signup');
    const loginLink = document.getElementById('toggle-login');
    if (signupLink) {
        signupLink.addEventListener('click', (e) => {
            e.preventDefault();
            showAuthView(false);
        });
    }
    if (loginLink) {
        loginLink.addEventListener('click', (e) => {
            e.preventDefault();
            showAuthView(true);
        });
    }
}
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
        showAuthView(true);
        alert('Signup successful! Please log in.');
    } else {
        showAuthError(response.error || 'Signup failed.');
    }
});

window.electronAPI.onLoginResponse(response => {
    console.log('Login Response:', response);
    if (response.success) {
        localUsername = response.username; // Store username
        hideAuthError();
        showChatView(); // <<< --- ADDED THIS LINE --- >>> Switch to chat view on successful login
        // Update status bar immediately
        userInfoSpan.textContent = `Logged in as: ${localUsername}`;
        connectionStatusSpan.textContent = 'Online';
    } else {
        showAuthError(response.error || 'Login failed.');
    }
});


window.electronAPI.onMessageReceived((messageData) => {
    // console.log('Renderer received message:', messageData); // Can be noisy
    addMessage(messageData);
});

window.electronAPI.onLoadHistory((history) => {
    console.log('Renderer loading history:', history);
    clearMessages();
    history.forEach(msg => addMessage(msg));
});

window.electronAPI.onStatusUpdate((status) => {
    // This will now mainly handle connection status changes after initial login
    updateStatus(status);
});

window.electronAPI.onSendError((errorMsg) => {
    console.error('Send Error:', errorMsg);
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
        showAuthError(`Send Error: ${errorMsg}`);
    }
});

// Request initial status
window.electronAPI.requestStatus();

// Clean up listeners
window.addEventListener('beforeunload', () => {
    window.electronAPI.cleanupListeners();
});

// Initialize view
showAuthView(true);

console.log('renderer.js loaded with auth logic and view switch fix');
