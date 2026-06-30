// --- Configuration ---
const WORKER_URL = 'https://interview-worker.kexun-private.workers.dev';

// --- State Management ---
let chatHistory = [];
let isRequesting = false;

// --- DOM Elements ---
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const typingIndicator = document.getElementById('typing-indicator');
const bookingForm = document.getElementById('booking-form');
const bookingStatus = document.getElementById('booking-status-message');
const bookingSubmitBtn = document.getElementById('booking-submit-btn');

// --- Simple Markdown Parser ---
function parseMarkdown(text) {
  if (!text) return '';

  let html = text;

  // Escapes basic HTML tags to prevent XSS
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Headings (###)
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');

  // Bold (**text**)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Bullet Points (* text or - text)
  html = html.replace(/^\*\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/^-\s+(.+)$/gm, '<li>$1</li>');

  // Wrap consecutive list items in <ul>
  // Simple regex implementation: wraps <li> tags with <ul>
  html = html.replace(/(<li>.*?<\/li>)+/gs, '<ul>$&</ul>');

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
}

// --- Chat Helper Functions ---
function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendMessage(sender, text, toolCallInfo = null) {
  const messageWrapper = document.createElement('div');
  messageWrapper.classList.add('message-wrapper', sender);

  const avatar = document.createElement('div');
  avatar.classList.add('message-avatar');
  avatar.textContent = sender === 'user' ? 'HR' : 'AI';

  const bubble = document.createElement('div');
  bubble.classList.add('message-bubble');

  if (toolCallInfo) {
    const toolBlock = document.createElement('div');
    toolBlock.classList.add('tool-call-block');
    toolBlock.innerHTML = `
      <div class="tool-spinner"></div>
      <div><strong>系統呼叫工具：</strong>${toolCallInfo}</div>
    `;
    bubble.appendChild(toolBlock);
  }

  const content = document.createElement('div');
  content.innerHTML = parseMarkdown(text);
  bubble.appendChild(content);

  messageWrapper.appendChild(avatar);
  messageWrapper.appendChild(bubble);

  chatMessages.appendChild(messageWrapper);
  scrollToBottom();
}

// --- API Service Calls ---
async function sendToAgent(messageText) {
  if (isRequesting) return;

  isRequesting = true;
  chatInput.disabled = true;
  sendBtn.disabled = true;
  typingIndicator.style.display = 'flex';
  scrollToBottom();

  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: messageText,
        history: chatHistory
      })
    });

    if (!response.ok) {
      throw new Error(`伺服器錯誤: ${response.status}`);
    }

    const data = await response.json();

    // Hide typing indicator
    typingIndicator.style.display = 'none';

    // Detect and log tool call events from history to display agent reasoning
    if (data.history) {
      // Find the last functionCall block introduced in the history
      const lastMessages = data.history.slice(chatHistory.length);
      lastMessages.forEach(msg => {
        if (msg.role === 'model' && msg.parts) {
          msg.parts.forEach(part => {
            if (part.functionCall) {
              let toolChineseName = '分析技術難題';
              if (part.functionCall.name === 'get_personal_profile') {
                toolChineseName = '查詢智勛的個人經歷與特質';
              } else if (part.functionCall.name === 'schedule_interview') {
                toolChineseName = '執行線上面試預約排程';
              }
              appendMessage('assistant', `<em>正在為您請求資料庫並運行邏輯計算...</em>`, toolChineseName);
            }
          });
        }
      });

      // Update history in state
      chatHistory = data.history;
    }

    // Append assistant natural language response
    if (data.reply) {
      appendMessage('assistant', data.reply);
    } else {
      appendMessage('assistant', '面試助理已收到您的請求，但並未產生回覆內容。');
    }

  } catch (error) {
    console.error('Agent API Error:', error);
    typingIndicator.style.display = 'none';
    appendMessage('assistant', '抱歉，系統在連線至面試代理人時發生異常。請稍後再試。');
  } finally {
    isRequesting = false;
    chatInput.disabled = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

// --- Submit User Message ---
function submitMessage() {
  const text = chatInput.value.trim();
  if (!text || isRequesting) return;

  appendMessage('user', text);
  chatInput.value = '';
  chatInput.style.height = 'auto';

  sendToAgent(text);
}

// --- Event Listeners ---

// Input field auto-height and Enter key submit
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = (chatInput.scrollHeight - 4) + 'px';
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitMessage();
  }
});

sendBtn.addEventListener('click', submitMessage);

// Suggestion Chips
const chips = [
  { id: 'suggest-chip-1', text: '請告訴我智勛在這個面試系統上的實踐' },
  { id: 'suggest-chip-2', text: '智勛有哪些個人特質與轉職歷程？' },
  { id: 'suggest-chip-3', text: '我想跟智勛預約面試，請幫我啟動預約程序。' }
];

chips.forEach(chipInfo => {
  const el = document.getElementById(chipInfo.id);
  if (el) {
    el.addEventListener('click', () => {
      if (isRequesting) return;
      appendMessage('user', chipInfo.text);
      sendToAgent(chipInfo.text);
    });
  }
});

// Interactive Booking Form
bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('booking-name').value.trim();
  const company = document.getElementById('booking-company').value.trim();
  const time = document.getElementById('booking-time').value.replace('T', ' ') + ':00'; // Formats datetime
  const contact = document.getElementById('booking-contact').value.trim();

  bookingSubmitBtn.disabled = true;
  bookingSubmitBtn.textContent = '預約處理中...';
  bookingStatus.style.display = 'none';

  const formattedPrompt = `我想要預約跟智勛進行面試。聯絡人：${name}，公司：${company}，時間：${time}，聯絡方式：${contact}`;

  // 1. Add visual log to the chat interface
  appendMessage('user', `發送面試預約表單：\n* 聯絡人：${name}\n* 公司：${company}\n* 時間：${time}\n* 聯絡資訊：${contact}`);

  // 2. Clear inputs
  bookingForm.reset();

  // 3. Call Agent to process booking
  try {
    await sendToAgent(formattedPrompt);

    bookingStatus.className = 'booking-status-message success';
    bookingStatus.textContent = '預約資料已成功發送至面試代理人！請查看左側對話框以獲取最終確認資訊。';
    bookingStatus.style.display = 'block';
  } catch (err) {
    bookingStatus.className = 'booking-status-message error';
    bookingStatus.textContent = '預約請求處理失敗，請嘗試直接在對話框中與代理人進行預約。';
    bookingStatus.style.display = 'block';
  } finally {
    bookingSubmitBtn.disabled = false;
    bookingSubmitBtn.textContent = '送出面試預約';
  }
});

// Focus input and set up video loop range (2s to 10s) on load
window.addEventListener('DOMContentLoaded', () => {
  chatInput.focus();

  const video = document.getElementById('cat-video');
  if (video) {
    // Set initial start time
    video.currentTime = 2;
    video.addEventListener('timeupdate', () => {
      // Loop back if it exceeds 10s or falls out of bounds
      if (video.currentTime >= 10 || video.currentTime < 2) {
        video.currentTime = 2;
        video.play().catch(err => console.log('Autoplay play request deferred:', err));
      }
    });
  }
});
