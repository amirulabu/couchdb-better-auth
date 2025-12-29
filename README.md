> **Important note:** 95% vibe coded, use at own risk! 

# CouchDB Better-Auth Adapter

A Better-Auth database adapter for CouchDB using the [nano](https://www.npmjs.com/package/nano) package.

## Installation

```bash
npm install @amirulabu/couchdb-better-auth better-auth nano
```

Or with pnpm:

```bash
pnpm add @amirulabu/couchdb-better-auth better-auth nano
```

Or with bun:

```bash
bun add @amirulabu/couchdb-better-auth better-auth nano
```

## Usage

### Basic Setup

```typescript
import { betterAuth } from "better-auth";
import { couchdbAdapter } from "@amirulabu/couchdb-better-auth";

export const auth = betterAuth({
  database: couchdbAdapter({
    url: "http://localhost:5984",
    database: "better_auth", // Optional: defaults to "better_auth"
  }),
  // ... other Better-Auth configurations
});
```

### Using Model Names as Database Names

If you want each model to use its own database:

```typescript
export const auth = betterAuth({
  database: couchdbAdapter({
    url: "http://localhost:5984",
    useModelAsDatabase: true, // Each model will use its own database
  }),
});
```

### With Authentication

If your CouchDB instance requires authentication:

```typescript
export const auth = betterAuth({
  database: couchdbAdapter({
    url: "http://username:password@localhost:5984",
    database: "better_auth",
  }),
});
```

### With Debug Logs

Enable debug logging to troubleshoot issues:

```typescript
export const auth = betterAuth({
  database: couchdbAdapter({
    url: "http://localhost:5984",
    database: "better_auth",
    debugLogs: true, // Enable all debug logs
    // Or enable specific methods:
    // debugLogs: {
    //   create: true,
    //   update: true,
    //   findOne: true,
    // }
  }),
});
```

## Configuration Options

### `url` (required)

The CouchDB connection URL. Examples:
- `"http://localhost:5984"`
- `"https://couchdb.example.com"`
- `"http://username:password@localhost:5984"`

### `database` (optional)

The database name to use for all models. Defaults to `"better_auth"`.

If `useModelAsDatabase` is `true`, this option is ignored.

**Note:** When using a shared database (default), the adapter automatically adds a `betterAuthModel` field to each document to filter models correctly.

### `useModelAsDatabase` (optional)

If `true`, each model will use its own database (e.g., `user`, `session`, `account`). If `false` (default), all models will use the database specified in `database`.

**Benefits of `useModelAsDatabase: true`:**
- Better separation of concerns
- Easier database management and backup
- No need for model filtering fields

**Benefits of shared database (default):**
- Single database to manage
- Easier cross-model queries (if needed)
- Simpler setup

### `debugLogs` (optional)

Enable debug logging. Can be:
- `true` - Enable all debug logs
- `false` - Disable all debug logs (default)
- An object with specific method flags:
  ```typescript
  {
    create?: boolean;
    update?: boolean;
    updateMany?: boolean;
    findOne?: boolean;
    findMany?: boolean;
    delete?: boolean;
    deleteMany?: boolean;
    count?: boolean;
  }
  ```

## Features

- ✅ Full CRUD operations (create, update, updateMany, delete, deleteMany, findOne, findMany, count)
- ✅ Support for complex where clauses (AND, OR, operators)
- ✅ Pagination support (limit, offset)
- ✅ Sorting support (with automatic fallback to in-memory sorting if index is missing)
- ✅ Automatic `_id`/`_rev` handling
- ✅ Proper error handling (404, 409 conflicts with automatic retry)
- ✅ TypeScript support with full type definitions
- ✅ Works with both Bun and Node.js
- ✅ Automatic database creation
- ✅ Support for shared database or model-specific databases

## CouchDB Requirements

- CouchDB 2.0+ (for Mango query support)
- The database(s) will be created automatically if they don't exist when first accessed

## Supported Where Clause Operators

The adapter supports all Better-Auth where clause operators and converts them to CouchDB Mango selectors:

- `equals` / `eq` - Equality check
- `not` / `ne` - Not equal
- `in` - Value in array
- `notIn` / `not_in` - Value not in array
- `gt` - Greater than
- `gte` - Greater than or equal
- `lt` - Less than
- `lte` - Less than or equal
- `contains` - String contains (uses regex)
- `startsWith` / `starts_with` - String starts with (uses regex)
- `endsWith` / `ends_with` - String ends with (uses regex)
- `AND` - Logical AND
- `OR` - Logical OR

## Notes

- CouchDB doesn't support transactions, so operations run sequentially
- Document IDs are strings (not numeric)
- The adapter automatically handles CouchDB's `_id` and `_rev` fields
- When using a shared database, documents include a `betterAuthModel` field for filtering (automatically managed)
- String operators (`contains`, `startsWith`, `endsWith`) use CouchDB regex and are case-sensitive
- For optimal performance with sorting, ensure appropriate indexes exist in CouchDB (the adapter will fall back to in-memory sorting if needed)

## Testing

The adapter uses the official Better-Auth adapter test suite. To run the tests:

1. **Start a CouchDB instance** (e.g., using Docker):
   ```bash
   docker run -d -p 5984:5984 -e COUCHDB_USER=admin -e COUCHDB_PASSWORD=password apache/couchdb:latest
   ```

2. **Set the CouchDB URL** (optional, defaults to `http://admin:password@localhost:5984`):
   ```bash
   export COUCHDB_URL=http://admin:password@localhost:5984
   ```

3. **Run the tests**:
   ```bash
   pnpm test
   ```

   Or in watch mode:
   ```bash
   pnpm test:watch
   ```

The test suite will automatically create and clean up test databases.

## Examples

See the [example directory](./example/expressjs) for a complete Express.js integration example.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Repository

- **GitHub:** [amirulabu/couchdb-better-auth](https://github.com/amirulabu/couchdb-better-auth)
- **Issues:** [Report an issue](https://github.com/amirulabu/couchdb-better-auth/issues)

## License

MIT
