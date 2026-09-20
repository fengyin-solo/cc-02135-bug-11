"""Flask 应用入口"""
import logging
from flask import Flask, jsonify
from flask_cors import CORS
from config import PORT, MAX_FILE_SIZE
from database import init_db
from routes import auth_bp, files_bp

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

app = Flask(__name__)
CORS(app)

# 框架层大小兜底，与统一校验中的大小限制保持同一份配置
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE


@app.errorhandler(413)
def request_entity_too_large(_error):
    limit_mb = MAX_FILE_SIZE // 1024 // 1024
    return jsonify({'error': f'文件大小超过限制（最大{limit_mb}MB）'}), 413


@app.after_request
def add_no_store_header(response):
    # 接口数据（尤其目录回显）不走缓存，保证提交后立即查看拿到的是最新结果
    if response.headers.get('Content-Type', '').startswith('application/json'):
        response.headers['Cache-Control'] = 'no-store'
    return response


# 注册蓝图
app.register_blueprint(auth_bp)
app.register_blueprint(files_bp)

# 初始化数据库
init_db()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, debug=True)
