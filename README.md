# DB Gateway MCP Server

企业级多数据库动态 MCP 网关，支持 MySQL、PostgreSQL、Oracle、SQL Server，无需重启即可动态切换数据库。

## 🎯 功能特性

- ✅ **多数据库支持**：MySQL、PostgreSQL、Oracle、SQL Server
- ✅ **动态切换**：无需重启 MCP 服务器即可切换数据库
- ✅ **配置热加载**：修改配置文件后自动生效，无需手动重启
- ✅ **连接池复用**：基于 HikariCP 理念的连接池管理
- ✅ **LRU 缓存**：自动管理数据源缓存，超时自动释放
- ✅ **SQL 安全控制**：生产环境只读，危险 SQL 拦截
- ✅ **完整审计日志**：所有 SQL 操作记录到 SQLite 数据库
- ✅ **Schema 分析**：获取表、列、索引信息
- ✅ **执行计划分析**：支持 EXPLAIN SQL 优化
- ✅ **多 IDE 支持**：OpenCode、Cursor、Claude Desktop

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置数据库

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
        password: your_password
```

### 3. 构建项目

```bash
npm run build
```

### 4. 测试 MCP 服务器

```bash
npm run dev
```

### 5. 在 IDE 中配置 MCP

参考下方「MCP 配置」章节进行配置。

## 📖 详细使用说明

### 1. 列出可用客户

```bash
使用 list_available 工具
返回：{"customers": ["acme"]}
```

### 2. 切换数据库

```bash
使用 switch_database 工具
参数：
- customer: "acme"
- dbType: "mysql"
- env: "dev"
返回：Successfully switched to: acme / mysql / dev
```

### 3. 查看当前数据库

```bash
使用 current_database 工具
返回：{"customer": "acme", "dbType": "mysql", "env": "dev"}
```

### 4. 执行查询

```bash
使用 query 工具
参数：
- sql: "SELECT * FROM users LIMIT 10"
```

### 5. 获取 Schema

```bash
使用 get_schema 工具
返回：完整的表、列、索引信息
```

### 6. 分析 SQL 执行计划

```bash
使用 explain_sql 工具
参数：
- sql: "SELECT * FROM users WHERE id = 1"
返回：SQL 执行计划
```

### 7. 查看审计日志

```bash
使用 get_audit_log 工具
参数：
- limit: 100（可选）
返回：最近的 SQL 查询记录
```

### 8. 重新加载配置

```bash
使用 reload_config 工具
说明：手动重新加载配置文件（配置文件修改后也会自动重新加载）
```

## 🔥 配置热加载

本系统支持**配置文件热加载**，您无需重启 MCP 服务器即可添加新的数据库配置。

### 工作原理

1. **自动检测**：系统使用文件系统监视器（fs.watch）实时监控配置文件变化
2. **自动重载**：当 `config/datasource-center.yaml` 被修改时，系统会自动重新加载配置
3. **立即生效**：新配置立即可用，无需任何重启操作

### 使用方式

**方式一：自动热加载（推荐）**
- 直接修改 `config/datasource-center.yaml` 文件
- 系统会在文件保存后自动检测并重新加载

**方式二：手动重新加载**
```bash
使用 reload_config 工具
返回：Configuration reloaded successfully. Added: [beta], Removed: []
```

### 示例

1. 在 MCP 服务器运行中，打开 `config/datasource-center.yaml`
2. 添加新的客户配置：
```yaml
beta:
  mysql:
    prod:
      host: beta.example.com
      port: 3306
      database: beta_prod
      username: beta_user
      password: beta_password
```
3. 保存文件（系统会自动检测并重新加载）
4. 使用 `list_available` 查看新添加的客户：`{"customers": ["acme", "beta"]}`
5. 使用 `switch_database` 切换到新配置：`beta / mysql / prod`

## 🛠️ MCP 配置

### OpenCode 配置

在 OpenCode 设置文件中添加：

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

## 🔧 完整配置示例

### 数据源配置（config/datasource-center.yaml）

```yaml
customers:
  acme:
    mysql:
      dev:
        host: localhost
        port: 3306
        database: acme_dev
        username: root
        password: dev_password
      test:
        host: test-db.example.com
        port: 3306
        database: acme_test
        username: acme_test
        password: test_password
      prod:
        host: prod-db.example.com
        port: 3306
        database: acme_prod
        username: acme_prod
        password: prod_password
    oracle:
      prod:
        host: oracle.example.com
        port: 1521
        database: ORCL
        username: system
        password: oracle_password
    postgresql:
      dev:
        host: localhost
        port: 5432
        database: acme_pg_dev
        username: postgres
        password: pg_password
    sqlserver:
      test:
        host: mssql.example.com
        port: 1433
        database: acme_test
        username: sa
        password: mssql_password

  beta:
    mysql:
      prod:
        host: beta-mysql.example.com
        port: 3306
        database: beta_prod
        username: beta_user
        password: beta_password
```

### 安全配置（config/security.yaml）

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
    - 'ALTER\s+DATABASE'
    - 'CREATE\s+TABLE'
    - 'DELETE\s+FROM\s+\w+\s*(?!WHERE)'
    - 'UPDATE\s+\w+\s*(?!WHERE)'
  allowedCommands:
    - 'SELECT'
    - 'SHOW'
    - 'DESC'
    - 'EXPLAIN'
```

## 🛡️ 安全机制

### 环境权限控制

| 环境 | 权限 | 说明 |
|------|------|------|
| `dev` | 读写 | 开发环境，可执行所有操作 |
| `test` | 读写 | 测试环境，可执行所有操作 |
| `prod` | 只读 | 生产环境，仅允许查询操作 |

### SQL 安全规则

- 🚫 拦截危险 SQL：DROP、TRUNCATE、ALTER 等
- 🚫 拦截无 WHERE 条件的 DELETE/UPDATE
- ✅ 自动添加 LIMIT（默认 100 条）
- ✅ 所有查询记录到审计日志

## 📊 可用工具

| 工具名 | 描述 | 参数 |
|--------|------|------|
| `switch_database` | 切换数据库连接 | customer, dbType, env |
| `reload_config` | 重新加载配置文件 | 无 |
| `query` | 执行 SQL 查询 | sql |
| `get_schema` | 获取数据库 Schema | 无 |
| `explain_sql` | 获取执行计划 | sql |
| `current_database` | 查看当前连接 | 无 |
| `list_available` | 列出可用资源 | customer（可选）, dbType（可选） |
| `get_audit_log` | 查看审计日志 | customer, dbType, env, limit |

## 📁 项目结构

```
db-gateway-mcp/
├── config/
│   ├── datasource-center.yaml         # 数据源配置
│   ├── datasource-center.yaml.example # 配置模板
│   └── security.yaml                 # 安全配置
├── src/
│   ├── datasource/
│   │   ├── connections.ts           # 数据库连接实现
│   │   └── registry.ts              # 数据源注册中心（支持热加载）
│   ├── security/
│   │   └── security.ts              # SQL 安全控制
│   ├── audit/
│   │   └── audit.ts                 # SQL 审计日志
│   ├── types/
│   │   ├── index.ts                 # TypeScript 类型定义
│   │   └── oracledb.d.ts           # Oracle 类型声明
│   ├── logger.ts                     # Winston 日志
│   └── index.ts                      # MCP 服务器入口
├── dist/                              # 编译输出
├── package.json
├── tsconfig.json
├── .gitignore
└── README.md
```

## 🔍 故障排查

### 查看日志文件

```bash
# 错误日志
tail -f error.log

# 所有日志
tail -f combined.log

# JSON 格式日志
cat combined.log | jq
```

### 检查审计数据库

```bash
# 使用 sqlite3
sqlite3 audit.db "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 10;"

# 查看表结构
sqlite3 audit.db ".schema audit_log"
```

### 常见问题

**Q: 连接数据库失败？**
- 检查 `config/datasource-center.yaml` 配置是否正确
- 确认数据库服务是否运行
- 检查防火墙和网络连接

**Q: TypeScript 编译错误？**
- 确保已运行 `npm install`
- 检查 Node.js 版本（推荐 18+）

**Q: MCP 服务器无法启动？**
- 检查配置文件是否存在
- 确认端口是否被占用

**Q: 添加新数据库需要重启吗？**
- 不需要！系统支持配置文件热加载
- 直接修改配置文件，系统会自动检测并重新加载
- 或者使用 `reload_config` 工具手动重新加载

## 📈 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| MCP 启动时间 | < 5s | 冷启动时间 |
| 数据库切换 | < 2s | 包含连接建立 |
| SQL 查询响应 | < 1s | 普通查询 |
| 最大并发连接 | 100+ | 总连接数 |
| 数据源缓存 | LRU | 自动管理 |
| 缓存 TTL | 30 分钟 | 自动过期 |
| 配置热加载 | < 100ms | 文件变化到配置生效 |

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🔗 相关资源

- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [HikariCP](https://github.com/brettwooldridge/HikariCP)
- [MySQL2](https://github.com/sidorares/node-mysql2)
- [PostgreSQL Client](https://github.com/brianc/node-postgres)
- [MSSQL Client](https://github.com/tediousjs/node-mssql)
- [Oracle DB](https://github.com/oracle/node-oracledb)
