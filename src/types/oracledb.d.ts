declare module 'oracledb' {
  export const OUT_FORMAT_OBJECT: number;
  
  export interface Connection {
    execute(
      sql: string,
      binds?: any[],
      options?: { outFormat?: number }
    ): Promise<{ metaData?: { name: string }[]; rows?: any[] }>;
    close(): Promise<void>;
  }
  
  export function getConnection(params: {
    user: string;
    password: string;
    connectString: string;
  }): Promise<Connection>;
}
