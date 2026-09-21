// 从配置文件获取API地址
const API_BASE = CONFIG.API_BASE;

let currentShareFileId = null;
let currentShareLink = null;

// Token 管理
const TokenManager = {
    TOKEN_KEY: 'auth_token',
    USER_KEY: 'auth_user',
    
    save(token, username) {
        localStorage.setItem(this.TOKEN_KEY, token);
        localStorage.setItem(this.USER_KEY, username);
    },
    
    get() {
        return localStorage.getItem(this.TOKEN_KEY);
    },
    
    getUser() {
        return localStorage.getItem(this.USER_KEY);
    },
    
    clear() {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
    },
    
    async isValid() {
        const token = this.get();
        if (!token) return false;
        
        try {
            const response = await fetch(`${API_BASE}/refresh-token?token=${token}`, {
                method: 'POST'
            });
            return response.ok;
        } catch {
            return false;
        }
    }
};

// 更新用户状态栏
async function updateUserBar() {
    const userBar = document.getElementById('userBar');
    const currentUser = document.getElementById('currentUser');
    const userAvatar = document.getElementById('userAvatar');
    const user = TokenManager.getUser();
    
    if (user && TokenManager.get() && await TokenManager.isValid()) {
        currentUser.textContent = user;
        userAvatar.textContent = user.charAt(0).toUpperCase();
        userBar.classList.remove('hidden');
        loadMyShares();
    } else {
        userBar.classList.add('hidden');
        const shareSection = document.getElementById('mySharesSection');
        if (shareSection) {
            shareSection.style.display = 'none';
        }
    }
}

// 退出登录
function logout() {
    TokenManager.clear();
    updateUserBar();
}

// 页面加载时获取文件列表和更新用户状态
document.addEventListener('DOMContentLoaded', async () => {
    // 检查token是否有效，无效则清除
    if (TokenManager.get() && !(await TokenManager.isValid())) {
        TokenManager.clear();
    }
    await updateUserBar();
    loadFileList();
});

// ========== 文件校验（与后端 routes/file_routes.py 同一套判定规则） ==========

// 扩展名解析：与后端 get_file_extension 保持一致
// - 无扩展名（含 ".bashrc" 这类点号开头的隐藏文件）返回 ''，视为合法
// - 先去掉结尾的点和空格，避免 "a.exe." / "a.exe " 绕过黑名单
function getFileExtension(filename) {
    const name = (filename || '').trim().replace(/\.+$/g, '').trim();
    const dot = name.lastIndexOf('.');
    if (dot <= 0) return '';
    return name.slice(dot + 1).trim().replace(/\.+$/g, '').trim().toLowerCase();
}

// 统一的文件校验入口：文件选择、拖放上传都走这里，判定结果与服务端一致
// 返回错误字符串；null 表示通过
function validateFile(file) {
    const ext = getFileExtension(file.name);
    if (CONFIG.BLOCKED_EXTENSIONS.includes(ext)) {
        return '不支持的文件类型';
    }
    if (file.size > CONFIG.MAX_FILE_SIZE) {
        return `文件大小超过限制（最大${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB）`;
    }
    return null;
}

// ========== 上传队列：连续拖放/重复选择同一文件时串行处理并去重 ==========

let uploadQueue = [];          // 待上传文件队列（FIFO）
let uploadInFlightKey = null;  // 正在上传的文件指纹，null 表示空闲

function fileFingerprint(file) {
    return `${file.name}::${file.size}::${file.lastModified || 0}`;
}

// 入参入口（选择/拖放统一走这里）：浏览器先按共享规则校验，失败立即收口，
// 不发请求、不刷新列表，保证提示与最终目录一致
function enqueueFiles(fileList) {
    const files = Array.from(fileList || []);
    let rejected = 0;
    for (const file of files) {
        const error = validateFile(file);
        if (error) {
            rejected++;
            setUploadStatus(`❌ ${file.name}：${error}`);
            continue;
        }
        const key = fileFingerprint(file);
        if (key === uploadInFlightKey || uploadQueue.some(f => fileFingerprint(f) === key)) {
            // 同一文件连续拖放/重复选择：不重复上传
            setUploadStatus(`⚠️ ${file.name} 已在上传队列中，请勿重复添加`);
            continue;
        }
        uploadQueue.push(file);
    }
    processUploadQueue();
    return files.length - rejected;
}

async function processUploadQueue() {
    if (uploadInFlightKey || uploadQueue.length === 0) return;

    const file = uploadQueue.shift();
    uploadInFlightKey = fileFingerprint(file);
    setUploadingUI(true);
    setUploadStatus(`⏳ 正在上传 ${file.name} ...（剩余 ${uploadQueue.length} 个排队）`);
    showLoading('上传中...');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });
        let result = null;
        try {
            result = await response.json();
        } catch {
            result = null;
        }

        if (response.ok && result && result.success) {
            // 服务端返回的是最终权威结果（可能是去重命中），提示以此为准
            if (result.duplicate) {
                setUploadStatus(`⚠️ ${result.filename} 已存在，未重复上传`);
            } else {
                setUploadStatus(`✅ ${result.filename} 上传成功！`);
            }
            // 成功后以服务端目录为准刷新（loadFileList 自带最新请求保护）
            await loadFileList();
        } else {
            // 服务端拒绝：失败必须收口——给出明确提示，不把失败文件写进列表
            const serverError = (result && result.error) || `服务端拒绝（HTTP ${response.status}）`;
            setUploadStatus(`❌ ${file.name} 上传失败: ${serverError}`);
        }
    } catch (error) {
        setUploadStatus(`❌ ${file.name} 上传失败: ${error.message}`);
    } finally {
        uploadInFlightKey = null;
        setUploadingUI(false);
        hideLoading();
        // 队列里还有文件则继续
        if (uploadQueue.length > 0) {
            processUploadQueue();
        }
    }
}

function setUploadStatus(text) {
    const el = document.getElementById('uploadStatus');
    if (el) el.textContent = text;
}

function setUploadingUI(uploading) {
    const zone = document.querySelector('.upload-zone');
    const btn = document.querySelector('.upload-btn');
    if (zone) zone.classList.toggle('uploading', uploading);
    if (btn) btn.disabled = uploading;
}

// 文件选择上传
document.getElementById('fileInput').addEventListener('change', (e) => {
    enqueueFiles(e.target.files);
    e.target.value = ''; // 清空，保证同一文件可再次选择（也会被去重逻辑兜住）
});

// 拖拽上传
const uploadZone = document.querySelector('.upload-zone');

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    // 支持多文件拖放，统一进入串行队列
    enqueueFiles(e.dataTransfer.files);
});

// 加载文件列表
// - 最新请求保护：并发拉取（连续上传/切换页面返回/提交后立即查看）时，
//   只有最后一次请求的结果能写 DOM，避免旧响应覆盖新响应导致“旧大小/重复条目”
// - 失败收口：请求失败时保留已有列表，绝不用错误/陈旧内容覆盖
let fileListRequestSeq = 0;
async function loadFileList(silent = false) {
    const requestId = ++fileListRequestSeq;
    if (!silent) showLoading('加载文件列表...');

    let files;
    try {
        const response = await fetch(`${API_BASE}/files`);
        if (!response.ok) {
            throw new Error(`服务端错误（HTTP ${response.status}）`);
        }
        files = await response.json();
    } catch (error) {
        // 失败收口：不覆盖已有列表，只给状态行一个短暂提示
        const status = document.getElementById('uploadStatus');
        if (status) status.textContent = `⚠️ 文件列表刷新失败，显示的可能不是最新内容: ${error.message}`;
        if (!silent) hideLoading();
        return;
    }

    // 陈旧响应（期间又发起了新的拉取）直接丢弃，不能覆盖最新结果
    if (requestId !== fileListRequestSeq) {
        if (!silent) hideLoading();
        return;
    }

    const fileList = document.getElementById('fileList');
    const isLoggedIn = TokenManager.get() && (await TokenManager.isValid());
    // 登录态检查期间可能又有新请求产生，再校验一次
    if (requestId !== fileListRequestSeq) {
        if (!silent) hideLoading();
        return;
    }

    if (!Array.isArray(files) || files.length === 0) {
        fileList.innerHTML = '<p class="empty-msg">暂无可下载文件</p>';
    } else {
        fileList.innerHTML = files.map(file => `
            <div class="file-item" data-file-id="${escapeHtml(file.id)}">
                <div class="file-info">
                    <div class="file-icon">${getFileIcon(file.name)}</div>
                    <div class="file-details">
                        <div class="file-name">${escapeHtml(file.name)}</div>
                        <div class="file-size">${formatSize(file.size)}</div>
                    </div>
                </div>
                <div class="file-actions">
                    ${isLoggedIn ? `<button class="share-btn" onclick="openShareModal('${escapeHtml(file.id)}', '${escapeHtml(file.name)}')">分享</button>` : ''}
                    <button class="download-btn" onclick="requestDownload('${escapeHtml(file.id)}')">
                        下载
                    </button>
                </div>
            </div>
        `).join('');
    }
    if (!silent) hideLoading();
}

// 切换页面/从分享页返回（bfcache 恢复）后立即拉取最新目录，
// 避免“提交后立即查看/切回页面”看到的还是旧大小、旧条目
window.addEventListener('pageshow', () => {
    fileListRequestSeq++; // 作废所有在途旧请求
    // 页面被缓存恢复时不可能还有真正在传的请求，重置队列状态
    uploadQueue = [];
    uploadInFlightKey = null;
    setUploadingUI(false);
    loadFileList(true);
});

// HTML转义防止XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 请求下载 - 检查token是否有效，有效则直接下载
async function requestDownload(fileId) {
    showLoading('检查授权...');
    
    // 检查是否有有效的token
    if (await TokenManager.isValid()) {
        // token有效，使用 fetch + Authorization 头下载
        document.getElementById('loadingText').textContent = '正在下载...';
        try {
            const response = await fetch(`${API_BASE}/download/${fileId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${TokenManager.get()}`
                }
            });
            if (response.ok) {
                const blob = await response.blob();
                const contentDisposition = response.headers.get('Content-Disposition');
                let filename = 'download';
                if (contentDisposition) {
                    const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)/i);
                    if (match) filename = decodeURIComponent(match[1]);
                }
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
            } else {
                const result = await response.json();
                alert(`下载失败: ${result.error || '未知错误'}`);
            }
        } catch (error) {
            alert(`下载失败: ${error.message}`);
        } finally {
            hideLoading();
        }
        return;
    }
    
    // token无效或不存在，弹出登录框
    hideLoading();
    TokenManager.clear();
    document.getElementById('downloadFileId').value = fileId;
    document.getElementById('authModal').classList.add('active');
    document.getElementById('authError').textContent = '';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('username').focus();
}

// 关闭验证弹窗
function closeAuthModal() {
    document.getElementById('authModal').classList.remove('active');
}

// 身份验证表单提交
document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const fileId = document.getElementById('downloadFileId').value;

    if (!username || !password) {
        document.getElementById('authError').textContent = '请输入用户名和密码';
        return;
    }

    showLoading('验证身份...');
    
    try {
        const response = await fetch(`${API_BASE}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            // 保存token和用户名到本地
            TokenManager.save(result.token, username);
            await updateUserBar();
            loadFileList();
            
            closeAuthModal();
            document.getElementById('loadingText').textContent = '验证成功，正在下载...';
            
            // 使用 fetch + Authorization 头下载
            try {
                const downloadResponse = await fetch(`${API_BASE}/download/${fileId}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${result.token}`
                    }
                });
                if (downloadResponse.ok) {
                    const blob = await downloadResponse.blob();
                    const contentDisposition = downloadResponse.headers.get('Content-Disposition');
                    let filename = 'download';
                    if (contentDisposition) {
                        const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)/i);
                        if (match) filename = decodeURIComponent(match[1]);
                    }
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    a.remove();
                } else {
                    const errResult = await downloadResponse.json();
                    document.getElementById('authError').textContent = `下载失败: ${errResult.error || '未知错误'}`;
                }
            } catch (downloadError) {
                document.getElementById('authError').textContent = `下载失败: ${downloadError.message}`;
            } finally {
                hideLoading();
            }
        } else if (response.status === 429) {
            hideLoading();
            document.getElementById('authError').textContent = '请求过于频繁，请稍后再试';
        } else {
            hideLoading();
            document.getElementById('authError').textContent = result.error || '验证失败，请检查账号密码';
        }
    } catch (error) {
        hideLoading();
        document.getElementById('authError').textContent = `验证失败: ${error.message}`;
    }
});

// 显示加载动画
function showLoading(text = '加载中...') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').classList.add('active');
}

// 隐藏加载动画
function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
}

// 获取文件图标
function getFileIcon(filename) {
    const ext = getFileExtension(filename);
    const icons = {
        pdf: '📄', doc: '📝', docx: '📝', txt: '📃',
        jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️',
        mp3: '🎵', wav: '🎵', mp4: '🎬', avi: '🎬',
        zip: '📦', rar: '📦', '7z': '📦',
        js: '💻', py: '🐍', html: '🌐', css: '🎨'
    };
    return icons[ext] || '📁';
}

// 格式化文件大小
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 格式化时间戳
function formatTimestamp(timestamp) {
    if (!timestamp) return '永久有效';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 格式化剩余时间
function formatRemainingTime(expiresAt) {
    if (!expiresAt) return '永久';
    const remaining = expiresAt - (Date.now() / 1000);
    if (remaining <= 0) return '已过期';
    
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    
    if (hours > 24) {
        const days = Math.floor(hours / 24);
        return `${days} 天 ${hours % 24} 小时`;
    } else if (hours > 0) {
        return `${hours} 小时 ${minutes} 分钟`;
    } else {
        return `${minutes} 分钟`;
    }
}

// 打开分享设置弹窗
function openShareModal(fileId, fileName) {
    currentShareFileId = fileId;
    document.getElementById('shareFileName').textContent = fileName;
    document.getElementById('shareError').textContent = '';
    document.getElementById('expireHours').value = '24';
    document.getElementById('maxDownloads').value = '10';
    document.getElementById('shareModal').classList.add('active');
}

// 关闭分享设置弹窗
function closeShareModal() {
    document.getElementById('shareModal').classList.remove('active');
    currentShareFileId = null;
}

// 确认创建分享链接
async function confirmCreateShare() {
    if (!currentShareFileId) return;
    
    const expireHours = parseInt(document.getElementById('expireHours').value);
    const maxDownloads = parseInt(document.getElementById('maxDownloads').value);
    
    showLoading('生成分享链接...');
    document.getElementById('shareError').textContent = '';
    
    try {
        const response = await fetch(`${API_BASE}/share`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TokenManager.get()}`
            },
            body: JSON.stringify({
                file_id: currentShareFileId,
                expire_hours: expireHours,
                max_downloads: maxDownloads
            })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            closeShareModal();
            showShareSuccessModal(result);
            loadMyShares();
        } else {
            document.getElementById('shareError').textContent = result.error || '生成分享链接失败';
        }
    } catch (error) {
        document.getElementById('shareError').textContent = `错误: ${error.message}`;
    } finally {
        hideLoading();
    }
}

// 显示分享成功弹窗
function showShareSuccessModal(result) {
    currentShareLink = `${window.location.origin}/share.html#${result.share_id}`;
    
    document.getElementById('shareLinkInput').value = currentShareLink;
    document.getElementById('shareInfoName').textContent = result.filename;
    document.getElementById('shareInfoExpire').textContent = formatTimestamp(result.expires_at);
    document.getElementById('shareInfoDownloads').textContent = result.max_downloads ? `${result.max_downloads} 次` : '无限制';
    document.getElementById('copyBtnText').textContent = '复制';
    
    const copyBtn = document.querySelector('.copy-btn');
    copyBtn.classList.remove('copied');
    
    document.getElementById('shareSuccessModal').classList.add('active');
}

// 关闭分享成功弹窗
function closeShareSuccessModal() {
    document.getElementById('shareSuccessModal').classList.remove('active');
    currentShareLink = null;
}

// 复制分享链接
async function copyShareLink() {
    const linkInput = document.getElementById('shareLinkInput');
    const copyBtnText = document.getElementById('copyBtnText');
    const copyBtn = document.querySelector('.copy-btn');
    
    try {
        await navigator.clipboard.writeText(linkInput.value);
        copyBtnText.textContent = '已复制';
        copyBtn.classList.add('copied');
        
        setTimeout(() => {
            copyBtnText.textContent = '复制';
            copyBtn.classList.remove('copied');
        }, 2000);
    } catch (error) {
        linkInput.select();
        document.execCommand('copy');
        copyBtnText.textContent = '已复制';
        copyBtn.classList.add('copied');
        
        setTimeout(() => {
            copyBtnText.textContent = '复制';
            copyBtn.classList.remove('copied');
        }, 2000);
    }
}

// 加载我的分享列表
async function loadMyShares() {
    const section = document.getElementById('mySharesSection');
    const list = document.getElementById('mySharesList');
    
    if (!(await TokenManager.isValid())) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    
    try {
        const response = await fetch(`${API_BASE}/shares`, {
            headers: {
                'Authorization': `Bearer ${TokenManager.get()}`
            }
        });
        
        const shares = await response.json();
        
        if (shares.length === 0) {
            list.innerHTML = '<p class="empty-msg">暂无分享链接</p>';
            return;
        }
        
        list.innerHTML = shares.map(share => {
            const statusClass = share.is_valid ? 'valid' : 'invalid';
            const statusText = share.is_valid ? '有效' : (share.error_msg || '无效');
            
            return `
                <div class="share-item">
                    <div class="share-item-header">
                        <span class="share-item-filename">${escapeHtml(share.filename)}</span>
                        <span class="share-item-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="share-item-details">
                        <div class="share-item-detail">
                            <span class="share-item-detail-label">剩余时间</span>
                            <span class="share-item-detail-value">${formatRemainingTime(share.expires_at)}</span>
                        </div>
                        <div class="share-item-detail">
                            <span class="share-item-detail-label">已下载</span>
                            <span class="share-item-detail-value">${share.download_count} / ${share.max_downloads || '∞'}</span>
                        </div>
                        <div class="share-item-detail">
                            <span class="share-item-detail-label">创建时间</span>
                            <span class="share-item-detail-value">${new Date(share.created_at).toLocaleString('zh-CN')}</span>
                        </div>
                    </div>
                    <div class="share-item-actions">
                        <button class="copy-link-btn" onclick="copyShareLinkFromList('${share.share_id}')">
                            🔗 复制链接
                        </button>
                        <button class="delete-share-btn" onclick="deleteShare('${share.share_id}')">
                            🗑️ 删除
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        list.innerHTML = `<p class="empty-msg">加载失败: ${escapeHtml(error.message)}</p>`;
    }
}

// 从分享列表复制链接
async function copyShareLinkFromList(shareId) {
    const link = `${window.location.origin}/share.html#${shareId}`;
    try {
        await navigator.clipboard.writeText(link);
        alert('分享链接已复制到剪贴板');
    } catch (error) {
        prompt('请手动复制链接:', link);
    }
}

// 删除分享链接
async function deleteShare(shareId) {
    if (!confirm('确定要删除此分享链接吗？删除后链接将立即失效。')) {
        return;
    }
    
    showLoading('删除中...');
    
    try {
        const response = await fetch(`${API_BASE}/share/${shareId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${TokenManager.get()}`
            }
        });
        
        if (response.ok) {
            loadMyShares();
        } else {
            const result = await response.json();
            alert(`删除失败: ${result.error || '未知错误'}`);
        }
    } catch (error) {
        alert(`删除失败: ${error.message}`);
    } finally {
        hideLoading();
    }
}


