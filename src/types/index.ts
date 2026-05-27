export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface DatasourceContext {
  customer: string;
  dbType: 'mysql' | 'postgresql' | 'oracle' | 'sqlserver';
  env: 'dev' | 'test' | 'prod';
  config: DatabaseConfig;
  lastAccessTime: number;
}

export interface CurrentContext {
  customer: string;
  dbType: 'mysql' | 'postgresql' | 'oracle' | 'sqlserver';
  env: 'dev' | 'test' | 'prod';
}

export interface QueryResult {
  columns: string[];
  rows: any[][];
  rowCount: number;
  duration: number;
}

export interface TableInfo {
  name: string;
  schema?: string;
  type: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  isPrimaryKey?: boolean;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
}

export interface SchemaInfo {
  tables: TableInfo[];
  columns: Record<string, ColumnInfo[]>;
  indexes: Record<string, IndexInfo[]>;
}

export interface AuditRecord {
  id?: number;
  timestamp: string;
  customer: string;
  dbType: string;
  env: string;
  sql: string;
  duration: number;
  success: boolean;
  error?: string;
}
