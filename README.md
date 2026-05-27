# DB Gateway MCP Server

企业级多数据库动态 MCP 网关，支持 MySQL、PostgreSQL、Oracle、SQL Server，无需重启即可动态切换数据库。

## 功能特性

- ✅ 支持 4 种数据库类型：MySQL、PostgreSQL、Oracle、SQL Server
- ✅ 动态切换数据库，无需重启 MCP 服务器
- ✅ 连接池复用 + LRU 缓存
- ✅ SQL 安全控制（生产环境只读）
- ✅ 完整的 SQL 审计日志
- ✅ Schema 信息获取（表、列、索引）
- ✅ SQL 执行计划分析
- ✅ 支持 OpenCode、Cursor、Claude Desktop

## 安装

```bash
npm install
```

## 构建

```bash
npm run build
```

## 配置

### 1. 数据源配置

复制示例配置文件并编辑：

```bash
cp config/datasource-center.yaml.example config/datasource-center.yaml
```

编辑 `config/datasource-center.yaml`：

```yaml
customers:
  acme:
    mysql:
      dev:
        host: localhost
        port: 3306
        database: acme_dev
        username: root
        password: root
      test:
        host: test-db.example.com
        port: 3306
        database: acme_test
        username: acme_test
        password: your_password
      prod:
        host: prod-db.example.com
        port: 3306
        database: acme_prod
        username: acme_prod
        password: your_password
    oracle:
      prod:
        host: oracle-db.example.com
        port: 1521
        database: ORCL
        username: system
        password: your_password
  beta:
    postgresql:
      dev:
        host: localhost
        port: 5432
        database: beta_dev
        username: postgres
        password: postgres
```

### 2. 安全配置

编辑 `config/security.yaml`：

```yaml
security:
  readOnlyEnvs:
    - prod
  maxQueryLimit: 100
  sqlTimeout: 30000
  dangerousPatterns:
    - 'DROP\s+'
    - 'TRUNCATE\s+'
    - 'ALTER\s+TABLE'
    - 'DELETE\s+FROM\s+\w+\s*(?!WHERE)'
    - 'UPDATE\s+\w+\s*(?!WHERE)'
  allowedCommands:
    - 'SELECT'
    - 'SHOW'
    - 'DESC'
    - 'EXPLAIN'
```

## MCP 配置

### OpenCode 配置

在 OpenCode 设置中添加：

```json
{
  "mcp": {
    "db-gateway": {
      "type": "local",
      "command": [
        "node",
        "/path/to/db-gateway-mcp/dist/index.js"
      ],
      "enabled": true
    }
  }
}
```

### Claude Desktop 配置

编辑 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "db-gateway": {
      "command": "node",
      "args": ["/path/to/db-gateway-mcp/dist/index.js"]
    }
  }
}
```

## 使用方法

### 1. 列出可用的客户

```
使用 list_available 工具
```

### 2. 切换数据库

```
使用 switch_database 工具
参数：
- customer: "acme"
- dbType: "mysql"
- env: "dev"
```

### 3. 执行查询

```
使用 query 工具
参数：
- sql: "SELECT * FROM users"
```

### 4. 获取 Schema

```
使用 get_schema 工具
```

### 5. 分析 SQL 执行计划

```
使用 explain_sql 工具
参数：
- sql: "SELECT * FROM users WHERE id = 1"
```

### 6. 查看审计日志

```
使用 get_audit_log 工具
```

## 可用工具

| 工具名 | 描述 |
|--------|------|
| `switch_database` | 切换数据库连接 |
| `query` | 执行 SQL 查询 |
| `get_schema` | 获取数据库 Schema |
| `explain_sql` | 获取 SQL 执行计划 |
| `current_database` | 查看当前数据库连接 |
| `list_available` | 列出可用的客户、数据库和环境 |
| `get_audit_log` | 获取审计日志 |

## 安全说明

- 生产环境（prod）默认只读
- 危险 SQL（DROP、TRUNCATE 等）会被拦截
- 所有查询都会记录到审计日志
- SELECT 查询自动添加 LIMIT（默认 100 条）

## 目录结构

```
db-gateway-mcp/
├── config/                      # 配置文件
│   ├── datasource-center.yaml   # 数据源配置
│   ├── security.yaml            # 安全配置
│   └── datasource-center.yaml.example
├── src/
│   ├── datasource/              # 数据源管理
│   │   ├── connections.ts       # 数据库连接
│   │   └── registry.ts          # 注册中心
│   ├── security/                # 安全控制
│   │   └── security.ts
│   ├── audit/                   # 审计日志
│   │   └── audit.ts
│   ├── types/                   # 类型定义
│   │   └── index.ts
│   ├── logger.ts                # 日志
│   └── index.ts                 # 入口
├── dist/                        # 编译输出
├── package.json
└── tsconfig.json
```

## 故障排查

### 查看日志

```bash
tail -f error.log
tail -f combined.log
```

### 审计数据库

审计日志存储在 `audit.db`（SQLite 数据库）中，可以使用任何 SQLite 客户端查看。

## 许可证

MIT
