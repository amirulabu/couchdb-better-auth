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
  betterAuthModel?: string; // Model type for shared database filtering
  [key: string]: unknown;
}

/**
 * Convert Where[] array to Record format for convertWhereToSelector
 */
function convertWhereArrayToRecord(whereArray: unknown): Record<string, unknown> | null {
  if (!whereArray || !Array.isArray(whereArray)) {
    return null;
  }

  // Convert Where[] array format to nested object format
  // Process conditions sequentially, grouping consecutive OR conditions
  const conditions: Array<{ field: string; operator: string; value: unknown; connector?: string }> = [];
  for (const condition of whereArray as Array<{ field: string; operator: string; value: unknown; connector?: string }>) {
    if (condition.field) {
      conditions.push(condition);
    }
  }
  
  if (conditions.length === 0) {
    return null;
  }
  
  const finalConditions: unknown[] = [];
  let currentOrGroup: Record<string, unknown>[] | null = null;
  
  for (let i = 0; i < conditions.length; i++) {
    const condition = conditions[i]!;
    const field = condition.field;
    const operator = condition.operator;
    const value = condition.value;
    const connector = condition.connector;
    
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
    
    const conditionObj = { [field]: { [opKey]: value } };
    
    if (connector === "OR") {
      // Add to current OR group
      if (!currentOrGroup) {
        currentOrGroup = [];
      }
      currentOrGroup.push(conditionObj);
    } else {
      // AND connector (or first condition)
      // Close any open OR group first
      if (currentOrGroup) {
        if (currentOrGroup.length === 1) {
          finalConditions.push(currentOrGroup[0]);
        } else {
          finalConditions.push({ OR: currentOrGroup });
        }
        currentOrGroup = null;
      }
      // Add AND condition
      finalConditions.push(conditionObj);
    }
  }
  
  // Close any remaining OR group
  if (currentOrGroup) {
    if (currentOrGroup.length === 1) {
      finalConditions.push(currentOrGroup[0]);
    } else {
      finalConditions.push({ OR: currentOrGroup });
    }
  }
  
  // Build final result
  if (finalConditions.length === 0) {
    return null;
  } else if (finalConditions.length === 1) {
    return finalConditions[0] as Record<string, unknown>;
  } else {
    return { AND: finalConditions };
  }
}

/**
 * Escape a string for safe use in a regular expression
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

  for (const [key, value] of Object.entries(whereRecord)) {
    if (key === "AND" || key === "OR") {
      // Handle AND/OR conditions
      if (Array.isArray(value)) {
        selector[key === "AND" ? "$and" : "$or"] = value.map((item) => convertWhereToSelector(item));
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
          case "contains": {
            // CouchDB uses $regex for contains
            // Note: CouchDB regex is case-sensitive
            const containsPattern = String(opValue);
            operators.$regex = `.*${escapeRegex(containsPattern)}.*`;
            break;
          }
          case "startsWith": {
            const startsPattern = String(opValue);
            operators.$regex = `^${escapeRegex(startsPattern)}.*`;
            break;
          }
          case "endsWith": {
            const endsPattern = String(opValue);
            operators.$regex = `.*${escapeRegex(endsPattern)}$`;
            break;
          }
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
 * Remove CouchDB internal fields from document and prepare for transformOutput
 * Keeps _id for key mapping and adds id field for direct access
 */
function cleanDocumentForTransform(doc: CouchDBDocument): Record<string, unknown> {
  const cleaned = { ...doc };
  delete cleaned._rev;
  delete cleaned.betterAuthModel; // Remove model type field used for filtering
  // Add id field from _id (better-auth expects this)
  if (cleaned._id) {
    cleaned.id = cleaned._id;
  }
  return cleaned;
}

/**
 * Merge original DB fields back into the transformed result.
 * This preserves custom field names that might have been remapped by transformOutput.
 * For example, if schema maps email -> email_address, we need to keep email_address in the result.
 */
function mergeOriginalFields(transformed: Record<string, unknown>, original: Record<string, unknown>): Record<string, unknown> {
  const result = { ...transformed };
  // Copy any fields from original that aren't in the transformed result
  // Skip internal fields like _id, _rev, betterAuthModel
  for (const key of Object.keys(original)) {
    if (key !== '_id' && key !== '_rev' && key !== 'betterAuthModel' && key !== 'id') {
      if (!(key in result) || result[key] === undefined) {
        result[key] = original[key];
      }
    }
  }
  return result;
}

/**
 * Get database instance for a model, ensuring it exists first.
 */
async function getDatabase(
  couch: ServerScope,
  model: string,
  config: CouchDBAdapterConfig
): Promise<DocumentScope<unknown>> {
  const dbName = config.useModelAsDatabase ? model : config.database || "better_auth";

  try {
    // Check if database exists
    await couch.db.get(dbName);
  } catch (error: unknown) {
    // If database does not exist, create it
    if ((error as { statusCode?: number }).statusCode === 404) {
      await couch.db.create(dbName);
    } else {
      throw error;
    }
  }

  if (config.useModelAsDatabase) {
    return couch.use(model);
  }
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
      // Note: Don't use mapKeysTransformOutput for _id -> id mapping
      // Better-auth handles this internally via its schema parsing
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

      // Local logging utilities so we can turn verbose logging on/off via config.debugLogs
      const logsEnabled = Boolean(config.debugLogs);
      const log = (...args: unknown[]) => {
        if (logsEnabled) {
          // eslint-disable-next-line no-console
          console.log(...args);
        }
      };
      const logWarn = (...args: unknown[]) => {
        if (logsEnabled) {
          // eslint-disable-next-line no-console
          console.warn(...args);
        }
      };
      const logError = (...args: unknown[]) => {
        if (logsEnabled) {
          // eslint-disable-next-line no-console
          console.error(...args);
        }
      };

      return {
        create: async ({ data, model, select }: { data: Record<string, unknown>; model: string; select?: unknown }): Promise<any> => {
          // DEBUG: start create
          log("[couchdbAdapter][create] called with:", { model, data, select });
          const db = await getDatabase(couch, getModelName(model), config);
          log("[couchdbAdapter][create] got database for model:", getModelName(model));
          const baseTransformed = await transformInput(data, getDefaultModelName(model), "create");
          // Merge original data with transformed data to preserve custom field names
          // transformInput may drop fields that have been renamed in schema
          const transformedData = { ...data, ...baseTransformed };
          log("[couchdbAdapter][create] transformedData:", transformedData);

          // Ensure _id is set
          if (!transformedData._id && transformedData.id) {
            log("[couchdbAdapter][create] setting _id from id:", transformedData.id);
            transformedData._id = transformedData.id;
          }

          // Add betterAuthModel field when using shared database (useModelAsDatabase=false)
          if (!config.useModelAsDatabase) {
            transformedData.betterAuthModel = getModelName(model);
            log("[couchdbAdapter][create] added betterAuthModel field:", transformedData.betterAuthModel);
          }

          try {
            log("[couchdbAdapter][create] inserting into CouchDB");
            const response = await db.insert(transformedData as CouchDBDocument);
            log("[couchdbAdapter][create] insert response:", response);
            const created = { ...transformedData, _id: response.id, _rev: response.rev };
            log("[couchdbAdapter][create] created doc (pre-fetch):", created);

            // Get the full document if needed
            const fullDoc = await db.get(response.id);
            log("[couchdbAdapter][create] fetched fullDoc:", fullDoc);
            const cleaned = cleanDocumentForTransform(fullDoc as CouchDBDocument);
            log("[couchdbAdapter][create] cleaned doc:", cleaned);
            const transformed = await transformOutput(cleaned, getDefaultModelName(model));
            // Merge back original DB fields to preserve custom field names
            const result = mergeOriginalFields(transformed, cleaned);
            log("[couchdbAdapter][create] result:", result);
            return result;
          } catch (error: unknown) {
            // Handle conflict - if document with same _id exists, delete it and retry
            if ((error as { statusCode?: number }).statusCode === 409 && transformedData._id) {
              logWarn("[couchdbAdapter][create] conflict detected, deleting existing document and retrying:", transformedData._id);
              try {
                const existing = await db.get(transformedData._id);
                await db.destroy(transformedData._id, (existing as CouchDBDocument)._rev || "");
                log("[couchdbAdapter][create] deleted existing document, retrying insert");
                const response = await db.insert(transformedData as CouchDBDocument);
                const fullDoc = await db.get(response.id);
                const cleaned = cleanDocumentForTransform(fullDoc as CouchDBDocument);
                const transformed = await transformOutput(cleaned, getDefaultModelName(model));
                return mergeOriginalFields(transformed, cleaned);
              } catch (retryError: unknown) {
                logError("[couchdbAdapter][create] error during retry:", retryError);
                throw retryError;
              }
            }
            logError("[couchdbAdapter][create] error:", error);
            debugLog?.("create", { error, model, data: transformedData });
            throw error;
          }
        },

        update: async (args: { data?: Record<string, unknown>; update?: Record<string, unknown>; model: string; where: Record<string, unknown>; select?: unknown }): Promise<any> => {
          // Note: better-auth passes update data as "update" not "data"
          const { model, where, select } = args;
          const data = args.update ?? args.data;
          log("[couchdbAdapter][update] called with:", { model, data, where, select });
          const db = await getDatabase(couch, getModelName(model), config);
          log("[couchdbAdapter][update] got database for model:", getModelName(model));
          const transformedWhere = transformWhereClause({ where: where as any, model: getDefaultModelName(model) });
          log("[couchdbAdapter][update] transformedWhere:", transformedWhere);
          const transformedData = await transformInput(data!, getDefaultModelName(model), "update");
          log("[couchdbAdapter][update] transformedData:", transformedData);

          // Get the document ID from where clause
          let docId: string | undefined;
          
          // First try to get ID directly from where array (more reliable)
          if (Array.isArray(transformedWhere)) {
            const idCondition = transformedWhere.find((c: any) => c.field === 'id' || c.field === '_id');
            if (idCondition?.value) {
              log("[couchdbAdapter][update] using id from where array");
              docId = String(idCondition.value);
            }
          }
          
          // Fall back to converted record if no direct ID found
          if (!docId) {
            const whereRecord = Array.isArray(transformedWhere) ? convertWhereArrayToRecord(transformedWhere) : (transformedWhere as Record<string, unknown> | undefined);
            if (whereRecord?.id) {
              log("[couchdbAdapter][update] using whereRecord.id");
              // Handle both direct value and operator object format
              const idVal = whereRecord.id;
              docId = typeof idVal === 'object' && idVal !== null ? String((idVal as any).equals ?? (idVal as any).$eq ?? idVal) : String(idVal);
            } else if (whereRecord?._id) {
              log("[couchdbAdapter][update] using whereRecord._id");
              // Handle both direct value and operator object format
              const idVal = whereRecord._id;
              docId = typeof idVal === 'object' && idVal !== null ? String((idVal as any).equals ?? (idVal as any).$eq ?? idVal) : String(idVal);
            }
          }
          
          if (!docId) {
            log("[couchdbAdapter][update] no direct id/_id in where, performing find() to resolve docId");
            // Try to find the document first
            const selector = convertWhereToSelector(transformedWhere as unknown);
            // Add betterAuthModel filter when using shared database
            if (!config.useModelAsDatabase) {
              selector.betterAuthModel = getModelName(model);
              log("[couchdbAdapter][update] added betterAuthModel filter to selector");
            }
            log("[couchdbAdapter][update] selector for resolving docId:", selector);
            const result = await db.find({ selector, limit: 1 });
            log("[couchdbAdapter][update] find() result for resolving docId:", { docsLength: result.docs.length, docs: result.docs });
            if (result.docs.length === 0) {
              logError("[couchdbAdapter][update] document not found for selector, throwing");
              throw new Error(`Document not found for update in model ${model}`);
            }
            docId = (result.docs[0] as CouchDBDocument)._id;
            log("[couchdbAdapter][update] resolved docId from find():", docId);
          }

          try {
            // Get existing document to preserve _rev
            const existing = (await db.get(docId)) as CouchDBDocument;
            // Verify betterAuthModel matches when using shared database
            if (!config.useModelAsDatabase && existing.betterAuthModel && existing.betterAuthModel !== getModelName(model)) {
              logError("[couchdbAdapter][update] betterAuthModel mismatch, throwing");
              throw new Error(`Document not found for update in model ${model}`);
            }
            log("[couchdbAdapter][update] existing document:", existing);
            const updated = {
              ...existing,
              ...transformedData,
              _id: existing._id,
              _rev: existing._rev,
            };
            log("[couchdbAdapter][update] updated document (to insert):", updated);

            const response = await db.insert(updated);
            log("[couchdbAdapter][update] insert response:", response);
            const result = { ...updated, _rev: response.rev };
            log("[couchdbAdapter][update] result pre-fetch:", result);

            // Get the full updated document
            const fullDoc = await db.get(response.id);
            log("[couchdbAdapter][update] fetched fullDoc:", fullDoc);
            const cleaned = cleanDocumentForTransform(fullDoc as CouchDBDocument);
            log("[couchdbAdapter][update] cleaned doc:", cleaned);
            const transformed = await transformOutput(cleaned, getDefaultModelName(model));
            return mergeOriginalFields(transformed, cleaned);
          } catch (error: unknown) {
            logError("[couchdbAdapter][update] error:", error);
            if ((error as { statusCode?: number }).statusCode === 404) {
              throw new Error(`Document not found: ${docId}`);
            }
            if ((error as { statusCode?: number }).statusCode === 409) {
              // Conflict - retry once
              logWarn("[couchdbAdapter][update] conflict detected, retrying once with fresh document");
              const existing = (await db.get(docId)) as CouchDBDocument;
              log("[couchdbAdapter][update] existing (retry):", existing);
              const updated = {
                ...existing,
                ...transformedData,
                _id: existing._id,
                _rev: existing._rev,
              };
              log("[couchdbAdapter][update] updated (retry) to insert:", updated);
              const response = await db.insert(updated);
              log("[couchdbAdapter][update] insert response (retry):", response);
              const fullDoc = await db.get(response.id);
              log("[couchdbAdapter][update] fetched fullDoc (retry):", fullDoc);
              const cleaned = cleanDocumentForTransform(fullDoc as CouchDBDocument);
              log("[couchdbAdapter][update] cleaned doc (retry):", cleaned);
              const transformed = await transformOutput(cleaned, getDefaultModelName(model));
              return mergeOriginalFields(transformed, cleaned);
            }
            debugLog?.("update", { error, model, where: transformedWhere, data: transformedData });
            throw error;
          }
        },

        updateMany: async (args: { data?: Record<string, unknown>; update?: Record<string, unknown>; model: string; where: Record<string, unknown> }) => {
          // Note: better-auth passes update data as "update" not "data"
          const { model, where } = args;
          const data = args.update ?? args.data;
          log("[couchdbAdapter][updateMany] called with:", { model, data, where });
          const db = await getDatabase(couch, getModelName(model), config);
          log("[couchdbAdapter][updateMany] got database for model:", getModelName(model));
          const transformedWhere = transformWhereClause({ where: where as any, model: getDefaultModelName(model) });
          log("[couchdbAdapter][updateMany] transformedWhere:", transformedWhere);
          if (!data) {
            throw new Error("updateMany requires data or update parameter");
          }
          const transformedData = await transformInput(data, getDefaultModelName(model), "update");
          log("[couchdbAdapter][updateMany] transformedData:", transformedData);
          const selector = convertWhereToSelector(transformedWhere as unknown);
          // Add betterAuthModel filter when using shared database
          if (!config.useModelAsDatabase) {
            selector.betterAuthModel = getModelName(model);
            log("[couchdbAdapter][updateMany] added betterAuthModel filter to selector");
          }
          log("[couchdbAdapter][updateMany] selector:", selector);

          try {
            // Find all matching documents
            const result = await db.find({ selector });
            log("[couchdbAdapter][updateMany] find() result:", { docsLength: result.docs.length, docs: result.docs });
            let updatedCount = 0;

            // Update each document
            for (const doc of result.docs) {
              const couchDoc = doc as CouchDBDocument;
              log("[couchdbAdapter][updateMany] updating single doc:", couchDoc);
              try {
                const updated = {
                  ...couchDoc,
                  ...transformedData,
                  _id: couchDoc._id,
                  _rev: couchDoc._rev,
                };
                log("[couchdbAdapter][updateMany] updated doc to insert:", updated);
                await db.insert(updated);
                log("[couchdbAdapter][updateMany] successfully updated one document");
                updatedCount++;
              } catch (error: unknown) {
                // Skip conflicts and continue
                if ((error as { statusCode?: number }).statusCode !== 409) {
                  logError("[couchdbAdapter][updateMany] non-conflict error while updating doc:", { error, couchDoc });
                  throw error;
                }
                logWarn("[couchdbAdapter][updateMany] conflict while updating doc, skipping", { couchDoc });
              }
            }

            log("[couchdbAdapter][updateMany] total updatedCount:", updatedCount);
            return updatedCount;
          } catch (error: unknown) {
            logError("[couchdbAdapter][updateMany] error:", error);
            debugLog?.("updateMany", { error, model, where: transformedWhere, data: transformedData });
            throw error;
          }
        },

        delete: async ({ data, model, where }: { data?: Record<string, unknown>; model: string; where: Record<string, unknown> }) => {
          log("[couchdbAdapter][delete] called with:", { model, data, where });
          const db = await getDatabase(couch, getModelName(model), config);
          log("[couchdbAdapter][delete] got database for model:", getModelName(model));
          const transformedWhere = transformWhereClause({ where: where as any, model: getDefaultModelName(model) });
          log("[couchdbAdapter][delete] transformedWhere:", transformedWhere);

          // Get the document ID from where clause
          let docId: string | undefined;
          
          // First try to get ID directly from where array (more reliable)
          if (Array.isArray(transformedWhere)) {
            const idCondition = transformedWhere.find((c: any) => c.field === 'id' || c.field === '_id');
            if (idCondition?.value) {
              log("[couchdbAdapter][delete] using id from where array");
              docId = String(idCondition.value);
            }
          }
          
          // Fall back to converted record if no direct ID found
          if (!docId) {
            const whereRecord = Array.isArray(transformedWhere) ? convertWhereArrayToRecord(transformedWhere) : (transformedWhere as Record<string, unknown> | undefined);
            if (whereRecord?.id) {
              log("[couchdbAdapter][delete] using whereRecord.id");
              const idVal = whereRecord.id;
              docId = typeof idVal === 'object' && idVal !== null ? String((idVal as any).equals ?? (idVal as any).$eq ?? idVal) : String(idVal);
            } else if (whereRecord?._id) {
              log("[couchdbAdapter][delete] using whereRecord._id");
              const idVal = whereRecord._id;
              docId = typeof idVal === 'object' && idVal !== null ? String((idVal as any).equals ?? (idVal as any).$eq ?? idVal) : String(idVal);
            }
          }
          
          if (!docId) {
            log("[couchdbAdapter][delete] no direct id/_id in where, performing find() to resolve docId");
            // Try to find the document first
            const selector = convertWhereToSelector(transformedWhere as unknown);
            // Add betterAuthModel filter when using shared database
            if (!config.useModelAsDatabase) {
              selector.betterAuthModel = getModelName(model);
              log("[couchdbAdapter][delete] added betterAuthModel filter to selector");
            }
            log("[couchdbAdapter][delete] selector for resolving docId:", selector);
            const result = await db.find({ selector, limit: 1 });
            log("[couchdbAdapter][delete] find() result for resolving docId:", { docsLength: result.docs.length, docs: result.docs });
            if (result.docs.length === 0) {
              log("[couchdbAdapter][delete] no document found for selector, returning");
              return;
            }
            docId = (result.docs[0] as CouchDBDocument)._id;
            log("[couchdbAdapter][delete] resolved docId from find():", docId);
          }

          try {
            if (!docId) return;
            log("[couchdbAdapter][delete] fetching doc to delete:", docId);
            const doc = (await db.get(docId)) as CouchDBDocument;
            // Verify betterAuthModel matches when using shared database
            if (!config.useModelAsDatabase && doc.betterAuthModel && doc.betterAuthModel !== getModelName(model)) {
              log("[couchdbAdapter][delete] betterAuthModel mismatch, returning silently");
              return;
            }
            log("[couchdbAdapter][delete] fetched doc:", doc);
            await db.destroy(doc._id, doc._rev || "");
            log("[couchdbAdapter][delete] successfully destroyed doc:", docId);
            return;
          } catch (error: unknown) {
            if ((error as { statusCode?: number }).statusCode === 404) {
              // Document not found, return silently
              log("[couchdbAdapter][delete] doc already not found (404), returning silently");
              return;
            }
            logError("[couchdbAdapter][delete] error:", error);
            debugLog?.("delete", { error, model, where: transformedWhere });
            throw error;
          }
        },

        deleteMany: async ({ data, model, where }: { data?: Record<string, unknown>; model: string; where: Record<string, unknown> }) => {
          log("[couchdbAdapter][deleteMany] called with:", { model, data, where });
          const db = await getDatabase(couch, getModelName(model), config);
          log("[couchdbAdapter][deleteMany] got database for model:", getModelName(model));
          const transformedWhere = transformWhereClause({ where: where as any, model: getDefaultModelName(model) });
          log("[couchdbAdapter][deleteMany] transformedWhere:", transformedWhere);
          const selector = convertWhereToSelector(transformedWhere as unknown);
          // Add betterAuthModel filter when using shared database
          if (!config.useModelAsDatabase) {
            selector.betterAuthModel = getModelName(model);
            log("[couchdbAdapter][deleteMany] added betterAuthModel filter to selector");
          }
          log("[couchdbAdapter][deleteMany] selector:", selector);

          try {
            // Find all matching documents
            const result = await db.find({ selector });
            log("[couchdbAdapter][deleteMany] find() result:", { docsLength: result.docs.length, docs: result.docs });
            let deletedCount = 0;

            // Delete each document
            for (const doc of result.docs) {
              const couchDoc = doc as CouchDBDocument;
              log("[couchdbAdapter][deleteMany] deleting single doc:", couchDoc);
              try {
                await db.destroy(couchDoc._id, couchDoc._rev || "");
                log("[couchdbAdapter][deleteMany] successfully destroyed doc:", couchDoc._id);
                deletedCount++;
              } catch (error: unknown) {
                // Skip if already deleted
                if ((error as { statusCode?: number }).statusCode !== 404) {
                  logError("[couchdbAdapter][deleteMany] non-404 error while deleting doc:", { error, couchDoc });
                  throw error;
                }
                log("[couchdbAdapter][deleteMany] doc already deleted (404), skipping:", couchDoc._id);
              }
            }

            log("[couchdbAdapter][deleteMany] total deletedCount:", deletedCount);
            return deletedCount;
          } catch (error: unknown) {
            logError("[couchdbAdapter][deleteMany] error:", error);
            debugLog?.("deleteMany", { error, model, where: transformedWhere });
            throw error;
          }
        },

        findOne: async ({ where, model, select }: { where: Record<string, unknown>; model: string; select?: unknown }) => {
          log("[couchdbAdapter][findOne] called with:", { model, where, select });
          const db = await getDatabase(couch, getModelName(model), config);
          log("[couchdbAdapter][findOne] got database for model:", getModelName(model));
          const transformedWhere = transformWhereClause({ where: where as any, model: getDefaultModelName(model) });
          log("[couchdbAdapter][findOne] transformedWhere:", transformedWhere);

          try {
            // If where clause has id, use direct get
            const whereRecord = Array.isArray(transformedWhere) ? convertWhereArrayToRecord(transformedWhere) : (transformedWhere as Record<string, unknown> | undefined);
            if (whereRecord?.id) {
              log("[couchdbAdapter][findOne] using whereRecord.id shortcut");
              const docId = String(whereRecord.id);
              log("[couchdbAdapter][findOne] fetching by id:", docId);
              const doc = (await db.get(docId)) as CouchDBDocument;
              log("[couchdbAdapter][findOne] fetched doc by id:", doc);
              // Verify betterAuthModel matches when using shared database
              if (!config.useModelAsDatabase && doc.betterAuthModel && doc.betterAuthModel !== getModelName(model)) {
                log("[couchdbAdapter][findOne] betterAuthModel mismatch, returning null");
                return null;
              }
              const cleaned = cleanDocumentForTransform(doc);
              log("[couchdbAdapter][findOne] cleaned doc (by id):", cleaned);
              const transformed = await transformOutput(cleaned, getDefaultModelName(model));
              return mergeOriginalFields(transformed, cleaned);
            }

            // Otherwise, use find with selector
            const selector = convertWhereToSelector(transformedWhere as unknown);
            // Add betterAuthModel filter when using shared database
            if (!config.useModelAsDatabase) {
              selector.betterAuthModel = getModelName(model);
              log("[couchdbAdapter][findOne] added betterAuthModel filter to selector");
            }
            log("[couchdbAdapter][findOne] selector (find):", selector);
            const result = await db.find({ selector, limit: 1 });
            log("[couchdbAdapter][findOne] find() result:", { docsLength: result.docs.length, docs: result.docs });

            if (result.docs.length === 0) {
              log("[couchdbAdapter][findOne] no docs found, returning null");
              return null;
            }

            const cleaned = cleanDocumentForTransform(result.docs[0] as CouchDBDocument);
            log("[couchdbAdapter][findOne] cleaned doc:", cleaned);
            const transformed = await transformOutput(cleaned, getDefaultModelName(model));
            return mergeOriginalFields(transformed, cleaned);
          } catch (error: unknown) {
            if ((error as { statusCode?: number }).statusCode === 404) {
              log("[couchdbAdapter][findOne] 404 while fetching doc, returning null");
              return null;
            }
            logError("[couchdbAdapter][findOne] error:", error);
            debugLog?.("findOne", { error, model, where: transformedWhere });
            throw error;
          }
        },

        findMany: async (args: { where: Record<string, unknown>; model: string; select?: unknown; limit?: number; offset?: number; orderBy?: Array<{ field: string; direction: "asc" | "desc" }>; sortBy?: { field: string; direction: "asc" | "desc" } }) => {
          const { where, model, select, limit, offset, sortBy } = args;
          // better-auth might pass sortBy (object) or orderBy (array)
          const orderBy = args.orderBy || (sortBy ? [sortBy] : undefined);
          log("[couchdbAdapter][findMany] called with:", { model, where, select, limit, offset, orderBy });
          const db = await getDatabase(couch, getModelName(model), config);
          log("[couchdbAdapter][findMany] got database for model:", getModelName(model));
          const transformedWhere = transformWhereClause({ where: where as any, model: getDefaultModelName(model) });
          log("[couchdbAdapter][findMany] transformedWhere:", transformedWhere);
          let selector = convertWhereToSelector(transformedWhere as unknown);
          // Add betterAuthModel filter when using shared database
          if (!config.useModelAsDatabase) {
            // If selector already has $and, add betterAuthModel to it
            if (selector.$and && Array.isArray(selector.$and)) {
              selector.$and.push({ betterAuthModel: getModelName(model) });
            } else if (Object.keys(selector).length > 0) {
              // Wrap existing selector in $and with betterAuthModel
              selector = { $and: [selector, { betterAuthModel: getModelName(model) }] };
            } else {
              // Empty selector, just add betterAuthModel
              selector.betterAuthModel = getModelName(model);
            }
            log("[couchdbAdapter][findMany] added betterAuthModel filter to selector");
          }
          log("[couchdbAdapter][findMany] selector:", selector);

          try {
            const query: {
              selector: MangoSelector;
              limit?: number;
              skip?: number;
              sort?: SortOrder[];
            } = { selector };

            // Convert orderBy to CouchDB sort format (must be before limit/offset)
            if (orderBy && Array.isArray(orderBy) && orderBy.length > 0) {
              query.sort = orderBy.map((order) => {
                const field = getFieldName({ model, field: order.field });
                return { [field]: order.direction === "desc" ? "desc" : "asc" };
              });
              log("[couchdbAdapter][findMany] applied sort:", query.sort);
            }

            if (limit !== undefined) {
              query.limit = limit;
              log("[couchdbAdapter][findMany] applied limit:", limit);
            }

            if (offset !== undefined) {
              query.skip = offset;
              log("[couchdbAdapter][findMany] applied offset (skip):", offset);
            }

            log("[couchdbAdapter][findMany] final query:", query);
            let result: { docs: unknown[]; bookmark?: string };
            let needsInMemorySort = false;
            let needsInMemoryOffset = false;
            try {
              result = await db.find(query);
            } catch (error: unknown) {
              // Handle case where CouchDB can't sort or skip due to missing index
              if ((error as { statusCode?: number; error?: string }).statusCode === 400 && 
                  (error as { error?: string }).error === "no_usable_index") {
                logWarn("[couchdbAdapter][findMany] CouchDB index issue, fetching all and applying sort/offset in memory");
                // Fetch all results without sort/skip, then apply in memory
                const queryWithoutSortSkip = { ...query };
                delete queryWithoutSortSkip.sort;
                delete queryWithoutSortSkip.skip;
                result = await db.find(queryWithoutSortSkip);
                if (query.sort) {
                  needsInMemorySort = true;
                }
                if (query.skip) {
                  needsInMemoryOffset = true;
                }
              } else {
                throw error;
              }
            }
            
            // Apply in-memory sort if needed
            if (needsInMemorySort && orderBy && orderBy.length > 0) {
              log("[couchdbAdapter][findMany] applying in-memory sort");
              result.docs.sort((a: unknown, b: unknown) => {
                for (const order of orderBy) {
                  const field = getFieldName({ model, field: order.field });
                  const aVal = (a as Record<string, unknown>)[field];
                  const bVal = (b as Record<string, unknown>)[field];
                  let comparison = 0;
                  if (aVal === undefined || aVal === null) comparison = 1;
                  else if (bVal === undefined || bVal === null) comparison = -1;
                  else if (aVal < bVal) comparison = -1;
                  else if (aVal > bVal) comparison = 1;
                  if (comparison !== 0) {
                    return order.direction === "desc" ? -comparison : comparison;
                  }
                }
                return 0;
              });
            }
            
            // Apply in-memory offset if needed
            if (needsInMemoryOffset && offset !== undefined && offset > 0) {
              log("[couchdbAdapter][findMany] applying in-memory offset");
              result.docs = result.docs.slice(offset);
            }
            
            log("[couchdbAdapter][findMany] find() result:", { docsLength: result.docs.length, docs: result.docs });
            const cleaned = result.docs.map((doc: unknown) => cleanDocumentForTransform(doc as CouchDBDocument));
            log("[couchdbAdapter][findMany] cleaned docs:", cleaned);
            return Promise.all(cleaned.map(async (doc: Record<string, unknown>) => {
              const transformed = await transformOutput(doc, getDefaultModelName(model));
              return mergeOriginalFields(transformed, doc);
            }));
            
          } catch (error: unknown) {
            logError("[couchdbAdapter][findMany] error:", error);
            debugLog?.("findMany", { error, model, where: transformedWhere, limit, offset, orderBy });
            throw error;
          }
        },

        count: async ({ where, model }: { where: Record<string, unknown>; model: string }) => {
          log("[couchdbAdapter][count] called with:", { model, where });
          const db = await getDatabase(couch, getModelName(model), config);
          log("[couchdbAdapter][count] got database for model:", getModelName(model));
          const transformedWhere = transformWhereClause({ where: where as any, model: getDefaultModelName(model) });
          log("[couchdbAdapter][count] transformedWhere:", transformedWhere);
          const selector = convertWhereToSelector(transformedWhere as unknown);
          // Add betterAuthModel filter when using shared database
          if (!config.useModelAsDatabase) {
            selector.betterAuthModel = getModelName(model);
            log("[couchdbAdapter][count] added betterAuthModel filter to selector");
          }
          log("[couchdbAdapter][count] selector:", selector);

          try {
            // Use pagination with bookmarks to get an accurate count
            let total = 0;
            let bookmark: string | undefined;

            // Reasonable page size to balance performance and memory usage
            const pageSize = 1000;

            // eslint-disable-next-line no-constant-condition
            while (true) {
              const result = await db.find({
                selector,
                limit: pageSize,
                ...(bookmark ? { bookmark } : {}),
              } as any);

              total += result.docs.length;
              log("[couchdbAdapter][count] page result:", {
                docsLength: result.docs.length,
                totalSoFar: total,
                bookmark: result.bookmark,
              });

              if (!result.bookmark || result.docs.length === 0) {
                log("[couchdbAdapter][count] reached end of pages");
                break;
              }

              bookmark = result.bookmark;
            }

            log("[couchdbAdapter][count] final total:", total);
            return total;
          } catch (error: unknown) {
            logError("[couchdbAdapter][count] error:", error);
            debugLog?.("count", { error, model, where: transformedWhere });
            throw error;
          }
        },
      } as any;
    },
  }) as any;
};
