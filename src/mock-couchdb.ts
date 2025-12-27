import type { DocumentScope, MangoSelector } from "nano";

/**
 * In-memory mock implementation of CouchDB for testing
 */
export class MockCouchDB {
  private databases: Map<string, Map<string, Record<string, unknown>>> = new Map();
  private revCounter: Map<string, number> = new Map();

  private getRev(docId: string): string {
    const count = (this.revCounter.get(docId) || 0) + 1;
    this.revCounter.set(docId, count);
    return `${count}-${Math.random().toString(36).substring(7)}`;
  }

  db = {
    list: async () => {
      return Array.from(this.databases.keys());
    },
    get: async (dbName: string) => {
      if (!this.databases.has(dbName)) {
        const error = new Error("Database not found") as Error & { statusCode?: number };
        error.statusCode = 404;
        throw error;
      }
      return { db_name: dbName };
    },
    create: async (dbName: string) => {
      if (!this.databases.has(dbName)) {
        this.databases.set(dbName, new Map());
      }
      return { ok: true };
    },
  };

  use(dbName: string): DocumentScope<Record<string, unknown>> {
    if (!this.databases.has(dbName)) {
      this.databases.set(dbName, new Map());
    }
    const db = this.databases.get(dbName);
    if (!db) {
      throw new Error(`Database ${dbName} not found`);
    }

    return {
      insert: async (doc: Record<string, unknown>) => {
        const docId = (doc._id as string) || `doc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const existing = db.get(docId);
        
        if (existing && doc._rev && doc._rev !== existing._rev) {
          const error = new Error("Document conflict") as Error & { statusCode?: number };
          error.statusCode = 409;
          throw error;
        }

        const rev = this.getRev(docId);
        const document = {
          ...doc,
          _id: docId,
          _rev: rev,
        };
        db.set(docId, document);
        return { id: docId, rev, ok: true };
      },

      get: async (docId: string) => {
        const doc = db.get(docId);
        if (!doc) {
          const error = new Error("Document not found") as Error & { statusCode?: number };
          error.statusCode = 404;
          throw error;
        }
        return { ...doc };
      },

      find: async (query: { selector: MangoSelector; limit?: number; skip?: number; sort?: Array<Record<string, string>> }) => {
        const { selector, limit, skip, sort } = query;
        let docs = Array.from(db.values());

        // Apply selector filtering
        if (selector && Object.keys(selector).length > 0) {
          docs = this.filterDocs(docs, selector);
        }

        // Apply sorting
        if (sort && sort.length > 0) {
          docs = this.sortDocs(docs, sort);
        }

        // Apply skip
        if (skip) {
          docs = docs.slice(skip);
        }

        // Apply limit
        if (limit) {
          docs = docs.slice(0, limit);
        }

        return {
          docs,
          bookmark: docs.length > 0 ? "mock_bookmark" : undefined,
        };
      },

      destroy: async (docId: string, rev: string) => {
        const doc = db.get(docId);
        if (!doc) {
          const error = new Error("Document not found") as Error & { statusCode?: number };
          error.statusCode = 404;
          throw error;
        }
        if (doc._rev !== rev) {
          const error = new Error("Document conflict") as Error & { statusCode?: number };
          error.statusCode = 409;
          throw error;
        }
        db.delete(docId);
        return { id: docId, rev, ok: true };
      },
    } as DocumentScope<Record<string, unknown>>;
  }

  private filterDocs(docs: Record<string, unknown>[], selector: MangoSelector): Record<string, unknown>[] {
    return docs.filter((doc) => {
      return this.matchesSelector(doc, selector);
    });
  }

  private matchesSelector(doc: Record<string, unknown>, selector: MangoSelector): boolean {
    for (const [key, value] of Object.entries(selector)) {
      if (key === "$and") {
        if (!Array.isArray(value)) return false;
        return value.every((subSelector) => this.matchesSelector(doc, subSelector as MangoSelector));
      }
      if (key === "$or") {
        if (!Array.isArray(value)) return false;
        return value.some((subSelector) => this.matchesSelector(doc, subSelector as MangoSelector));
      }

      const docValue = doc[key];
      
      if (typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
        const operatorValue = value as Record<string, unknown>;
        // Handle operators
        if (operatorValue.$eq !== undefined) {
          if (docValue !== operatorValue.$eq) return false;
        } else if (operatorValue.$ne !== undefined) {
          if (docValue === operatorValue.$ne) return false;
        } else if (operatorValue.$in !== undefined) {
          if (!Array.isArray(operatorValue.$in) || !operatorValue.$in.includes(docValue)) return false;
        } else if (operatorValue.$nin !== undefined) {
          if (Array.isArray(operatorValue.$nin) && operatorValue.$nin.includes(docValue)) return false;
        } else if (operatorValue.$gt !== undefined && operatorValue.$gt !== null) {
          if (typeof docValue === "number" && typeof operatorValue.$gt === "number" && docValue <= operatorValue.$gt) return false;
          if (typeof docValue === "string" && typeof operatorValue.$gt === "string" && docValue <= operatorValue.$gt) return false;
        } else if (operatorValue.$gte !== undefined && operatorValue.$gte !== null) {
          if (typeof docValue === "number" && typeof operatorValue.$gte === "number" && docValue < operatorValue.$gte) return false;
          if (typeof docValue === "string" && typeof operatorValue.$gte === "string" && docValue < operatorValue.$gte) return false;
        } else if (operatorValue.$lt !== undefined && operatorValue.$lt !== null) {
          if (typeof docValue === "number" && typeof operatorValue.$lt === "number" && docValue >= operatorValue.$lt) return false;
          if (typeof docValue === "string" && typeof operatorValue.$lt === "string" && docValue >= operatorValue.$lt) return false;
        } else if (operatorValue.$lte !== undefined && operatorValue.$lte !== null) {
          if (typeof docValue === "number" && typeof operatorValue.$lte === "number" && docValue > operatorValue.$lte) return false;
          if (typeof docValue === "string" && typeof operatorValue.$lte === "string" && docValue > operatorValue.$lte) return false;
        } else if (operatorValue.$regex !== undefined) {
          const regex = new RegExp(String(operatorValue.$regex));
          if (!regex.test(String(docValue))) return false;
        } else {
          // Nested selector
          if (!this.matchesSelector(docValue as Record<string, unknown>, value as MangoSelector)) return false;
        }
      } else {
        // Direct equality
        if (docValue !== value) return false;
      }
    }
    return true;
  }

  private sortDocs(docs: Record<string, unknown>[], sort: Array<Record<string, string>>): Record<string, unknown>[] {
    return [...docs].sort((a, b) => {
      for (const sortItem of sort) {
        for (const [field, direction] of Object.entries(sortItem)) {
          const aVal = a[field];
          const bVal = b[field];
          let comparison = 0;
          
          if (aVal === undefined || aVal === null) comparison = 1;
          else if (bVal === undefined || bVal === null) comparison = -1;
          else if (aVal < bVal) comparison = -1;
          else if (aVal > bVal) comparison = 1;
          
          if (comparison !== 0) {
            return direction === "desc" ? -comparison : comparison;
          }
        }
      }
      return 0;
    });
  }

  clear() {
    this.databases.clear();
    this.revCounter.clear();
  }
}

