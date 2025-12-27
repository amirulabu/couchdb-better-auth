Important node: 95% vibe coded, use at own risk!

# CouchDB Better-Auth Adapter

A Better-Auth database adapter for CouchDB using the [nano](https://www.npmjs.com/package/nano) package.

## Installation

```bash
bun install couchdb-better-auth better-auth nano
```

Or with npm:

```bash
npm install couchdb-better-auth better-auth nano
```

## Usage

### Basic Setup

```typescript
import { betterAuth } from "better-auth";
import { couchdbAdapter } from "couchdb-better-auth";

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

### `useModelAsDatabase` (optional)

If `true`, each model will use its own database (e.g., `user`, `session`, `account`). If `false` (default), all models will use the database specified in `database`.

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

- ✅ Full CRUD operations (create, update, delete, findOne, findMany, count)
- ✅ Support for complex where clauses (AND, OR, operators)
- ✅ Pagination support (limit, offset)
- ✅ Sorting support
- ✅ Automatic `_id`/`_rev` handling
- ✅ Proper error handling (404, 409 conflicts)
- ✅ TypeScript support
- ✅ Works with both Bun and Node.js

## CouchDB Requirements

- CouchDB 2.0+ (for Mango query support)
- The database(s) will be created automatically if they don't exist when first accessed

## Notes

- CouchDB doesn't support transactions, so operations run sequentially
- Document IDs are strings (not numeric)
- The adapter automatically handles CouchDB's `_id` and `_rev` fields
- All Better-Auth where clause operators are supported and converted to CouchDB Mango selectors

## License

MIT
