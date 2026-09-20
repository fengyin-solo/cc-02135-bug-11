"""上传/目录回显链路的回归测试"""
import io
import os

from config import UPLOAD_FOLDER
from database import get_db


def test_upload_extensionless_file_allowed(client):
    """无扩展名的合法文件不应再被误拦"""
    data = {'file': (io.BytesIO(b'plain content'), 'README')}
    response = client.post('/api/upload', data=data, content_type='multipart/form-data')
    assert response.status_code == 200
    assert response.get_json()['success'] is True


def test_upload_multipart_extension_attack_blocked(client):
    """多重扩展名/大小写/末尾点绕过都必须被服务端拒绝"""
    for filename in ('evil.php.jpg', 'evil.EXE', 'evil.sh.', 'evil.Ps1 '):
        data = {'file': (io.BytesIO(b'x'), filename)}
        response = client.post('/api/upload', data=data, content_type='multipart/form-data')
        assert response.status_code == 400, f'{filename} 应当被拒绝'
        assert response.get_json()['error']


def test_duplicate_upload_deduplicated(client):
    """同一文件重复上传：目录中只出现一次，第二次返回 duplicate 标记"""
    payload = {'file': (io.BytesIO(b'dedup content'), 'dup.txt')}
    r1 = client.post('/api/upload', data=payload, content_type='multipart/form-data')
    assert r1.status_code == 200
    first = r1.get_json()
    assert first['duplicate'] is False

    payload = {'file': (io.BytesIO(b'dedup content'), 'dup.txt')}
    r2 = client.post('/api/upload', data=payload, content_type='multipart/form-data')
    assert r2.status_code == 200
    second = r2.get_json()
    assert second['duplicate'] is True
    assert second['file_id'] == first['file_id']

    listing = client.get('/api/files').get_json()
    matches = [f for f in listing if f['name'] == 'dup.txt']
    assert len(matches) == 1


def test_same_content_different_name_allowed(client):
    """内容相同但文件名不同，仍是两个文件"""
    for name in ('a.txt', 'b.txt'):
        data = {'file': (io.BytesIO(b'same bytes'), name)}
        resp = client.post('/api/upload', data=data, content_type='multipart/form-data')
        assert resp.status_code == 200

    listing = client.get('/api/files').get_json()
    assert {f['name'] for f in listing} >= {'a.txt', 'b.txt'}


def test_list_files_stale_size_corrected(client):
    """目录回显以磁盘真实大小为准：记录里的旧大小必须被纠正"""
    data = {'file': (io.BytesIO(b'original'), 'stale.txt')}
    upload = client.post('/api/upload', data=data, content_type='multipart/form-data')
    file_id = upload.get_json()['file_id']

    # 直接篡改 DB 中的大小，模拟“重复显示旧大小”
    conn = get_db()
    conn.execute('UPDATE files SET size = ? WHERE id = ?', (1, file_id))
    conn.commit()
    conn.close()

    listing = client.get('/api/files').get_json()
    entry = next(f for f in listing if f['id'] == file_id)
    assert entry['size'] == len(b'original')


def test_list_files_missing_disk_file_removed(client):
    """磁盘文件已丢失时，目录回显必须收口剔除而不是继续展示"""
    data = {'file': (io.BytesIO(b'will be gone'), 'ghost.txt')}
    upload = client.post('/api/upload', data=data, content_type='multipart/form-data')
    file_id = upload.get_json()['file_id']

    conn = get_db()
    row = conn.execute('SELECT path FROM files WHERE id = ?', (file_id,)).fetchone()
    conn.close()
    os.remove(row['path'])

    listing = client.get('/api/files').get_json()
    assert all(f['id'] != file_id for f in listing)


def test_list_files_no_store_header(client):
    response = client.get('/api/files')
    assert response.status_code == 200
    assert response.headers['Cache-Control'] == 'no-store'


def test_oversize_upload_rejected_json(client):
    """超过大小限制返回统一 JSON 错误（框架层 413 也必须是 JSON）"""
    from config import MAX_FILE_SIZE
    oversized = b'x' * (MAX_FILE_SIZE + 1024)
    data = {'file': (io.BytesIO(oversized), 'huge.bin')}
    response = client.post('/api/upload', data=data, content_type='multipart/form-data')
    assert response.status_code in (400, 413)
    body = response.get_json()
    assert 'error' in body
    assert '大小超过限制' in body['error']

    # 被拒绝的文件不能残留在目录中
    listing = client.get('/api/files').get_json()
    assert all(f['name'] != 'huge.bin' for f in listing)


def test_allowed_file_helper_matches_validator():
    from routes.file_routes import allowed_file
    assert allowed_file('README') is True
    assert allowed_file('evil.php.jpg') is False
    assert allowed_file('photo.png') is True
