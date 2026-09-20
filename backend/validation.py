"""文件校验：浏览器校验、服务端校验与目录回显共用同一份判定结果。

判定规则（与前端 CONFIG.BLOCKED_EXTENSIONS 保持一致，单一事实来源）：
- 采用扩展名黑名单，命中任意一个扩展名段即拒绝；
- 无扩展名的合法文件允许上传（黑名单模式不应拦截无扩展名文件）；
- 对文件名做大小写归一、去除末尾点/空格，防止 evil.PHP、evil.php. 等绕过；
- 检查所有扩展名段，防止 evil.php.jpg、evil.sh.txt 等多重扩展绕过。
"""
import os

from config import BLOCKED_EXTENSIONS, MAX_FILE_SIZE


def normalize_filename(filename):
    """归一化文件名：去掉路径分隔符、控制字符与末尾的点/空格。

    返回 (safe_name, ext_segments)：
    - safe_name 用于落盘与展示；
    - ext_segments 为按点拆分后的全部扩展名段（已小写）。
    """
    if not filename:
        return '', []

    # NUL 字节在任何合法文件名中都不应出现，且会让 os.path 抛 ValueError
    name = filename.replace('\x00', '')
    # 去掉客户端可能携带的路径分隔符
    name = name.replace('/', '_').replace('\\', '_')
    # Windows 资源管理器会吞掉结尾的点和空格，服务端必须做同样的归一
    name = name.strip().rstrip('. ')

    segments = [seg.lower() for seg in name.split('.')[1:]] if '.' in name else []
    return name, segments


def validate_file(filename, size):
    """统一校验入口，返回 (ok, error, normalized_name)。

    ok=False 时 error 为可直接展示给用户的中文原因；
    ok=True 时 normalized_name 为归一化后的文件名。
    """
    if not filename or not str(filename).strip():
        return False, '未选择文件', None

    safe_name, ext_segments = normalize_filename(filename)
    if not safe_name:
        return False, '文件名不合法', None

    blocked = next((ext for ext in ext_segments if ext in BLOCKED_EXTENSIONS), None)
    if blocked is not None:
        return False, f'不支持的文件类型（.{blocked} 文件被禁止上传）', safe_name

    if size is not None and size > MAX_FILE_SIZE:
        limit_mb = MAX_FILE_SIZE // 1024 // 1024
        return False, f'文件大小超过限制（最大{limit_mb}MB）', safe_name

    return True, None, safe_name
