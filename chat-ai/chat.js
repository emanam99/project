const VERSION = "v1.1.2";
const messagesDiv = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const clearButton = document.getElementById('clear-chat');
const loadingIndicator = document.getElementById('loading-indicator');

const userModal = document.getElementById('user-modal');
const userNameInput = document.getElementById('user-name');
const userEmailInput = document.getElementById('user-email');
const saveUserInfoBtn = document.getElementById('save-user-info');

const disclaimer = `⚠️ AI bisa membuat jawaban keliru. Mohon periksa kembali jawaban atau <a href="https://wa.me/6282232999921" target="_blank" class="text-blue-400 underline">hubungi Admin</a>.`;





function saveUserInfo() {
  const name = userNameInput.value.trim();
  const email = userEmailInput.value.trim();
  if (!name || !email || !/^\S+@\S+\.\S+$/.test(email)) {
    alert('Mohon isi nama dan email yang valid.');
    return;
  }
  localStorage.setItem('userName', name);
  localStorage.setItem('userEmail', email);
  localStorage.setItem('userInfoSaved', 'true');
  userModal.classList.add('hidden');
  displayUserGreeting(name);
  userInput.focus();
}

function checkUserInfo() {
  const userName = localStorage.getItem('userName');
  const userEmail = localStorage.getItem('userEmail');
  if (userName && userEmail) {
    userModal.classList.add('hidden');
    displayUserGreeting(userName);
    return true;
  } else {
    userModal.classList.remove('hidden');
    userNameInput.focus();
    return false;
  }
}

function displayUserGreeting(userName) {
  const greeting = document.getElementById('user-greeting');
  if (greeting) greeting.textContent = `${userName}`;
}

function addMessage(text, sender) {
  const message = document.createElement('div');
  message.className = `message-bubble ${sender === 'user' ? 'user-message' : 'ai-message'}`;
  message.innerHTML = sender === 'ai' ? processMarkdown(text) : text;
  messagesDiv.appendChild(message);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function processMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)(?=<li>)/g, '$1')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/<br><br><br>/g, '<br><br>');
}



async function sendMessage() {
  const msg = userInput.value.trim();
  if (!msg) return;
  addMessage(msg, 'user');
  userInput.value = '';

  sendButton.disabled = true;
  loadingIndicator.classList.remove('hidden');

  try {
    const userName = localStorage.getItem('userName') || '';
    const userEmail = localStorage.getItem('userEmail') || '';
    
    console.log('Sending message to Gemini API...');
    
    const response = await fetch('https://alutsmani.id/psa/chat/api/gemini.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_message: msg,
        user_name: userName,
        user_email: userEmail
      })
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Cek content-type
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('Non-JSON response:', text);
      throw new Error(`Server returned non-JSON response. Status: ${response.status}, Content-Type: ${contentType}`);
    }
    
    const result = await response.json();
    console.log('API Response:', result);
    
    if (result.success) {
      addMessage(result.ai_response, 'ai');
      console.log('AI Response:', result.ai_response);
      console.log('Training data count:', result.training_data_count);
      console.log('Messages data count:', result.messages_data_count);
      console.log('Categories:', result.categories);
    } else {
      console.error('API Error:', result.error);
      addMessage('Maaf, terjadi kesalahan saat menghubungi AI: ' + (result.error || 'Unknown error'), 'ai');
    }
  } catch (e) {
    console.error('Fetch Error:', e);
    addMessage('Maaf, terjadi kesalahan saat menghubungi AI: ' + e.message, 'ai');
  }
  
  sendButton.disabled = false;
  loadingIndicator.classList.add('hidden');
}

// Event listeners for modal
saveUserInfoBtn.addEventListener('click', saveUserInfo);
userEmailInput.addEventListener('keypress', e => e.key === 'Enter' && saveUserInfo());

sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', e => e.key === 'Enter' && sendMessage());

// Dropdown user menu logic
const userMenuBtn = document.getElementById('user-menu-btn');
const userDropdown = document.getElementById('user-dropdown');
const dropdownUserName = document.getElementById('dropdown-user-name');
const dropdownUserEmail = document.getElementById('dropdown-user-email');
const aboutBtn = document.getElementById('about-btn');
const dropdownClearChat = document.getElementById('dropdown-clear-chat');

if (userMenuBtn && userDropdown && dropdownUserName && dropdownUserEmail && aboutBtn && dropdownClearChat) {
  userMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    userDropdown.classList.toggle('hidden');
    // Set user info
    dropdownUserName.textContent = localStorage.getItem('userName') || '-';
    dropdownUserEmail.textContent = localStorage.getItem('userEmail') || '-';
    const dropdownVersion = document.getElementById('dropdown-version');
    if (dropdownVersion) dropdownVersion.textContent = `Versi: ${VERSION}`;
  });
  // Tutup dropdown jika klik di luar
  document.addEventListener('click', (e) => {
    if (!userDropdown.classList.contains('hidden')) {
      userDropdown.classList.add('hidden');
    }
    // Tutup modal tentang jika klik di luar konten
    const aboutModal = document.getElementById('about-modal');
    if (aboutModal && !aboutModal.classList.contains('hidden')) {
      if (!document.getElementById('about-modal-content').contains(e.target)) {
        aboutModal.classList.add('hidden');
      }
    }
  });
  userDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  // Tentang
  aboutBtn.addEventListener('click', async () => {
    userDropdown.classList.add('hidden');
    const aboutModal = document.getElementById('about-modal');
    const aboutModalContent = document.getElementById('about-modal-content');
    const aboutModalBody = document.getElementById('about-modal-body');
    if (aboutModal && aboutModalContent && aboutModalBody) {
      // Ambil konten tentang.html
      try {
        console.log('Loading tentang.html...');
        const res = await fetch('tentang.html');
        
        console.log('Tentang response status:', res.status);
        
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        // Cek content-type untuk HTML
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('text/html')) {
          const text = await res.text();
          console.error('Non-HTML response from tentang.html:', text);
          throw new Error(`Server returned non-HTML response. Status: ${res.status}, Content-Type: ${contentType}`);
        }
        
        const html = await res.text();
        aboutModalBody.innerHTML = html + '<div style="text-align:center;margin-top:1.5rem"><button id="close-about-modal" class="btn-primary">Tutup</button></div>';
        aboutModal.classList.remove('hidden');
        // Event close tombol bawah
        document.getElementById('close-about-modal').onclick = () => aboutModal.classList.add('hidden');
        // Event close tombol X
        const closeX = document.getElementById('about-modal-close-x');
        if (closeX) closeX.onclick = () => aboutModal.classList.add('hidden');
      } catch (e) {
        console.error('Error loading tentang.html:', e);
        aboutModalBody.innerHTML = '<p class="text-red-400">Gagal memuat informasi tentang: ' + e.message + '</p>';
        aboutModal.classList.remove('hidden');
      }
    }
  });
  // Hapus Riwayat dari dropdown
  dropdownClearChat.addEventListener('click', async () => {
    location.reload();
  });
}

// Handle mobile keyboard
function handleMobileKeyboard() {
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    // Adjust viewport height for mobile
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    
    // Handle input focus
    userInput.addEventListener('focus', () => {
      setTimeout(() => {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }, 300);
    });
    
    // Handle input blur
    userInput.addEventListener('blur', () => {
      setTimeout(() => {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }, 300);
    });
    
    // Ensure messages area is properly sized
    const updateChatContent = () => {
      const headerHeight = 60;
      const inputHeight = 80;
      const availableHeight = window.innerHeight - headerHeight - inputHeight;
      const chatContent = document.getElementById('chat-content');
      if (chatContent) {
        chatContent.style.height = `${availableHeight}px`;
      }
    };
    
    updateChatContent();
    window.addEventListener('resize', updateChatContent);
  }
}

// Handle window resize
window.addEventListener('resize', handleMobileKeyboard);

window.onload = async () => {
  // Check user info first
  const userInfoExists = checkUserInfo();
  
  // Only focus on chat input if user info exists
  if (userInfoExists) {
    userInput.focus();
  }
  
  // Handle mobile keyboard
  handleMobileKeyboard();
};