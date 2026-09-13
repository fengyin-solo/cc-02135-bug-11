# Requirements Document

## Introduction

本文档定义了后端代码模块化重构的需求。当前 `app.py` 文件包含所有功能模块（配置管理、数据库操作、用户认证、文件管理、速率限制、路由定义），需要按功能拆分到独立文件中，以提高代码可维护性和可读性，同时保持现有功能完全不变。

## Glossary

- **Config_Module**: 配置管理模块，负责环境变量读取和常量定义
- **Database_Module**: 数据库操作模块，负责 SQLite 连接、初始化和 CRUD 操作
- **Auth_Module**: 用户认证模块，负责登录验证、token 生成/验证/刷新
- **File_Module**: 文件管理模块，负责文件上传、下载、列表功能
- **Rate_Limiter**: 速率限制模块，负责请求频率控制
- **Routes_Module**: 路由定义模块，负责 API 端点定义
- **App_Entry**: 应用入口文件，负责初始化 Flask 应用并注册路由

## Requirements

### Requirement 1: 配置管理模块拆分

**User Story:** As a 开发者, I want 将配置管理代码拆分到独立模块, so that 配置项集中管理且易于修改。

#### Acceptance Criteria

1. THE Config_Module SHALL 包含所有环境变量读取逻辑（PORT、UPLOAD_FOLDER、DB_FILE、TOKEN_EXPIRE_SECONDS、RATE_LIMIT_REQUESTS、RATE_LIMIT_WINDOW、MAX_FILE_SIZE）
2. THE Config_Module SHALL 包含 ALLOWED_EXTENSIONS 常量定义
3. THE Config_Module SHALL 确保目录创建逻辑（UPLOAD_FOLDER 和 DB_FILE 目录）
4. WHEN 其他模块导入 Config_Module THEN 所有配置项 SHALL 可被正确访问

### Requirement 2: 数据库操作模块拆分

**User Story:** As a 开发者, I want 将数据库操作代码拆分到独立模块, so that 数据库相关逻辑集中管理。

#### Acceptance Criteria

1. THE Database_Module SHALL 包含 get_db() 函数用于获取数据库连接
2. THE Database_Module SHALL 包含 init_db() 函数用于初始化数据库表（users、files、tokens）
3. THE Database_Module SHALL 包含默认用户初始化逻辑
4. WHEN 应用启动时 THEN Database_Module SHALL 自动完成数据库初始化
5. WHEN 其他模块调用 get_db() THEN Database_Module SHALL 返回有效的数据库连接

### Requirement 3: 用户认证模块拆分

**User Story:** As a 开发者, I want 将用户认证代码拆分到独立模块, so that 认证逻辑独立且可复用。

#### Acceptance Criteria

1. THE Auth_Module SHALL 包含 generate_token(username) 函数用于生成并存储 token
2. THE Auth_Module SHALL 包含 verify_token(token) 函数用于验证 token 有效性
3. THE Auth_Module SHALL 包含 refresh_token(token) 函数用于刷新 token 过期时间
4. WHEN token 过期 THEN verify_token() SHALL 返回 False 并删除过期 token
5. WHEN token 有效 THEN refresh_token() SHALL 更新过期时间并返回 True

### Requirement 4: 文件管理模块拆分

**User Story:** As a 开发者, I want 将文件管理代码拆分到独立模块, so that 文件操作逻辑独立管理。

#### Acceptance Criteria

1. THE File_Module SHALL 包含 allowed_file(filename) 函数用于检查文件扩展名
2. THE File_Module SHALL 包含文件上传处理逻辑
3. THE File_Module SHALL 包含文件下载处理逻辑
4. THE File_Module SHALL 包含文件列表查询逻辑
5. WHEN 上传不允许的文件类型 THEN File_Module SHALL 拒绝上传并返回错误
6. WHEN 文件大小超过限制 THEN File_Module SHALL 拒绝上传并返回错误

### Requirement 5: 速率限制模块拆分

**User Story:** As a 开发者, I want 将速率限制代码拆分到独立模块, so that 限流逻辑可复用于多个端点。

#### Acceptance Criteria

1. THE Rate_Limiter SHALL 包含 check_rate_limit(identifier) 函数用于检查请求频率
2. THE Rate_Limiter SHALL 包含 rate_limit 装饰器用于保护 API 端点
3. THE Rate_Limiter SHALL 维护 rate_limit_store 用于存储请求记录
4. WHEN 请求频率超过限制 THEN rate_limit 装饰器 SHALL 返回 429 状态码
5. WHEN 时间窗口过期 THEN Rate_Limiter SHALL 清理过期的请求记录

### Requirement 6: 路由模块拆分

**User Story:** As a 开发者, I want 将路由定义拆分到独立模块, so that API 端点定义清晰且易于扩展。

#### Acceptance Criteria

1. THE Routes_Module SHALL 包含 /api/upload 端点定义
2. THE Routes_Module SHALL 包含 /api/files 端点定义
3. THE Routes_Module SHALL 包含 /api/auth 端点定义
4. THE Routes_Module SHALL 包含 /api/refresh-token 端点定义
5. THE Routes_Module SHALL 包含 /api/download/<file_id> 端点定义
6. WHEN 路由注册到 Flask 应用 THEN 所有端点 SHALL 保持原有功能不变

### Requirement 7: 应用入口重构

**User Story:** As a 开发者, I want 重构应用入口文件, so that 入口文件简洁且职责单一。

#### Acceptance Criteria

1. THE App_Entry SHALL 创建 Flask 应用实例
2. THE App_Entry SHALL 配置 CORS
3. THE App_Entry SHALL 注册所有路由
4. THE App_Entry SHALL 触发数据库初始化
5. WHEN 应用启动 THEN App_Entry SHALL 在配置的端口上运行服务

### Requirement 8: 功能完整性保证

**User Story:** As a 开发者, I want 确保重构后所有功能保持不变, so that 重构不会引入回归问题。

#### Acceptance Criteria

1. WHEN 用户调用 /api/auth 进行登录 THEN 系统 SHALL 返回与重构前相同的响应格式
2. WHEN 用户调用 /api/upload 上传文件 THEN 系统 SHALL 返回与重构前相同的响应格式
3. WHEN 用户调用 /api/files 获取文件列表 THEN 系统 SHALL 返回与重构前相同的响应格式
4. WHEN 用户调用 /api/download/<file_id> 下载文件 THEN 系统 SHALL 返回与重构前相同的行为
5. WHEN 用户调用 /api/refresh-token 刷新 token THEN 系统 SHALL 返回与重构前相同的响应格式
6. WHEN 请求频率超过限制 THEN 系统 SHALL 返回 429 状态码与重构前一致
