const BASE_URL = 'http://localhost:3000/v1'; // 代理地址
let conversationId = '';
let currentMessages = []; // 当前会话的消息列表
let userId = generateUserId(); // 根据浏览器唯一属性生成用户ID

function generateUserId() {
    // 从localStorage获取已有的userId
    let userId = localStorage.getItem('userId');
    if (userId) {
        return userId;
    }

    // 如果没有，生成新的userId
    const fingerprint = navigator.userAgent + Math.random().toString(36).substring(2, 15);
    userId = btoa(fingerprint).substring(0, 20); // base64编码并截取前20字符
    localStorage.setItem('userId', userId); // 保存到localStorage
    return userId;
}

const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const newConversationButton = document.getElementById('new-conversation');
const historyList = document.getElementById('history-list');

// 添加消息到聊天窗口
function addMessage(content, isUser = false, isImage = false) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    messageDiv.classList.add(isUser ? 'user-message' : 'assistant-message');

    if (isImage) {
        const img = document.createElement('img');
        img.src = content;
        messageDiv.appendChild(img);
    } else if (isUser) {
        messageDiv.textContent = content; // 用户消息直接显示文本
    } else {
        const markdownContent = convertToMarkdown(content);
        messageDiv.innerHTML = marked.parse(markdownContent); // 助理消息使用Markdown
    }

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    currentMessages.push({
        role: isUser ? 'user' : 'assistant',
        content: isImage ? content : (isUser ? messageDiv.textContent : content), // 保存原始内容
        isImage: isImage
    });
}

// 将API返回的answer转换为Markdown格式
function convertToMarkdown(content) {
    let text = content.replace(/<[^>]+>/g, '').trim();
    const lines = text.split('\n').filter(line => line.trim());
    let markdown = '';

    lines.forEach(line => {
        if (line.includes('：') && line.length < 20) {
            markdown += `### ${line}\n`;
        } else if (line.match(/^\d+\.\s/) || line.match(/^[\*\-]\s/)) {
            markdown += `${line}\n`;
        } else {
            markdown += `${line}\n\n`;
        }
    });

    return markdown;
}

// 处理blocking模式响应
async function handleBlockingResponse(query) {
    const requestBody = {
        inputs: { "uuid": "1238828888382883882" },
        query: query,
        response_mode: 'blocking',
        conversation_id: conversationId,
        user: userId
    };

    try {
        const response = await fetch(`${BASE_URL}/chat-messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        if (data.answer) {
            addMessage(data.answer);
            conversationId = data.conversation_id;
            saveConversation();
            loadHistory();
        } else {
            throw new Error('错误: ' + (data.error || '未知错误'));
        }
    } catch (error) {
        throw error; // 抛出错误，供调用者处理
    }
}

// 处理streaming模式响应
async function handleStreamResponse(query) {
    const requestBody = {
        inputs: { "uuid": "1238828888382883882" },
        query: query,
        response_mode: 'streaming',
        conversation_id: conversationId,
        user: userId
    };

    const response = await fetch(`${BASE_URL}/chat-messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantMessage = '';
    let currentMessageDiv = null;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = JSON.parse(line.slice(6));
                switch (data.event) {
                    case 'message':
                    case 'agent_message':
                        if (!currentMessageDiv) {
                            currentMessageDiv = document.createElement('div');
                            currentMessageDiv.classList.add('message', 'assistant-message');
                            chatMessages.appendChild(currentMessageDiv);
                            currentMessages.push({
                                role: 'assistant',
                                content: ''
                            });
                        }
                        assistantMessage += (data.answer || '');
                        const markdownContent = convertToMarkdown(assistantMessage);
                        currentMessageDiv.innerHTML = marked.parse(markdownContent);
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                        currentMessages[currentMessages.length - 1].content = assistantMessage;
                        conversationId = data.conversation_id;
                        break;
                    case 'agent_thought':
                        break;
                    case 'message_file':
                        if (data.type === 'image' && data.belongs_to === 'assistant') {
                            addMessage(data.url, false, true);
                        }
                        conversationId = data.conversation_id;
                        break;
                    case 'message_end':
                        saveConversation();
                        loadHistory(); // 仅在message_end时刷新列表
                        break;
                    case 'message_replace':
                        if (currentMessageDiv) {
                            assistantMessage = data.answer || '';
                            const replacedContent = convertToMarkdown(assistantMessage);
                            currentMessageDiv.innerHTML = marked.parse(replacedContent);
                            currentMessages[currentMessages.length - 1].content = assistantMessage;
                        }
                        conversationId = data.conversation_id;
                        break;
                    case 'error':
                        throw new Error(`错误: ${data.message}`);
                    case 'ping':
                        break;
                    case 'tts_message':
                    case 'tts_message_end':
                        break;
                }
            }
        }
    }
}

// 发送消息（根据是否为新会话创建）
async function sendMessage() {
    const query = messageInput.value.trim();
    if (!query) return;

    addMessage(query, true);
    messageInput.value = '';

    // 如果是新会话（conversationId为空），创建新会话
    const isNewConversation = !conversationId;
    let tempItem = null;

    if (isNewConversation) {
        // 添加临时会话
        tempItem = document.createElement('div');
        tempItem.classList.add('history-item', 'loading');
        tempItem.setAttribute('data-temp-id', 'temp-new');
        tempItem.innerHTML = `
            <span>新对话 (${new Date().toLocaleTimeString()})</span>
            <button class="rename-btn" disabled>重命名</button>
            <button class="delete-btn" disabled>删除</button>
        `;
        historyList.insertBefore(tempItem, historyList.firstChild);
    }

    try {
        await handleStreamResponse(query);
        // 发送成功，临时会话已转为正式会话（loadHistory在message_end时触发）
    } catch (error) {
        addMessage(error.message);
        if (isNewConversation && tempItem) {
            tempItem.remove(); // 发送失败，移除临时会话
            conversationId = ''; // 重置conversationId
            chatMessages.innerHTML = ''; // 清空聊天窗口
            currentMessages = [];
        }
    }
}

// 加载历史会话列表
async function loadHistory() {
    try {
        const response = await fetch(`${BASE_URL}/conversations?user=${userId}&limit=20&sort_by=-updated_at`);
        const data = await response.json();
        if (data.data) {
            historyList.innerHTML = '';
            data.data.forEach(conv => {
                const item = document.createElement('div');
                item.classList.add('history-item');
                item.setAttribute('data-conv-id', conv.id); // 添加data属性以标识会话
                item.innerHTML = `
                    <span>${conv.name || '新对话'} (${new Date(conv.updated_at * 1000).toLocaleTimeString()})</span>
                    <button class="rename-btn">重命名</button>
                    <button class="delete-btn">删除</button>
                `;
                item.querySelector('span').onclick = () => loadConversation(conv.id);
                item.querySelector('.delete-btn').onclick = (e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                };
                item.querySelector('.rename-btn').onclick = (e) => {
                    e.stopPropagation();
                    renameConversation(conv.id, conv.name);
                };
                historyList.appendChild(item);
            });

            // 应用选中样式
            if (conversationId) {
                const selectedItem = historyList.querySelector(`[data-conv-id="${conversationId}"]`);
                if (selectedItem) {
                    selectedItem.classList.add('selected');
                }
            }

            // 默认选中第一个会话并加载历史消息（如果没有新会话）
            if (data.data.length > 0 && !conversationId) {
                const firstConversationId = data.data[0].id;
                await loadConversation(firstConversationId);
                conversationId = firstConversationId;
            }
        } else {
            addMessage('加载会话列表失败: ' + (data.error || '未知错误'));
        }
    } catch (error) {
        addMessage('请求会话列表失败: ' + error.message);
    }
}

// 加载特定会话的消息（切换会话）
async function loadConversation(convId) {
    // 如果当前是新会话，移除临时会话
    if (!conversationId || conversationId === '') {
        const tempItem = historyList.querySelector('[data-temp-id="temp-new"]');
        if (tempItem) {
            tempItem.remove();
        }
    }

    conversationId = convId;
    try {
        const response = await fetch(`${BASE_URL}/messages?conversation_id=${convId}&user=${userId}&limit=20`);
        const data = await response.json();
        if (data.data) {
            chatMessages.innerHTML = '';
            currentMessages = [];

            // 按created_at正序排序（旧消息在上）
            const messages = data.data.sort((a, b) => a.created_at - b.created_at);

            messages.forEach(msg => {
                // 处理用户消息
                if (msg.query) {
                    addMessage(msg.query, true, false);
                }
                // 处理助理消息
                if (msg.answer) {
                    const isImage = msg.message_files && msg.message_files.some(f => f.type === 'image' && f.belongs_to === 'assistant');
                    addMessage(isImage ? msg.message_files[0].url : msg.answer, false, isImage);
                }
            });
        } else {
            addMessage('加载历史消息失败: ' + (data.error || '未知错误'));
        }
    } catch (error) {
        addMessage('请求历史消息失败: ' + error.message);
    }

    // 更新选中样式
    historyList.querySelectorAll('.history-item').forEach(item => {
        item.classList.remove('selected');
        if (item.getAttribute('data-conv-id') === convId) {
            item.classList.add('selected');
        }
    });
}

// 删除会话（调用后端API）
async function deleteConversation(convId) {
    try {
        const response = await fetch(`${BASE_URL}/conversations/${convId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user: userId })
        });
        const data = await response.json();
        if (data.result === 'success') {
            if (conversationId === convId) {
                conversationId = '';
                chatMessages.innerHTML = '';
                currentMessages = [];
            }
            loadHistory(); // 重新加载会话列表
        } else {
            addMessage('删除会话失败: ' + data.message);
        }
    } catch (error) {
        addMessage('删除会话请求失败: ' + error.message);
    }
}

// 重命名会话
async function renameConversation(convId, currentName) {
    const newName = prompt('请输入新会话名称：', currentName || '');
    if (newName === null) return; // 用户取消输入

    try {
        const requestBody = {
            name: newName.trim() || undefined, // 空字符串时不传name
            auto_generate: !newName.trim(), // 如果名称为空，启用自动生成
            user: userId
        };
        const response = await fetch(`${BASE_URL}/conversations/${convId}/name`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        if (data.id) {
            loadHistory(); // 刷新会话列表
        } else {
            addMessage('重命名失败: ' + (data.error || '未知错误'));
        }
    } catch (error) {
        addMessage('重命名请求失败: ' + error.message);
    }
}

// 新建对话（仅前端添加临时会话）
function newConversation() {
    // 如果当前是新会话，移除临时会话
    if (!conversationId || conversationId === '') {
        const tempItem = historyList.querySelector('[data-temp-id="temp-new"]');
        if (tempItem) {
            tempItem.remove();
        }
    }

    // 添加临时会话
    conversationId = ''; // 空字符串表示新会话
    const tempItem = document.createElement('div');
    tempItem.classList.add('history-item', 'loading');
    tempItem.setAttribute('data-temp-id', 'temp-new');
    tempItem.innerHTML = `
        <span>新对话 (${new Date().toLocaleTimeString()})</span>
        <button class="rename-btn" disabled>重命名</button>
        <button class="delete-btn" disabled>删除</button>
    `;
    historyList.insertBefore(tempItem, historyList.firstChild);

    // 清空聊天窗口
    chatMessages.innerHTML = '';
    currentMessages = [];
}

// 保存会话（暂不实现，依赖后端管理）
function saveConversation() {
    // 后端通过message_end事件自动保存会话，无需前端手动保存
}

// 绑定事件
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});
newConversationButton.addEventListener('click', newConversation);

// 页面加载时获取历史会话并初始化
window.onload = loadHistory;