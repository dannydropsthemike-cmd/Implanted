// ============================================================
// chat.js — Live Support Chat Logic
// implanted | Custom 3D Pet Decor
// ============================================================

// ---- CONFIGURATION — update when server address changes ----
const CHAT_SERVER = "https://uninterdicted-karissa-vulpecular.ngrok-free.dev";
// ------------------------------------------------------------

let myUserId        = null;  // IP-based user ID from server
let pollInterval    = null;  // Message polling interval
let countdownInterval = null; // Rate-limit countdown interval
let isConnected     = false;

// --- UI helpers ---
function setStatus(type, text) {
    const dot   = document.getElementById('statusDot');
    const label = document.getElementById('statusText');
    dot.className   = `status-dot ${type}`;
    label.className = `${type}-text`;
    label.textContent = text;
}

function enableInput(enabled) {
    document.getElementById('chatInput').disabled = !enabled;
    document.getElementById('sendBtn').disabled   = !enabled;
}

// --- Render messages ---
function renderMessages(messages) {
    const area  = document.getElementById('chatMessages');
    const empty = document.getElementById('chatEmpty');

    if (!messages || messages.length === 0) {
        empty.style.display = 'flex';
        return;
    }
    empty.style.display = 'none';

    // Avoid scroll-jump when nothing changed
    const newHash = JSON.stringify(messages.map(m => m.timestamp + m.message));
    if (area.dataset.lastHash === newHash) return;
    area.dataset.lastHash = newHash;

    const wasAtBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 60;

    Array.from(area.querySelectorAll('.chat-bubble')).forEach(el => el.remove());

    messages.forEach(msg => {
        const isAdmin = msg.sender === 'admin';
        const bubble  = document.createElement('div');
        bubble.className = `chat-bubble ${isAdmin ? 'bubble-admin' : 'bubble-customer'}`;
        const time  = msg.timestamp ? msg.timestamp.split(' ')[1].substring(0, 5) : '';
        const label = isAdmin ? 'Support' : 'You';
        bubble.innerHTML = `
            <div>${escapeHtml(msg.message)}</div>
            <div class="bubble-meta">${label} · ${time}</div>
        `;
        area.appendChild(bubble);
    });

    if (wasAtBottom) area.scrollTop = area.scrollHeight;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
}

// --- Countdown timer ---
function startCountdown(seconds) {
    clearInterval(countdownInterval);
    enableInput(false);
    let remaining = seconds;

    function tick() {
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        setStatus('rate-limited', `Next message in ${m}:${String(s).padStart(2, '0')}`);
        if (remaining <= 0) {
            clearInterval(countdownInterval);
            setStatus('connected', 'Connected · Reply anytime');
            enableInput(true);
        }
        remaining--;
    }
    tick();
    countdownInterval = setInterval(tick, 1000);
}

// --- Poll for new messages ---
async function pollMessages() {
    if (!myUserId) return;
    try {
        const res = await fetch(`${CHAT_SERVER}/chat/get/me`, { cache: 'no-store' });
        if (!res.ok) return;
        const messages = await res.json();
        renderMessages(messages);
    } catch (e) { /* silent — server briefly unavailable */ }
}

// --- Initialize chat ---
async function initChat() {
    setStatus('connecting', 'Connecting…');
    enableInput(false);
    try {
        // 1. Get user ID (IP-based)
        const ipRes = await fetch(`${CHAT_SERVER}/chat/my_ip`);
        if (!ipRes.ok) throw new Error('Server unreachable');
        const ipData = await ipRes.json();
        myUserId = ipData.ip;

        // 2. Check rate limit
        const rateRes  = await fetch(`${CHAT_SERVER}/chat/rate_status`);
        const rateData = await rateRes.json();

        // 3. Load existing messages
        await pollMessages();

        isConnected = true;

        if (rateData.can_send) {
            setStatus('connected', 'Connected · Send us a message!');
            enableInput(true);
        } else {
            startCountdown(rateData.seconds_remaining);
        }

        // Poll every 4 seconds
        clearInterval(pollInterval);
        pollInterval = setInterval(pollMessages, 4000);

    } catch (err) {
        setStatus('error', 'Could not connect to support server.');
        console.error('Chat init error:', err);
    }
}

// --- Send message ---
async function sendMessage() {
    const input = document.getElementById('chatInput');
    const text  = input.value.trim();
    if (!text || !isConnected) return;

    enableInput(false);
    input.value = '';
    input.style.height = 'auto';

    try {
        const res  = await fetch(`${CHAT_SERVER}/chat/send`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ sender: 'customer', message: text })
        });
        const data = await res.json();

        if (data.status === 'rate_limited') {
            startCountdown(data.seconds_remaining);
        } else if (data.status === 'success') {
            await pollMessages();
            startCountdown(30 * 60); // 30-minute cooldown
        } else {
            setStatus('error', 'Could not send message. Try again.');
            enableInput(true);
        }
    } catch (err) {
        setStatus('error', 'Network error. Please try again.');
        enableInput(true);
    }
}
