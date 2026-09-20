"""统一校验模块测试：浏览器校验、服务端校验与目录回显共用同一判定结果"""
import pytest

from validation import validate_file, normalize_filename


@pytest.mark.parametrize('filename,expected_ok', [
    # 合法文件：常规扩展名
    ('report.pdf', True),
    ('photo.PNG', True),
    ('archive.zip', True),
    # 合法文件：无扩展名不再被误拦
    ('README', True),
    ('Makefile', True),
    ('data.2026', True),
    # 黑名单扩展名：大小写、多段、末尾点/空格绕过都应命中
    ('evil.exe', False),
    ('evil.EXE', False),
    ('evil.php', False),
    ('evil.sh', False),
    ('evil.php.', False),
    ('evil.php ', False),
    ('evil.php.jpg', False),
    ('evil.sh.txt', False),
    ('evil.Ps1', False),
])
def test_validate_file_extension_rules(filename, expected_ok):
    ok, error, normalized = validate_file(filename, 1024)
    assert ok is expected_ok, f'{filename}: {error}'


def test_validate_file_size_limit():
    from config import MAX_FILE_SIZE
    ok, error, _ = validate_file('big.txt', MAX_FILE_SIZE)
    assert ok is True

    ok, error, _ = validate_file('big.txt', MAX_FILE_SIZE + 1)
    assert ok is False
    assert '大小超过限制' in error


def test_normalize_filename_strips_trailing_dots_and_spaces():
    assert normalize_filename('evil.php.')[0] == 'evil.php'
    assert normalize_filename('evil.PHP ')[0] == 'evil.PHP'
    assert normalize_filename('a/b\\c.txt')[0] == 'a_b_c.txt'
    assert normalize_filename('\x00evil.exe')[0] == 'evil.exe'


def test_validate_empty_filename():
    ok, error, _ = validate_file('', 1)
    assert ok is False
    ok, error, _ = validate_file('   ', 1)
    assert ok is False
