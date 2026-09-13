"""认证模块测试"""
import time


def test_auth_success(client):
    """测试登录成功"""
    response = client.post('/api/auth', json={
        'username': 'admin',
        'password': 'admin123'
    })
    assert response.status_code == 200
    data = response.get_json()
    assert data['success'] is True
    assert 'token' in data


def test_auth_wrong_password(client):
    """测试密码错误"""
    response = client.post('/api/auth', json={
        'username': 'admin',
        'password': 'wrongpassword'
    })
    assert response.status_code == 401
    data = response.get_json()
    assert data['success'] is False


def test_auth_empty_fields(client):
    """测试空字段"""
    response = client.post('/api/auth', json={
        'username': '',
        'password': ''
    })
    assert response.status_code == 400


def test_auth_missing_data(client):
    """测试缺少数据"""
    response = client.post('/api/auth', json={})
    assert response.status_code == 400


def test_refresh_token(client, auth_token):
    """测试刷新 token"""
    response = client.post(f'/api/refresh-token?token={auth_token}')
    assert response.status_code == 200
    data = response.get_json()
    assert data['success'] is True


def test_refresh_invalid_token(client):
    """测试刷新无效 token"""
    response = client.post('/api/refresh-token?token=invalid-token')
    assert response.status_code == 401
