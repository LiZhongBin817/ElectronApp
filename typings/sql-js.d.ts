declare module "sql.js" {
  export type SqlValue = string | number | Uint8Array | null;

  export interface QueryExecResult {
    columns: string[];
    values: SqlValue[][];
  }

  export interface Statement {
    bind(values?: readonly unknown[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }

  export class Database {
    constructor(data?: BufferSource);
    run(sql: string, params?: readonly unknown[]): Database;
    prepare(sql: string): Statement;
    export(): Uint8Array;
    exec(sql: string): QueryExecResult[];
    close(): void;
  }

  export interface SqlJsStatic {
    Database: typeof Database;
  }

  export interface SqlJsConfig {
    locateFile?: (file: string, prefix?: string) => string;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
