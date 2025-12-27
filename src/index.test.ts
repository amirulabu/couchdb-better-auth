import { describe, afterAll, it, expect, beforeAll, vi } from "vitest";
import { runAdapterTest } from "better-auth/adapters/test";
import { MockCouchDB } from "./mock-couchdb";

// Global mock instance
const mockCouchDB = new MockCouchDB();

// Determine which mode to use
const USE_REAL_COUCHDB = process.env.USE_REAL_COUCHDB === "true";
const COUCHDB_URL = process.env.COUCHDB_URL || "http://admin:password@localhost:5984";

// Mock nano if not using real CouchDB
if (!USE_REAL_COUCHDB) {
  vi.mock("nano", () => {
    return {
      default: () => {
        return mockCouchDB;
      },
    };
  });
}

// Helper to check if real CouchDB is available
async function isCouchDBAvailable(url: string): Promise<boolean> {
  if (USE_REAL_COUCHDB) {
    try {
      // Use dynamic import to get real nano (not mocked)
      const { default: nano } = await import("nano");
      const couch = nano(url);
      await couch.db.list();
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

// Helper to clear test databases
async function clearTestDatabases(url: string): Promise<void> {
  try {
    const { default: nano } = await import("nano");
    const couch = nano(url);
    
    // List of potential test database names
    const testDatabaseNames = [
      "better_auth_test",
      // Model-specific databases (if useModelAsDatabase is used)
      "user",
      "session",
      "account",
      "verification",
    ];
    
    // Get all existing databases
    const existingDbs = await couch.db.list();
    
    // Delete test databases if they exist
    for (const dbName of testDatabaseNames) {
      if (existingDbs.includes(dbName)) {
        try {
          await couch.db.destroy(dbName);
          console.log(`🗑️  Deleted test database: ${dbName}`);
        } catch (error) {
          // Ignore errors if database doesn't exist or is already deleted
          const err = error as { statusCode?: number };
          if (err.statusCode !== 404) {
            console.warn(`⚠️  Failed to delete database ${dbName}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.warn("⚠️  Failed to clear test databases:", error);
  }
}

// Import after mock setup
import { couchdbAdapter, type CouchDBAdapterConfig } from "./index";

describe("CouchDB Adapter Tests", () => {
  let useRealCouchDB = false;

  beforeAll(async () => {
    if (USE_REAL_COUCHDB) {
      useRealCouchDB = await isCouchDBAvailable(COUCHDB_URL);
      if (useRealCouchDB) {
        console.log("✅ Using REAL CouchDB for tests");
        // Clear test databases before starting tests
        await clearTestDatabases(COUCHDB_URL);
      } else {
        console.warn(
          "⚠️  USE_REAL_COUCHDB=true but CouchDB is not available.\n" +
          "   Falling back to MOCK. Start CouchDB:\n" +
          "   docker run -d -p 5984:5984 -e COUCHDB_USER=admin -e COUCHDB_PASSWORD=password apache/couchdb:latest"
        );
      }
    } else {
      console.log("📦 Using MOCK CouchDB for tests");
      console.log("   To use real CouchDB, set: USE_REAL_COUCHDB=true");
    }
  });

  afterAll(async () => {
    if (useRealCouchDB) {
      // Clean up real CouchDB test databases
      await clearTestDatabases(COUCHDB_URL);
    } else {
      // Clean up mock data
      mockCouchDB.clear();
    }
  });

  describe("Adapter Configuration", () => {
    it("should export couchdbAdapter function", () => {
      expect(couchdbAdapter).toBeDefined();
      expect(typeof couchdbAdapter).toBe("function");
    });

    it("should throw error if URL is not provided", () => {
      expect(() => {
        couchdbAdapter({ url: "" } as CouchDBAdapterConfig);
      }).toThrow("CouchDB adapter requires a URL");
    });

    it("should accept configuration with URL", () => {
      const adapter = couchdbAdapter({
        url: "http://localhost:5984",
      });

      expect(adapter).toBeDefined();
      expect(typeof adapter).toBe("function");
    });

    it("should accept configuration with database name", () => {
      const adapter = couchdbAdapter({
        url: "http://localhost:5984",
        database: "test_db",
      });

      expect(adapter).toBeDefined();
      expect(typeof adapter).toBe("function");
    });

    it("should accept configuration with useModelAsDatabase", () => {
      const adapter = couchdbAdapter({
        url: "http://localhost:5984",
        useModelAsDatabase: true,
      });

      expect(adapter).toBeDefined();
      expect(typeof adapter).toBe("function");
    });

    it("should accept configuration with debugLogs", () => {
      const adapter = couchdbAdapter({
        url: "http://localhost:5984",
        debugLogs: true,
      });

      expect(adapter).toBeDefined();
      expect(typeof adapter).toBe("function");
    });
  });

  describe("Adapter Functionality", () => {
    const adapter = couchdbAdapter({
      url: COUCHDB_URL,
      database: "better_auth_test",
      debugLogs: {
        isRunningAdapterTests: true,
      },
    });

    runAdapterTest({
      getAdapter: async (betterAuthOptions = {}) => {
        return adapter(betterAuthOptions);
      },
    });
  });
});
