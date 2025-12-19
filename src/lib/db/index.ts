import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Database connection string from environment variable
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Singleton pattern for database connection
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

function getDatabase() {
  if (_db) return _db;

  // Create PostgreSQL client
  _client = postgres(connectionString, {
    max: 10, // Maximum number of connections
    idle_timeout: 20, // Close idle connections after 20 seconds
    connect_timeout: 10, // Connection timeout in seconds
  });

  // Create Drizzle ORM instance with schema
  _db = drizzle(_client, { schema });
  
  return _db;
}

// Export a proxy that lazily initializes the database
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(target, prop) {
    const database = getDatabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (database as any)[prop];
  },
});

// Export schema for use in queries
export * from './schema';
