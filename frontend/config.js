// 前端配置文件
const CONFIG = {
    // API基础地址：Docker环境(通过nginx代理)使用相对路径，本地开发使用完整地址
    API_BASE: window.location.port === '8081' || window.location.port === '80' || window.location.port === ''
        ? '/api'
        : (window.ENV_API_BASE || 'http://localhost:8637/api'),
    
    // 文件上传限制
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    ALLOWED_FILE_TYPES: [
        'image/*',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'application/zip',
        'application/x-rar-compressed'
    ]
};
