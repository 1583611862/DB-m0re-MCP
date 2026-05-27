import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

interface SecurityConfig {
  security: {
    readOnlyEnvs: string[];
    maxQueryLimit: number;
    sqlTimeout: number;
    dangerousPatterns: string[];
    allowedCommands: string[];
  };
}

export class SecurityManager {
  private config: SecurityConfig;

  constructor(configPath: string) {
    this.config = this.loadConfig(configPath);
  }

  private loadConfig(configPath: string): SecurityConfig {
    const fullPath = path.resolve(configPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    return yaml.load(content) as SecurityConfig;
  }

  isReadOnlyEnv(env: string): boolean {
    return this.config.security.readOnlyEnvs.includes(env);
  }

  validateSql(sql: string, env: string): { valid: boolean; message?: string } {
    const upperSql = sql.toUpperCase().trim();
    
    if (this.isReadOnlyEnv(env)) {
      const isReadOnly = this.config.security.allowedCommands.some(cmd => 
        upperSql.startsWith(cmd.toUpperCase())
      );
      
      if (!isReadOnly) {
        return {
          valid: false,
          message: `Read-only environment (${env}): only ${this.config.security.allowedCommands.join(', ')} are allowed`,
        };
      }
    }

    for (const pattern of this.config.security.dangerousPatterns) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(sql)) {
        return {
          valid: false,
          message: `Dangerous SQL pattern detected: ${pattern}`,
        };
      }
    }

    return { valid: true };
  }

  addLimitIfNeeded(sql: string): string {
    const upperSql = sql.toUpperCase().trim();
    
    if (upperSql.startsWith('SELECT') && !upperSql.includes('LIMIT')) {
      return `${sql} LIMIT ${this.config.security.maxQueryLimit}`;
    }
    
    return sql;
  }

  getMaxQueryLimit(): number {
    return this.config.security.maxQueryLimit;
  }

  getSqlTimeout(): number {
    return this.config.security.sqlTimeout;
  }
}
