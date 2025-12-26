import { betterAuth } from "better-auth";
import { couchdbAdapter } from "../../../src";

export const auth = betterAuth({
  baseURL: "http://localhost:3000",
  database: couchdbAdapter({
    url: "http://admin:password@localhost:5984",
    useModelAsDatabase: true,
    debugLogs: true,
  }),
  emailAndPassword: { 
    enabled: true, 
  },
  trustedOrigins: ["http://localhost:3000"],
});