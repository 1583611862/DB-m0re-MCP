import mysql from 'mysql2/promise';
import pg from 'pg';
import oracledb from 'oracledb';
import sql from 'mssql';
import { DatabaseConfig, QueryResult, SchemaInfo } from '../types';

export interface DatabaseClient {
  query(sql: string, params?: any[]): Promise<QueryResult>;
  getSchema(): Promise<SchemaInfo>;
  close(): Promise<void>;
}

class MySQLClient implements DatabaseClient {
  private pool: mysql.Pool;

  constructor(config: DatabaseConfig) {
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      connectionLimit: 10,
      waitForConnections: true,
    });
  }

  async query(sql: string, params?: any[]): Promise<QueryResult> {
    const start = Date.now();
    const [rows, fields] = await this.pool.execute(sql, params);
    const duration = Date.now() - start;
    const columns = fields?.map(f => f.name) || [];
    const dataRows = Array.isArray(rows) ? rows : [];
    return {
      columns,
      rows: dataRows.map(row => Object.values(row)),
      rowCount: dataRows.length,
      duration,
    };
  }

  async getSchema(): Promise<SchemaInfo> {
    const tablesResult = await this.query(`
      SELECT TABLE_NAME as name, TABLE_TYPE as type
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
    `);
    
    const tables = tablesResult.rows.map(row => ({
      name: row[0] as string,
      type: row[1] as string,
    }));

    const columns: Record<string, any[]> = {};
    const indexes: Record<string, any[]> = {};

    for (const table of tables) {
      const colsResult = await this.query(`
        SELECT 
          COLUMN_NAME as name,
          DATA_TYPE as type,
          IS_NULLABLE = 'YES' as nullable,
          COLUMN_DEFAULT as defaultValue,
          COLUMN_KEY = 'PRI' as isPrimaryKey
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      `, [table.name]);
      
      columns[table.name] = colsResult.rows.map(row => ({
        name: row[0],
        type: row[1],
        nullable: !!row[2],
        defaultValue: row[3],
        isPrimaryKey: !!row[4],
      }));

      const idxResult = await this.query(`
        SELECT 
          INDEX_NAME as name,
          COLUMN_NAME as columnName,
          NON_UNIQUE = 0 as isUnique,
          INDEX_NAME = 'PRIMARY' as isPrimary
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        ORDER BY INDEX_NAME, SEQ_IN_INDEX
      `, [table.name]);

      const indexMap = new Map<string, any>();
      idxResult.rows.forEach(row => {
        const idxName = row[0] as string;
        if (!indexMap.has(idxName)) {
          indexMap.set(idxName, {
            name: idxName,
            columns: [],
            isUnique: !!row[2],
            isPrimary: !!row[3],
          });
        }
        indexMap.get(idxName)!.columns.push(row[1]);
      });
      indexes[table.name] = Array.from(indexMap.values());
    }

    return { tables, columns, indexes };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class PostgreSQLClient implements DatabaseClient {
  private pool: pg.Pool;

  constructor(config: DatabaseConfig) {
    this.pool = new pg.Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      max: 10,
    });
  }

  async query(sql: string, params?: any[]): Promise<QueryResult> {
    const start = Date.now();
    const result = await this.pool.query(sql, params);
    const duration = Date.now() - start;
    return {
      columns: result.fields.map(f => f.name),
      rows: result.rows.map(row => Object.values(row)),
      rowCount: result.rowCount || 0,
      duration,
    };
  }

  async getSchema(): Promise<SchemaInfo> {
    const tablesResult = await this.query(`
      SELECT tablename as name, 'BASE TABLE' as type
      FROM pg_tables
      WHERE schemaname = 'public'
    `);
    
    const tables = tablesResult.rows.map(row => ({
      name: row[0] as string,
      type: 'BASE TABLE',
      schema: 'public',
    }));

    const columns: Record<string, any[]> = {};
    const indexes: Record<string, any[]> = {};

    for (const table of tables) {
      const colsResult = await this.query(`
        SELECT 
          column_name as name,
          data_type as type,
          is_nullable = 'YES' as nullable,
          column_default as defaultValue,
          EXISTS (
            SELECT 1 FROM information_schema.key_column_usage kcu
            JOIN information_schema.table_constraints tc 
              ON kcu.constraint_name = tc.constraint_name
            WHERE kcu.table_name = $1 AND kcu.column_name = a.column_name 
              AND tc.constraint_type = 'PRIMARY KEY'
          ) as isPrimaryKey
        FROM information_schema.columns a
        WHERE table_name = $1 AND table_schema = 'public'
      `, [table.name]);
      
      columns[table.name] = colsResult.rows.map(row => ({
        name: row[0],
        type: row[1],
        nullable: !!row[2],
        defaultValue: row[3],
        isPrimaryKey: !!row[4],
      }));

      const idxResult = await this.query(`
        SELECT
          i.relname as name,
          a.attname as columnName,
          ix.indisunique as isUnique,
          ix.indisprimary as isPrimary
        FROM pg_index ix
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        WHERE t.relname = $1
        ORDER BY i.relname, array_position(ix.indkey, a.attnum)
      `, [table.name]);

      const indexMap = new Map<string, any>();
      idxResult.rows.forEach(row => {
        const idxName = row[0] as string;
        if (!indexMap.has(idxName)) {
          indexMap.set(idxName, {
            name: idxName,
            columns: [],
            isUnique: !!row[2],
            isPrimary: !!row[3],
          });
        }
        indexMap.get(idxName)!.columns.push(row[1]);
      });
      indexes[table.name] = Array.from(indexMap.values());
    }

    return { tables, columns, indexes };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class OracleClient implements DatabaseClient {
  private connection: oracledb.Connection;

  constructor(config: DatabaseConfig) {
    this.connection = {} as oracledb.Connection;
  }

  async init(config: DatabaseConfig): Promise<void> {
    this.connection = await oracledb.getConnection({
      user: config.username,
      password: config.password,
      connectString: `${config.host}:${config.port}/${config.database}`,
    });
  }

  async query(sql: string, params?: any[]): Promise<QueryResult> {
    const start = Date.now();
    const result = await this.connection.execute(sql, params || [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });
    const duration = Date.now() - start;
    const columns = result.metaData?.map(m => m.name) || [];
    const rows = result.rows || [];
    return {
      columns,
      rows: rows.map(row => Object.values(row)),
      rowCount: rows.length,
      duration,
    };
  }

  async getSchema(): Promise<SchemaInfo> {
    const tablesResult = await this.query(`
      SELECT table_name, 'TABLE' as type
      FROM user_tables
      ORDER BY table_name
    `);
    
    const tables = tablesResult.rows.map(row => ({
      name: row[0] as string,
      type: 'TABLE',
    }));

    const columns: Record<string, any[]> = {};
    const indexes: Record<string, any[]> = {};

    for (const table of tables) {
      const colsResult = await this.query(`
        SELECT 
          column_name,
          data_type,
          nullable = 'Y' as nullable,
          data_default as defaultValue,
          EXISTS (
            SELECT 1 FROM user_cons_columns ucc
            JOIN user_constraints uc ON ucc.constraint_name = uc.constraint_name
            WHERE ucc.table_name = :1 AND ucc.column_name = a.column_name 
              AND uc.constraint_type = 'P'
          ) as isPrimaryKey
        FROM user_tab_columns a
        WHERE table_name = :1
      `, [table.name]);
      
      columns[table.name] = colsResult.rows.map(row => ({
        name: row[0],
        type: row[1],
        nullable: !!row[2],
        defaultValue: row[3],
        isPrimaryKey: !!row[4],
      }));

      const idxResult = await this.query(`
        SELECT
          i.index_name,
          ic.column_name,
          i.uniqueness = 'UNIQUE' as isUnique,
          EXISTS (
            SELECT 1 FROM user_constraints uc
            WHERE uc.index_name = i.index_name AND uc.constraint_type = 'P'
          ) as isPrimary
        FROM user_indexes i
        JOIN user_ind_columns ic ON i.index_name = ic.index_name
        WHERE i.table_name = :1
        ORDER BY i.index_name, ic.column_position
      `, [table.name]);

      const indexMap = new Map<string, any>();
      idxResult.rows.forEach(row => {
        const idxName = row[0] as string;
        if (!indexMap.has(idxName)) {
          indexMap.set(idxName, {
            name: idxName,
            columns: [],
            isUnique: !!row[2],
            isPrimary: !!row[3],
          });
        }
        indexMap.get(idxName)!.columns.push(row[1]);
      });
      indexes[table.name] = Array.from(indexMap.values());
    }

    return { tables, columns, indexes };
  }

  async close(): Promise<void> {
    await this.connection.close();
  }
}

class SQLServerClient implements DatabaseClient {
  private pool: sql.ConnectionPool;

  constructor(config: DatabaseConfig) {
    this.pool = new sql.ConnectionPool({
      server: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
      pool: {
        max: 10,
        min: 0,
      },
    });
  }

  async init(): Promise<void> {
    await this.pool.connect();
  }

  async query(sql: string, params?: any[]): Promise<QueryResult> {
    const start = Date.now();
    const request = this.pool.request();
    const result = await request.query(sql);
    const duration = Date.now() - start;
    const columns = result.recordset.columns.map(c => c.name);
    return {
      columns,
      rows: result.recordset.map(row => Object.values(row)),
      rowCount: result.rowsAffected[0] || 0,
      duration,
    };
  }

  async getSchema(): Promise<SchemaInfo> {
    const tablesResult = await this.query(`
      SELECT TABLE_NAME as name, TABLE_TYPE as type
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
    `);
    
    const tables = tablesResult.rows.map(row => ({
      name: row[0] as string,
      type: row[1] as string,
    }));

    const columns: Record<string, any[]> = {};
    const indexes: Record<string, any[]> = {};

    for (const table of tables) {
      const colsResult = await this.query(`
        SELECT 
          COLUMN_NAME as name,
          DATA_TYPE as type,
          IS_NULLABLE = 'YES' as nullable,
          COLUMN_DEFAULT as defaultValue,
          EXISTS (
            SELECT 1 FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
            JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc 
              ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
            WHERE kcu.TABLE_NAME = '${table.name}' AND kcu.COLUMN_NAME = c.COLUMN_NAME 
              AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
          ) as isPrimaryKey
        FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE TABLE_NAME = '${table.name}'
      `);
      
      columns[table.name] = colsResult.rows.map(row => ({
        name: row[0],
        type: row[1],
        nullable: !!row[2],
        defaultValue: row[3],
        isPrimaryKey: !!row[4],
      }));

      const idxResult = await this.query(`
        SELECT 
          i.name as index_name,
          col.name as column_name,
          i.is_unique as isUnique,
          i.is_primary_key as isPrimary
        FROM sys.indexes i
        JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        JOIN sys.columns col ON ic.object_id = col.object_id AND ic.column_id = col.column_id
        JOIN sys.tables t ON i.object_id = t.object_id
        WHERE t.name = '${table.name}'
        ORDER BY i.name, ic.key_ordinal
      `);

      const indexMap = new Map<string, any>();
      idxResult.rows.forEach(row => {
        const idxName = row[0] as string;
        if (!indexMap.has(idxName)) {
          indexMap.set(idxName, {
            name: idxName,
            columns: [],
            isUnique: !!row[2],
            isPrimary: !!row[3],
          });
        }
        indexMap.get(idxName)!.columns.push(row[1]);
      });
      indexes[table.name] = Array.from(indexMap.values());
    }

    return { tables, columns, indexes };
  }

  async close(): Promise<void> {
    await this.pool.close();
  }
}

export async function createDatabaseClient(
  dbType: string,
  config: DatabaseConfig
): Promise<DatabaseClient> {
  switch (dbType) {
    case 'mysql':
      return new MySQLClient(config);
    case 'postgresql':
      return new PostgreSQLClient(config);
    case 'oracle':
      const oracleClient = new OracleClient(config);
      await oracleClient.init(config);
      return oracleClient;
    case 'sqlserver':
      const sqlClient = new SQLServerClient(config);
      await sqlClient.init();
      return sqlClient;
    default:
      throw new Error(`Unsupported database type: ${dbType}`);
  }
}
