"""pytest 配置和 fixtures"""
import os
import sys
import tempfile
import pytest

# 添加 backend 目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 设置测试环境变量
os.environ['UPLOAD_FOLDER'] = tempfile.mkdtemp()
os.environ['DB_FILE'] = os.path.join(tempfile.mkdtemp(), 'test.db')

from app import app
from database import init_db, get_db


@pytest.fixture
def client():
    """创建测试客户端"""
    app.config['TESTING'] = True
    init_db()
    with app.test_client() as client:
        yield client


@pytest.fixture
def auth_token():
    """获取认证 token（使用独立客户端避免速率限制）"""
    # 清除速率限制
    from auth import rate_limit_store
    rate_limit_store.clear()
    
    app.config['TESTING'] = True
    init_db()
    with app.test_client() as test_client:
        response = test_client.post('/api/auth', json={
            'username': 'admin',
            'password': 'admin123'
        })
        return response.get_json()['token']


@pytest.fixture
def db_conn():
    """获取数据库连接"""
    conn = get_db()
    yield conn
    conn.close()
