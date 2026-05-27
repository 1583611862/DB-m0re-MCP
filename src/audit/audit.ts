import Database from 'better-sqlite3';
import path from 'path';
import { AuditRecord } from '../types';

export class AuditLogger {
  private db: Database.Database;

  constructor(dbPath: string = './audit.db') {
    const fullPath = path.resolve(dbPath);
    this.db = new Database(fullPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        customer TEXT NOT NULL,
        dbType TEXT NOT NULL,
        env TEXT NOT NULL,
        sql TEXT NOT NULL,
        duration INTEGER NOT NULL,
        success INTEGER NOT NULL,
        error TEXT
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_timestamp ON audit_log(timestamp)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_customer ON audit_log(customer)
    `);
  }

  log(record: AuditRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO audit_log (timestamp, customer, dbType, env, sql, duration, success, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      record.timestamp,
      record.customer,
      record.dbType,
      record.env,
      record.sql,
      record.duration,
      record.success ? 1 : 0,
      record.error || null
    );
  }

  query(
    options: {
      customer?: string;
      dbType?: string;
      env?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): AuditRecord[] {
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const params: any[] = [];

    if (options.customer) {
      sql += ' AND customer = ?';
      params.push(options.customer);
    }

    if (options.dbType) {
      sql += ' AND dbType = ?';
      params.push(options.dbType);
    }

    if (options.env) {
      sql += ' AND env = ?';
      params.push(options.env);
    }

    sql += ' ORDER BY timestamp DESC';

    const limit = options.limit || 100;
    const offset = options.offset || 0;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      customer: row.customer,
      dbType: row.dbType,
      env: row.env,
      sql: row.sql,
      duration: row.duration,
      success: !!row.success,
      error: row.error,
    }));
  }

  close(): void {
    this.db.close();
  }
}
