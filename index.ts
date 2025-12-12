import { createAdapterFactory, type DBAdapterDebugLogOption } from "better-auth/adapters";
import nano, { type DocumentScope, type ServerScope, type MangoSelector, type MangoValue, type SortOrder } from "nano";

/**
 * Configuration options for the CouchDB adapter
 */
export interface CouchDBAdapterConfig {
  /**
   * CouchDB connection URL (e.g., "http://localhost:5984")
   */
  url: string;
  /**
   * Database name to use. If not provided, model names will be used as database names.
   */
  database?: string;
  /**
   * Use model name as database name. If true, each model will use its own database.
   * If false, all models will use the database specified in `database`.
   * @default false
   */
  useModelAsDatabase?: boolean;
  /**
   * Enable debug logs for the adapter
   */
  debugLogs?: DBAdapterDebugLogOption;
}

/**
 * CouchDB document structure with _id and _rev
 */
interface CouchDBDocument {
  _id: string;
  _rev?: string;
  [key: string]: unknown;
}

/**
 * Convert Where[] array to Record format for convertWhereToSelector
 */
function convertWhereArrayToRecord(whereArray: unknown): Record<string, unknown> | null {
  if (!whereArray || !Array.isArray(whereArray)) {
    return null;
  }
  
  // If it's already a Record, return it
  if (!Array.isArray(whereArray) && typeof whereArray === "object") {
    return whereArray as Record<string, unknown>;
  }
  
  // Convert Where[] array format to nested object format
  const result: Record<string, unknown> = {};
  const andConditions: Record<string, unknown>[] = [];
  
  for (const condition of whereArray as Array<{ field: string; operator: string; value: unknown; connector?: string }>) {
    if (!condition.field) continue;
    
    const field = condition.field;
    const operator = condition.operator;
    const value = condition.value;
    
    let opKey: string;
    switch (operator) {
      case "eq":
      case "equals":
        opKey = "equals";
        break;
      case "ne":
      case "not":
        opKey = "not";
        break;
      case "in":
        opKey = "in";
        break;
      case "not_in":
      case "notIn":
        opKey = "notIn";
        break;
      case "gt":
        opKey = "gt";
        break;
      case "gte":
        opKey = "gte";
        break;
      case "lt":
        opKey = "lt";
        break;
      case "lte":
        opKey = "lte";
        break;
      case "contains":
        opKey = "contains";
        break;
      case "starts_with":
      case "startsWith":
        opKey = "startsWith";
        break;
      case "ends_with":
      case "endsWith":
        opKey = "endsWith";
        break;
      default:
        opKey = operator;
    }
    
    if (condition.connector === "OR") {
      // Handle OR conditions
      if (!result.OR) {
        result.OR = [];
      }
      (result.OR as unknown[]).push({ [field]: { [opKey]: value } });
    } else {
      // Default to AND
      andConditions.push({ [field]: { [opKey]: value } });
    }
  }
  
  if (andConditions.length > 0) {
    if (andConditions.length === 1) {
      Object.assign(result, andConditions[0]);
    } else {
      result.AND = andConditions;
    }
  }
  
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Convert Better-Auth where clause to CouchDB Mango selector
 */
function convertWhereToSelector(where: Record<string, unknown> | unknown): MangoSelector {
  // Handle Where[] array format
  if (Array.isArray(where)) {
    const converted = convertWhereArrayToRecord(where);
    if (converted) {
      where = converted;
    } else {
      return {} as MangoSelector;
    }
  }
  
  if (!where || typeof where !== "object") {
    return {} as MangoSelector;
  }
  
  const whereRecord = where as Record<string, unknown>;
  const selector: MangoSelector = {} as MangoSelector;

  for (const [key, value] of Object.entries(where)) {
    if (key === "AND" || key === "OR") {
      // Handle AND/OR conditions
      if (Array.isArray(value)) {
        selector[key.toLowerCase()] = value.map((item) => convertWhereToSelector(item));
      }
    } else if (key === "id") {
      // Map id to _id for CouchDB
      selector._id = value as MangoValue;
    } else if (typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      // Handle operators like { equals, not, in, gt, etc. }
      const operators: Record<string, unknown> = {};
      for (const [op, opValue] of Object.entries(value)) {
        switch (op) {
          case "equals":
            operators.$eq = opValue;
            break;
          case "not":
            operators.$ne = opValue;
            break;
          case "in":
            operators.$in = opValue;
            break;
          case "notIn":
            operators.$nin = opValue;
            break;
          case "gt":
            operators.$gt = opValue;
            break;
          case "gte":
            operators.$gte = opValue;
            break;
          case "lt":
            operators.$lt = opValue;
            break;
          case "lte":
            operators.$lte = opValue;
            break;
          case "contains":
            // CouchDB uses $regex for contains
            operators.$regex = `(?i).*${String(opValue)}.*`;
            break;
          case "startsWith":
            operators.$regex = `(?i)^${String(opValue)}.*`;
            break;
          case "endsWith":
            operators.$regex = `(?i).*${String(opValue)}$`;
            break;
          default:
            // Unknown operator, pass through
            operators[op] = opValue;
        }
      }
      if (Object.keys(operators).length > 0) {
        selector[key] = operators;
      } else {
        selector[key] = value;
      }
    } else {
      // Simple equality
      selector[key] = value as MangoValue;
    }
  }

  return selector;
}

/**
 * Remove CouchDB internal fields from document
 */
function cleanDocument(doc: CouchDBDocument): Record<string, unknown> {
  const cleaned = { ...doc };
  delete cleaned._rev;
  // Map _id to id
  if (cleaned._id) {
    cleaned.id = cleaned._id;
    delete (cleaned as { _id?: string })._id;
  }
  return cleaned;
}

/**
 * Get database instance for a model
 */
function getDatabase(
  couch: ServerScope,
  model: string,
  config: CouchDBAdapterConfig
): DocumentScope<unknown> {
  if (config.useModelAsDatabase) {
    return couch.use(model);
  }
  const dbName = config.database || "better_auth";
  return couch.use(dbName);
}

/**
 * Create a Better-Auth adapter for CouchDB
 */
export const couchdbAdapter = (config: CouchDBAdapterConfig) => {
  if (!config.url) {
    throw new Error("CouchDB adapter requires a URL");
  }

  const couch: ServerScope = nano(config.url);

  return createAdapterFactory({
    config: {
      adapterId: "couchdb-adapter",
      adapterName: "CouchDB Adapter",
      usePlural: false,
      debugLogs: config.debugLogs ?? false,
      supportsJSON: true,
      supportsDates: true,
      supportsBooleans: true,
      supportsNumericIds: false,
      transaction: false,
      mapKeysTransformInput: {
        id: "_id",
      },
      mapKeysTransformOutput: {
        _id: "id",
      },
    },
    adapter: (params) => {
      const {
        options,
        schema,
        debugLog,
        getFieldName,
        getModelName,
        getDefaultModelName,
        getDefaultFieldName,
        getFieldAttributes,
        transformInput,
        transformOutput,
        transformWhereClause,
      } = params;
      return {
        create: async ({ data, model, select }: { data: Record<string, unknown>; model: string; select?: unknown }): Promise<any> => {
          const db = getDatabase(couch, getModelName(model), config);
          const transformedData = await transformInput(data, getDefaultModelName(model), "create");

          // Ensure _id is set
          if (!transformedData._id && transformedData.id) {
            transformedData._id = transformedData.id;
          }

          try {
            const response = await db.insert(transformedData as CouchDBDocument);
            const created = { ...transformedData, _id: response.id, _rev: response.rev };

            // Get the full document if needed
            const fullDoc = await db.get(response.id);
            const cleaned = cleanDocument(fullDoc as CouchDBDocument);
            return await (transformOutput as any)(cleaned, [getDefaultModelName(model)], "create");
          } catch (error: unknown) {
            debugLog?.("create", { error, model, data: transformedData });
            throw error;
          }
        },

        update: async ({ data, model, where, select }: { data: Record<string, unknown>; model: string; where: Record<string, unknown>; select?: unknown }): Promise<any> => {
          const db = getDatabase(couch, getModelName(model), config);
          const transformedWhere = transformWhereClause({ where: where as any, model: getDefaultModelName(model) });
          const transformedData = await transformInput(data, getDefaultModelName(model), "update");

          // Get the document ID from where clause
          let docId: string | undefined;
          const whereRecord = Array.isArray(transformedWhere) ? convertWhereArrayToRecord(transformedWhere) : (transformedWhere as Record<string, unknown> | undefined);
          if (whereRecord?.id) {
            docId = String(whereRecord.id);
          } else if (whereRecord?._id) {
            docId = String(whereRecord._id);
          } else {
            // Try to find the document first
            const selector = convertWhereToSelector(transformedWhere as unknown);
            const result = await db.find({ selector, limit: 1 });
            if (result.docs.length === 0) {
              throw new Error(`Document not found for update in model ${model}`);
            }
            docId = (result.docs[0] as CouchDBDocument)._id;
          }

          try {
            // Get existing document to preserve _rev
            const existing = (await db.get(docId)) as CouchDBDocument;
            const updated = {
              ...existing,
              ...transformedData,
              _id: existing._id,
              _rev: existing._rev,
            };

            const response = await db.insert(updated);
            const result = { ...updated, _rev: response.rev };

            // Get the full updated document
            const fullDoc = await db.get(response.id);
            const cleaned = cleanDocument(fullDoc as CouchDBDocument);
            return await (transformOutput as any)(cleaned, [getDefaultModelName(model)], "update");
          } catch (error: unknown) {
            if ((error as { statusCode?: number }).statusCode === 404) {
              throw new Error(`Document not found: ${docId}`);
            }
            if ((error as { statusCode?: number }).statusCode === 409) {
              // Conflict - retry once
              const existing = (await db.get(docId)) as CouchDBDocument;
              const updated = {
                ...existing,
                ...transformedData,
                _id: existing._id,
                _rev: existing._rev,
              };
              const response = await db.insert(updated);
              const fullDoc = await db.get(response.id);
              const cleaned = cleanDocument(fullDoc as CouchDBDocument);
              return await (transformOutput as any)(cleaned, [getDefaultModelName(model)], "update");
            }
            debugLog?.("update", { error, model, where: transformedWhere, data: transformedData });
            throw error;
          }
        },

        updateMany: async ({ data, model, where }: { data: Record<string, unknown>; model: string; where: Record<string, unknown> }) => {
          const db = getDatabase(couch, getModelName(model), config);
          const transformedWhere = transformWhereClause({ where: where as any, model: getDefaultModelName(model) });
          const transformedData = await transformInput(data, getDefaultModelName(model), "update");
          const selector = convertWhereToSelector(transformedWhere as unknown);

          try {
            // Find all matching documents
            const result = await db.find({ selector });
            let updatedCount = 0;

            // Update each document
            for (const doc of result.docs) {
              const couchDoc = doc as CouchDBDocument;
              try {
                const updated = {
                  ...couchDoc,
                  ...transformedData,
                  _id: couchDoc._id,
                  _rev: couchDoc._rev,
                };
                await db.insert(updated);
                updatedCount++;
              } catch (error: unknown) {
                // Skip conflicts and continue
                if ((error as { statusCode?: number }).statusCode !== 409) {
                  throw error;
                }
              }
            }

            return updatedCount;
          } catch (error: unknown) {
            debugLog?.("updateMany", { error, model, where: transformedWhere, data: transformedData });
            throw error;
          }
        },

        delete: async ({ data, model, where }: { data?: Record<string, unknown>; model: string; where: Record<string, unknown> }) => {
          const db = getDatabase(couch, getModelName(model), config);
          const transformedWhere = transformWhereClause({ where: where as any, model: getDefaultModelName(model) });

          // Get the document ID from where clause
          let docId: string | undefined;
          const whereRecord = Array.isArray(transformedWhere) ? convertWhereArrayToRecord(transformedWhere) : (transformedWhere as Record<string, unknown> | undefined);
          if (whereRecord?.id) {
            docId = String(whereRecord.id);
          } else if (whereRecord?._id) {
            docId = String(whereRecord._id);
          } else {
            // Try to find the document first
            const selector = convertWhereToSelector(transformedWhere as unknown);
            const result = await db.find({ selector, limit: 1 });
            if (result.docs.length === 0) {
              return;
            }
            docId = (result.docs[0] as CouchDBDocument)._id;
          }

          try {
            if (!docId) return;
            const doc = (await db.get(docId)) as CouchDBDocument;
            await db.destroy(doc._id, doc._rev || "");
            return;
          } catch (error: unknown) {
            if ((error as { statusCode?: number }).statusCode === 404) {
              // Document not found, return silently
              return;
            }
            debugLog?.("delete", { error, model, where: transformedWhere });
            throw error;
          }
        },

        deleteMany: async ({ data, model, where }: { data?: Record<string, unknown>; model: string; where: Record<string, unknown> }) => {
          const db = getDatabase(couch, getModelName(model), config);
          const transformedWhere = transformWhereClause({ where: where as any, model: getDefaultModelName(model) });
          const selector = convertWhereToSelector(transformedWhere as unknown);

          try {
            // Find all matching documents
            const result = await db.find({ selector });
            let deletedCount = 0;

            // Delete each document
            for (const doc of result.docs) {
              const couchDoc = doc as CouchDBDocument;
              try {
                await db.destroy(couchDoc._id, couchDoc._rev || "");
                deletedCount++;
              } catch (error: unknown) {
                // Skip if already deleted
                if ((error as { statusCode?: number }).statusCode !== 404) {
                  throw error;
                }
              }
            }

            return deletedCount;
          } catch (error: unknown) {
            debugLog?.("deleteMany", { error, model, where: transformedWhere });
            throw error;
          }
        },

        findOne: async ({ where, model, select }: { where: Record<string, unknown>; model: string; select?: unknown }) => {
          const db = getDatabase(couch, getModelName(model), config);
          const transformedWhere = transformWhereClause({ where: where as any, model: getDefaultModelName(model) });

          try {
            // If where clause has id, use direct get
            const whereRecord = Array.isArray(transformedWhere) ? convertWhereArrayToRecord(transformedWhere) : (transformedWhere as Record<string, unknown> | undefined);
            if (whereRecord?.id) {
              const docId = String(whereRecord.id);
              const doc = (await db.get(docId)) as CouchDBDocument;
              const cleaned = cleanDocument(doc);
              return await (transformOutput as any)(cleaned, [getDefaultModelName(model)], "findOne");
            }

            // Otherwise, use find with selector
            const selector = convertWhereToSelector(transformedWhere as unknown);
            const result = await db.find({ selector, limit: 1 });

            if (result.docs.length === 0) {
              return null;
            }

            const cleaned = cleanDocument(result.docs[0] as CouchDBDocument);
            return await (transformOutput as any)(cleaned, [getDefaultModelName(model)], "findOne");
          } catch (error: unknown) {
            if ((error as { statusCode?: number }).statusCode === 404) {
              return null;
            }
            debugLog?.("findOne", { error, model, where: transformedWhere });
            throw error;
          }
        },

        findMany: async ({ where, model, select, limit, offset, orderBy }: { where: Record<string, unknown>; model: string; select?: unknown; limit?: number; offset?: number; orderBy?: Array<{ field: string; direction: "asc" | "desc" }> }) => {
          const db = getDatabase(couch, getModelName(model), config);
          const transformedWhere = transformWhereClause({ where: where as any, model: getDefaultModelName(model) });
          const selector = convertWhereToSelector(transformedWhere as unknown);

          try {
            const query: {
              selector: MangoSelector;
              limit?: number;
              skip?: number;
              sort?: SortOrder[];
            } = { selector };

            if (limit !== undefined) {
              query.limit = limit;
            }

            if (offset !== undefined) {
              query.skip = offset;
            }

            // Convert orderBy to CouchDB sort format
            if (orderBy && Array.isArray(orderBy) && orderBy.length > 0) {
              query.sort = orderBy.map((order) => {
                const field = getFieldName({ model, field: order.field });
                return { [field]: order.direction === "desc" ? "desc" : "asc" };
              });
            }

            const result = await db.find(query);
            const cleaned = result.docs.map((doc: unknown) => cleanDocument(doc as CouchDBDocument));
            return Promise.all(cleaned.map((doc: Record<string, unknown>) => (transformOutput as any)(doc, [getDefaultModelName(model)], "findMany")));
          } catch (error: unknown) {
            debugLog?.("findMany", { error, model, where: transformedWhere, limit, offset, orderBy });
            throw error;
          }
        },

        count: async ({ where, model }: { where: Record<string, unknown>; model: string }) => {
          const db = getDatabase(couch, getModelName(model), config);
          const transformedWhere = transformWhereClause({ where: where as any, model: getDefaultModelName(model) });
          const selector = convertWhereToSelector(transformedWhere as unknown);

          try {
            const result = await db.find({ selector });
            return result.docs.length;
          } catch (error: unknown) {
            debugLog?.("count", { error, model, where: transformedWhere });
            throw error;
          }
        },
      } as any;
    },
  }) as any;
};
