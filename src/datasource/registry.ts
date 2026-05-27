import { LRUCache } from 'lru-cache';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { DatabaseClient, createDatabaseClient } from './connections';
import {
  DatabaseConfig,
  DatasourceContext,
  CurrentContext,
} from '../types';
import { logger } from '../logger';

interface ConfigFile {
  customers: Record<
    string,
    Record<
      string,
      Record<string, DatabaseConfig>
    >
  >;
}

export class DatasourceRegistry {
  private cache: LRUCache<string, { client: DatabaseClient; context: DatasourceContext }>;
  private config: ConfigFile;
  private configPath: string;
  private currentContext: CurrentContext | null = null;
  private watcher: fs.FSWatcher | null = null;

  constructor(configPath: string) {
    this.configPath = configPath;
    this.config = this.loadConfig(configPath);
    this.cache = new LRUCache<string, { client: DatabaseClient; context: DatasourceContext }>({
      max: 20,
      ttl: 30 * 60 * 1000,
      dispose: (value: { client: DatabaseClient; context: DatasourceContext }) => {
        value.client.close().catch(() => {});
      },
    });
    this.setupConfigWatcher();
  }

  private setupConfigWatcher(): void {
    try {
      const fullPath = path.resolve(this.configPath);
      const dir = path.dirname(fullPath);
      const filename = path.basename(fullPath);

      this.watcher = fs.watch(dir, (eventType, filename_) => {
        if (filename_ === filename && eventType === 'change') {
          logger.info('Configuration file changed, reloading...');
          setTimeout(() => this.reloadConfig(), 100);
        }
      });

      this.watcher.on('error', (err) => {
        logger.error('Config watcher error:', err);
      });

      logger.info(`Config file watcher started for: ${fullPath}`);
    } catch (err) {
      logger.error('Failed to setup config watcher:', err);
    }
  }

  reloadConfig(): { success: boolean; message: string } {
    try {
      const oldConfig = this.config;
      this.config = this.loadConfig(this.configPath);
      
      const oldCustomers = Object.keys(oldConfig?.customers || {});
      const newCustomers = Object.keys(this.config.customers);
      
      const added = newCustomers.filter(c => !oldCustomers.includes(c));
      const removed = oldCustomers.filter(c => !newCustomers.includes(c));

      logger.info(`Configuration reloaded. Customers: ${newCustomers.join(', ')}`);
      
      return {
        success: true,
        message: `Configuration reloaded successfully. Added: [${added.join(', ')}], Removed: [${removed.join(', ')}]`
      };
    } catch (err) {
      logger.error('Failed to reload config:', err);
      return {
        success: false,
        message: `Failed to reload config: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  }

  private loadConfig(configPath: string): ConfigFile {
    const fullPath = path.resolve(configPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    return yaml.load(content) as ConfigFile;
  }

  private getCacheKey(
    customer: string,
    dbType: string,
    env: string
  ): string {
    return `${customer}-${dbType}-${env}`;
  }

  private getDatabaseConfig(
    customer: string,
    dbType: string,
    env: string
  ): DatabaseConfig {
    const customerConfig = this.config.customers[customer];
    if (!customerConfig) {
      throw new Error(`Customer not found: ${customer}`);
    }
    const dbConfig = customerConfig[dbType];
    if (!dbConfig) {
      throw new Error(`Database type not found: ${dbType} for customer ${customer}`);
    }
    const envConfig = dbConfig[env];
    if (!envConfig) {
      throw new Error(`Environment not found: ${env} for ${customer}/${dbType}`);
    }
    return envConfig;
  }

  async switchDatabase(
    customer: string,
    dbType: 'mysql' | 'postgresql' | 'oracle' | 'sqlserver',
    env: 'dev' | 'test' | 'prod'
  ): Promise<CurrentContext> {
    const cacheKey = this.getCacheKey(customer, dbType, env);
    
    let cached = this.cache.get(cacheKey);
    
    if (!cached) {
      const config = this.getDatabaseConfig(customer, dbType, env);
      const client = await createDatabaseClient(dbType, config);
      
      const context: DatasourceContext = {
        customer,
        dbType,
        env,
        config,
        lastAccessTime: Date.now(),
      };
      
      cached = { client, context };
      this.cache.set(cacheKey, cached);
    } else {
      cached.context.lastAccessTime = Date.now();
    }

    this.currentContext = {
      customer,
      dbType,
      env,
    };

    return this.currentContext;
  }

  getCurrentContext(): CurrentContext | null {
    return this.currentContext;
  }

  getCurrentClient(): DatabaseClient {
    if (!this.currentContext) {
      throw new Error('No database selected. Use switch_database first.');
    }

    const cacheKey = this.getCacheKey(
      this.currentContext.customer,
      this.currentContext.dbType,
      this.currentContext.env
    );

    const cached = this.cache.get(cacheKey);
    if (!cached) {
      throw new Error('Database connection not found. Please switch again.');
    }

    cached.context.lastAccessTime = Date.now();
    return cached.client;
  }

  getAvailableCustomers(): string[] {
    return Object.keys(this.config.customers);
  }

  getAvailableDatabases(customer: string): string[] {
    const customerConfig = this.config.customers[customer];
    if (!customerConfig) return [];
    return Object.keys(customerConfig);
  }

  getAvailableEnvironments(customer: string, dbType: string): string[] {
    const customerConfig = this.config.customers[customer];
    if (!customerConfig) return [];
    const dbConfig = customerConfig[dbType];
    if (!dbConfig) return [];
    return Object.keys(dbConfig);
  }

  destroy(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
