// 前端配置文件
const CONFIG = {
    // API基础地址：Docker环境(通过nginx代理)使用相对路径，本地开发使用完整地址
    API_BASE: window.location.port === '8081' || window.location.port === '80' || window.location.port === ''
        ? '/api'
        : (window.ENV_API_BASE || 'http://localhost:8637/api'),

    // 文件上传限制（与后端 config.py 的 MAX_FILE_SIZE 保持一致）
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB

    // 扩展名黑名单：必须与后端 config.py 的 BLOCKED_EXTENSIONS 完全一致。
    // 浏览器校验与目录回显共用这一份判定结果，避免前端放行/后端拒绝互相矛盾。
    BLOCKED_EXTENSIONS: ['exe', 'sh', 'bat', 'cmd', 'ps1', 'py', 'php', 'jsp', 'cgi', 'pl']
};
