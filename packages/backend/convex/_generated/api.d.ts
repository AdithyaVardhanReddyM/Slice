/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as catalog from "../catalog.js";
import type * as catalogImport from "../catalogImport.js";
import type * as catalogTaste from "../catalogTaste.js";
import type * as conversations from "../conversations.js";
import type * as http from "../http.js";
import type * as pages from "../pages.js";
import type * as pagesAudiences from "../pagesAudiences.js";
import type * as pagesBrands from "../pagesBrands.js";
import type * as pagesCsv from "../pagesCsv.js";
import type * as pagesEvents from "../pagesEvents.js";
import type * as pagesSeed from "../pagesSeed.js";
import type * as pagesTypes from "../pagesTypes.js";
import type * as pagesUploads from "../pagesUploads.js";
import type * as pagesUtil from "../pagesUtil.js";
import type * as qloo from "../qloo.js";
import type * as qlooApi from "../qlooApi.js";
import type * as qlooProbe from "../qlooProbe.js";
import type * as qlooWarmList from "../qlooWarmList.js";
import type * as seedDemo from "../seedDemo.js";
import type * as taste from "../taste.js";
import type * as tasteHints from "../tasteHints.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  catalog: typeof catalog;
  catalogImport: typeof catalogImport;
  catalogTaste: typeof catalogTaste;
  conversations: typeof conversations;
  http: typeof http;
  pages: typeof pages;
  pagesAudiences: typeof pagesAudiences;
  pagesBrands: typeof pagesBrands;
  pagesCsv: typeof pagesCsv;
  pagesEvents: typeof pagesEvents;
  pagesSeed: typeof pagesSeed;
  pagesTypes: typeof pagesTypes;
  pagesUploads: typeof pagesUploads;
  pagesUtil: typeof pagesUtil;
  qloo: typeof qloo;
  qlooApi: typeof qlooApi;
  qlooProbe: typeof qlooProbe;
  qlooWarmList: typeof qlooWarmList;
  seedDemo: typeof seedDemo;
  taste: typeof taste;
  tasteHints: typeof tasteHints;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
