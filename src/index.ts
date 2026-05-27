#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { DatasourceRegistry } from './datasource/registry';
import { SecurityManager } from './security/security';
import { AuditLogger } from './audit/audit';
import { logger } from './logger';
import path from 'path';

const CONFIG_PATH = process.env.DATASOURCE_CONFIG || './config/datasource-center.yaml';
const SECURITY_CONFIG_PATH = process.env.SECURITY_CONFIG || './config/security.yaml';
const AUDIT_DB_PATH = process.env.AUDIT_DB || './audit.db';

const server = new Server(
  {
    name: 'db-gateway-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

let registry: DatasourceRegistry;
let security: SecurityManager;
let auditLogger: AuditLogger;

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'switch_database',
        description: 'Switch to a different database connection',
        inputSchema: {
          type: 'object',
          properties: {
            customer: {
              type: 'string',
              description: 'Customer name',
            },
            dbType: {
              type: 'string',
              enum: ['mysql', 'postgresql', 'oracle', 'sqlserver'],
              description: 'Database type',
            },
            env: {
              type: 'string',
              enum: ['dev', 'test', 'prod'],
              description: 'Environment',
            },
          },
          required: ['customer', 'dbType', 'env'],
        },
      },
      {
        name: 'query',
        description: 'Execute a SQL query (read-only in production)',
        inputSchema: {
          type: 'object',
          properties: {
            sql: {
              type: 'string',
              description: 'SQL query to execute',
            },
          },
          required: ['sql'],
        },
      },
      {
        name: 'get_schema',
        description: 'Get database schema information (tables, columns, indexes)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'explain_sql',
        description: 'Get execution plan for a SQL query',
        inputSchema: {
          type: 'object',
          properties: {
            sql: {
              type: 'string',
              description: 'SQL query to explain',
            },
          },
          required: ['sql'],
        },
      },
      {
        name: 'current_database',
        description: 'Get current database connection information',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'list_available',
        description: 'List available customers, databases, and environments',
        inputSchema: {
          type: 'object',
          properties: {
            customer: {
              type: 'string',
              description: 'Optional: Filter by customer to see their databases',
            },
            dbType: {
              type: 'string',
              description: 'Optional: Filter by database type to see environments',
            },
          },
        },
      },
      {
        name: 'get_audit_log',
        description: 'Get audit log of SQL queries',
        inputSchema: {
          type: 'object',
          properties: {
            customer: {
              type: 'string',
              description: 'Optional: Filter by customer',
            },
            dbType: {
              type: 'string',
              description: 'Optional: Filter by database type',
            },
            env: {
              type: 'string',
              description: 'Optional: Filter by environment',
            },
            limit: {
              type: 'number',
              description: 'Optional: Number of records to return (default 100)',
            },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const startTime = Date.now();

  try {
    switch (name) {
      case 'switch_database': {
        const { customer, dbType, env } = args as any;
        const context = await registry.switchDatabase(customer, dbType, env);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully switched to: ${customer} / ${dbType} / ${env}`,
            },
          ],
        };
      }

      case 'query': {
        const context = registry.getCurrentContext();
        if (!context) {
          throw new Error('No database selected. Use switch_database first.');
        }

        const { sql } = args as any;
        const validation = security.validateSql(sql, context.env);
        
        if (!validation.valid) {
          throw new Error(validation.message);
        }

        const safeSql = security.addLimitIfNeeded(sql);
        const client = registry.getCurrentClient();
        const result = await client.query(safeSql);

        auditLogger.log({
          timestamp: new Date().toISOString(),
          customer: context.customer,
          dbType: context.dbType,
          env: context.env,
          sql: safeSql,
          duration: result.duration,
          success: true,
        });

        const tableData = formatTableResult(result);
        return {
          content: [
            {
              type: 'text',
              text: `Query executed in ${result.duration}ms\n\n${tableData}`,
            },
          ],
        };
      }

      case 'get_schema': {
        const context = registry.getCurrentContext();
        if (!context) {
          throw new Error('No database selected. Use switch_database first.');
        }

        const client = registry.getCurrentClient();
        const schema = await client.getSchema();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(schema, null, 2),
            },
          ],
        };
      }

      case 'explain_sql': {
        const context = registry.getCurrentContext();
        if (!context) {
          throw new Error('No database selected. Use switch_database first.');
        }

        const { sql } = args as any;
        const validation = security.validateSql(sql, context.env);
        
        if (!validation.valid) {
          throw new Error(validation.message);
        }

        const client = registry.getCurrentClient();
        let explainSql: string;
        
        switch (context.dbType) {
          case 'mysql':
            explainSql = `EXPLAIN ${sql}`;
            break;
          case 'postgresql':
            explainSql = `EXPLAIN ANALYZE ${sql}`;
            break;
          case 'oracle':
            explainSql = `EXPLAIN PLAN FOR ${sql}`;
            break;
          case 'sqlserver':
            explainSql = `SET SHOWPLAN_XML ON; ${sql}`;
            break;
          default:
            explainSql = `EXPLAIN ${sql}`;
        }

        const result = await client.query(explainSql);
        const tableData = formatTableResult(result);

        return {
          content: [
            {
              type: 'text',
              text: `Execution plan:\n\n${tableData}`,
            },
          ],
        };
      }

      case 'current_database': {
        const context = registry.getCurrentContext();
        if (!context) {
          return {
            content: [
              {
                type: 'text',
                text: 'No database currently selected. Use switch_database to connect.',
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(context, null, 2),
            },
          ],
        };
      }

      case 'list_available': {
        const { customer, dbType } = args as any;
        let result: any = {};

        if (!customer) {
          result.customers = registry.getAvailableCustomers();
        } else if (!dbType) {
          result.databases = registry.getAvailableDatabases(customer);
        } else {
          result.environments = registry.getAvailableEnvironments(customer, dbType);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_audit_log': {
        const { customer, dbType, env, limit } = args as any;
        const logs = auditLogger.query({ customer, dbType, env, limit });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(logs, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const context = registry?.getCurrentContext();
    const sql = (args as any)?.sql;
    
    if (context && sql) {
      auditLogger.log({
        timestamp: new Date().toISOString(),
        customer: context.customer,
        dbType: context.dbType,
        env: context.env,
        sql,
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.error('Tool execution error:', error);
    throw error;
  }
});

function formatTableResult(result: any): string {
  if (result.rows.length === 0) {
    return 'No results found.';
  }

  const columns = result.columns;
  const colWidths = columns.map((col: string) => col.length);

  result.rows.forEach((row: any[]) => {
    row.forEach((cell: any, i: number) => {
      const cellStr = String(cell);
      if (cellStr.length > colWidths[i]) {
        colWidths[i] = cellStr.length;
      }
    });
  });

  let output = '';

  output += columns.map((col: string, i: number) => 
    col.padEnd(colWidths[i])
  ).join(' | ') + '\n';

  output += colWidths.map((w: number) => '-'.repeat(w)).join('-|-') + '\n';

  result.rows.forEach((row: any[]) => {
    output += row.map((cell: any, i: number) => 
      String(cell).padEnd(colWidths[i])
    ).join(' | ') + '\n';
  });

  output += `\nTotal: ${result.rowCount} row(s)`;

  return output;
}

async function main() {
  logger.info('Starting DB Gateway MCP server...');

  try {
    registry = new DatasourceRegistry(CONFIG_PATH);
    security = new SecurityManager(SECURITY_CONFIG_PATH);
    auditLogger = new AuditLogger(AUDIT_DB_PATH);

    logger.info('Registry initialized successfully');

    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('DB Gateway MCP server running on stdio');
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
