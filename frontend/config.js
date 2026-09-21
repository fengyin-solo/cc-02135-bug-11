// 前端配置文件
const CONFIG = {
    // API基础地址：Docker环境(通过nginx代理)使用相对路径，本地开发使用完整地址
    API_BASE: window.location.port === '8081' || window.location.port === '80' || window.location.port === ''
        ? '/api'
        : (window.ENV_API_BASE || 'http://localhost:8637/api'),

    // 文件上传限制（与后端 config.py / Nginx client_max_body_size 保持一致：50MB）
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB

    // 禁止上传的扩展名黑名单——必须与后端 config.py 的 BLOCKED_EXTENSIONS 完全一致。
    // 浏览器预校验、服务端校验、目录回显共用同一份判定规则，避免：
    // 1) 浏览器误拦合法文件；2) 浏览器放行但服务端拒绝导致提示与列表对不上。
    BLOCKED_EXTENSIONS: ['exe', 'sh', 'bat', 'cmd', 'ps1', 'py', 'php', 'jsp', 'cgi', 'pl']
};
