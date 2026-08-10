import {
  __commonJS
} from "./chunk-gnp95nzg.js";

// node_modules/@honcho-ai/sdk/dist/http/errors.js
var require_errors = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.ConnectionError = exports.TimeoutError = exports.ServerError = exports.RateLimitError = exports.NotFoundError = exports.UnprocessableEntityError = exports.ConflictError = exports.PermissionDeniedError = exports.AuthenticationError = exports.BadRequestError = exports.HonchoError = undefined;
  exports.createErrorFromResponse = createErrorFromResponse;

  class HonchoError extends Error {
    constructor(message, status, options) {
      super(message);
      this.name = "HonchoError";
      this.status = status;
      this.code = options?.code;
      this.body = options?.body;
    }
  }
  exports.HonchoError = HonchoError;

  class BadRequestError extends HonchoError {
    constructor(message, body) {
      super(message, 400, { code: "bad_request", body });
      this.name = "BadRequestError";
    }
  }
  exports.BadRequestError = BadRequestError;

  class AuthenticationError extends HonchoError {
    constructor(message = "Authentication failed") {
      super(message, 401, { code: "authentication_error" });
      this.name = "AuthenticationError";
    }
  }
  exports.AuthenticationError = AuthenticationError;

  class PermissionDeniedError extends HonchoError {
    constructor(message = "Permission denied") {
      super(message, 403, { code: "permission_denied" });
      this.name = "PermissionDeniedError";
    }
  }
  exports.PermissionDeniedError = PermissionDeniedError;

  class ConflictError extends HonchoError {
    constructor(message = "Resource conflict", body) {
      super(message, 409, { code: "conflict", body });
      this.name = "ConflictError";
    }
  }
  exports.ConflictError = ConflictError;

  class UnprocessableEntityError extends HonchoError {
    constructor(message = "Unprocessable entity", body) {
      super(message, 422, { code: "unprocessable_entity", body });
      this.name = "UnprocessableEntityError";
    }
  }
  exports.UnprocessableEntityError = UnprocessableEntityError;

  class NotFoundError extends HonchoError {
    constructor(message = "Resource not found") {
      super(message, 404, { code: "not_found" });
      this.name = "NotFoundError";
    }
  }
  exports.NotFoundError = NotFoundError;

  class RateLimitError extends HonchoError {
    constructor(message = "Rate limit exceeded", retryAfter) {
      super(message, 429, { code: "rate_limit_exceeded" });
      this.name = "RateLimitError";
      this.retryAfter = retryAfter;
    }
  }
  exports.RateLimitError = RateLimitError;

  class ServerError extends HonchoError {
    constructor(message = "Server error", status = 500) {
      super(message, status, { code: "server_error" });
      this.name = "ServerError";
    }
  }
  exports.ServerError = ServerError;

  class TimeoutError extends HonchoError {
    constructor(message = "Request timed out") {
      super(message, 0, { code: "timeout" });
      this.name = "TimeoutError";
    }
  }
  exports.TimeoutError = TimeoutError;

  class ConnectionError extends HonchoError {
    constructor(message = "Connection failed") {
      super(message, 0, { code: "connection_error" });
      this.name = "ConnectionError";
    }
  }
  exports.ConnectionError = ConnectionError;
  function createErrorFromResponse(status, message, body, retryAfter) {
    switch (status) {
      case 400:
        return new BadRequestError(message, body);
      case 401:
        return new AuthenticationError(message);
      case 403:
        return new PermissionDeniedError(message);
      case 404:
        return new NotFoundError(message);
      case 409:
        return new ConflictError(message, body);
      case 422:
        return new UnprocessableEntityError(message, body);
      case 429:
        return new RateLimitError(message, retryAfter);
      default:
        if (status >= 500) {
          return new ServerError(message, status);
        }
        return new HonchoError(message, status, { body });
    }
  }
});

// node_modules/@honcho-ai/sdk/dist/message.js
var require_message = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.Message = undefined;

  class Message {
    constructor(id, content, peerId, sessionId, workspaceId, metadata, createdAt, tokenCount) {
      this.id = id;
      this.content = content;
      this.peerId = peerId;
      this.sessionId = sessionId;
      this.workspaceId = workspaceId;
      this.metadata = metadata;
      this.createdAt = createdAt;
      this.tokenCount = tokenCount;
    }
    static fromApiResponse(data) {
      return new Message(data.id, data.content, data.peer_id, data.session_id, data.workspace_id, data.metadata, data.created_at, data.token_count);
    }
    toString() {
      const truncatedContent = this.content.length > 50 ? `${this.content.slice(0, 50)}...` : this.content;
      return `Message(id='${this.id}', peerId='${this.peerId}', content='${truncatedContent}')`;
    }
  }
  exports.Message = Message;
});

// node_modules/@honcho-ai/sdk/dist/pagination.js
var require_pagination = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.Page = undefined;

  class Page {
    constructor(data, transformFunc, fetchNextPage) {
      this._data = data;
      this._transformFunc = transformFunc;
      this._fetchNextPage = fetchNextPage;
    }
    static from(data, fetchNextPage) {
      return new Page(data, undefined, fetchNextPage);
    }
    static fromWithTransform(data, transformFunc, fetchNextPage) {
      return new Page(data, transformFunc, fetchNextPage);
    }
    async* [Symbol.asyncIterator]() {
      for (const item of this._data.items) {
        yield this._transformFunc ? this._transformFunc(item) : item;
      }
      let currentPage = this;
      while (currentPage.hasNextPage) {
        const nextPage = await currentPage.getNextPage();
        if (!nextPage)
          break;
        currentPage = nextPage;
        for (const item of nextPage._data.items) {
          yield nextPage._transformFunc ? nextPage._transformFunc(item) : item;
        }
      }
    }
    get(index) {
      const items = this._data.items || [];
      if (index < 0 || index >= items.length) {
        throw new RangeError(`Index ${index} is out of bounds for page with ${items.length} items`);
      }
      const item = items[index];
      return this._transformFunc ? this._transformFunc(item) : item;
    }
    get length() {
      return this._data.items?.length ?? 0;
    }
    get items() {
      const items = this._data.items || [];
      return this._transformFunc ? items.map(this._transformFunc) : items;
    }
    get total() {
      return this._data.total;
    }
    get page() {
      return this._data.page;
    }
    get size() {
      return this._data.size;
    }
    get pages() {
      return this._data.pages;
    }
    get hasNextPage() {
      return this._data.page < this._data.pages;
    }
    async getNextPage() {
      if (!this.hasNextPage || !this._fetchNextPage) {
        return null;
      }
      const nextPageData = await this._fetchNextPage(this._data.page + 1, this._data.size);
      return new Page(nextPageData, this._transformFunc, this._fetchNextPage);
    }
    async toArray() {
      const allItems = [];
      for await (const item of this) {
        allItems.push(item);
      }
      return allItems;
    }
  }
  exports.Page = Page;
});

// node_modules/@honcho-ai/sdk/dist/api-version.js
var require_api_version = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.API_VERSION = undefined;
  exports.API_VERSION = "v3";
});

// node_modules/zod/v4/core/core.cjs
var require_core = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.globalConfig = exports.$ZodAsyncError = exports.$brand = exports.NEVER = undefined;
  exports.$constructor = $constructor;
  exports.config = config;
  exports.NEVER = Object.freeze({
    status: "aborted"
  });
  function $constructor(name, initializer, params) {
    function init(inst, def) {
      var _a;
      Object.defineProperty(inst, "_zod", {
        value: inst._zod ?? {},
        enumerable: false
      });
      (_a = inst._zod).traits ?? (_a.traits = new Set);
      inst._zod.traits.add(name);
      initializer(inst, def);
      for (const k in _.prototype) {
        if (!(k in inst))
          Object.defineProperty(inst, k, { value: _.prototype[k].bind(inst) });
      }
      inst._zod.constr = _;
      inst._zod.def = def;
    }
    const Parent = params?.Parent ?? Object;

    class Definition extends Parent {
    }
    Object.defineProperty(Definition, "name", { value: name });
    function _(def) {
      var _a;
      const inst = params?.Parent ? new Definition : this;
      init(inst, def);
      (_a = inst._zod).deferred ?? (_a.deferred = []);
      for (const fn of inst._zod.deferred) {
        fn();
      }
      return inst;
    }
    Object.defineProperty(_, "init", { value: init });
    Object.defineProperty(_, Symbol.hasInstance, {
      value: (inst) => {
        if (params?.Parent && inst instanceof params.Parent)
          return true;
        return inst?._zod?.traits?.has(name);
      }
    });
    Object.defineProperty(_, "name", { value: name });
    return _;
  }
  exports.$brand = Symbol("zod_brand");

  class $ZodAsyncError extends Error {
    constructor() {
      super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
    }
  }
  exports.$ZodAsyncError = $ZodAsyncError;
  exports.globalConfig = {};
  function config(newConfig) {
    if (newConfig)
      Object.assign(exports.globalConfig, newConfig);
    return exports.globalConfig;
  }
});

// node_modules/zod/v4/core/util.cjs
var require_util = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.Class = exports.BIGINT_FORMAT_RANGES = exports.NUMBER_FORMAT_RANGES = exports.primitiveTypes = exports.propertyKeyTypes = exports.getParsedType = exports.allowsEval = exports.captureStackTrace = undefined;
  exports.assertEqual = assertEqual;
  exports.assertNotEqual = assertNotEqual;
  exports.assertIs = assertIs;
  exports.assertNever = assertNever;
  exports.assert = assert;
  exports.getEnumValues = getEnumValues;
  exports.joinValues = joinValues;
  exports.jsonStringifyReplacer = jsonStringifyReplacer;
  exports.cached = cached;
  exports.nullish = nullish;
  exports.cleanRegex = cleanRegex;
  exports.floatSafeRemainder = floatSafeRemainder;
  exports.defineLazy = defineLazy;
  exports.assignProp = assignProp;
  exports.getElementAtPath = getElementAtPath;
  exports.promiseAllObject = promiseAllObject;
  exports.randomString = randomString;
  exports.esc = esc;
  exports.isObject = isObject;
  exports.isPlainObject = isPlainObject;
  exports.numKeys = numKeys;
  exports.escapeRegex = escapeRegex;
  exports.clone = clone;
  exports.normalizeParams = normalizeParams;
  exports.createTransparentProxy = createTransparentProxy;
  exports.stringifyPrimitive = stringifyPrimitive;
  exports.optionalKeys = optionalKeys;
  exports.pick = pick;
  exports.omit = omit;
  exports.extend = extend;
  exports.merge = merge;
  exports.partial = partial;
  exports.required = required;
  exports.aborted = aborted;
  exports.prefixIssues = prefixIssues;
  exports.unwrapMessage = unwrapMessage;
  exports.finalizeIssue = finalizeIssue;
  exports.getSizableOrigin = getSizableOrigin;
  exports.getLengthableOrigin = getLengthableOrigin;
  exports.issue = issue;
  exports.cleanEnum = cleanEnum;
  function assertEqual(val) {
    return val;
  }
  function assertNotEqual(val) {
    return val;
  }
  function assertIs(_arg) {}
  function assertNever(_x) {
    throw new Error;
  }
  function assert(_) {}
  function getEnumValues(entries) {
    const numericValues = Object.values(entries).filter((v) => typeof v === "number");
    const values = Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
    return values;
  }
  function joinValues(array, separator = "|") {
    return array.map((val) => stringifyPrimitive(val)).join(separator);
  }
  function jsonStringifyReplacer(_, value) {
    if (typeof value === "bigint")
      return value.toString();
    return value;
  }
  function cached(getter) {
    const set = false;
    return {
      get value() {
        if (!set) {
          const value = getter();
          Object.defineProperty(this, "value", { value });
          return value;
        }
        throw new Error("cached value already set");
      }
    };
  }
  function nullish(input) {
    return input === null || input === undefined;
  }
  function cleanRegex(source) {
    const start = source.startsWith("^") ? 1 : 0;
    const end = source.endsWith("$") ? source.length - 1 : source.length;
    return source.slice(start, end);
  }
  function floatSafeRemainder(val, step) {
    const valDecCount = (val.toString().split(".")[1] || "").length;
    const stepDecCount = (step.toString().split(".")[1] || "").length;
    const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
    const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
    const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
    return valInt % stepInt / 10 ** decCount;
  }
  function defineLazy(object, key, getter) {
    const set = false;
    Object.defineProperty(object, key, {
      get() {
        if (!set) {
          const value = getter();
          object[key] = value;
          return value;
        }
        throw new Error("cached value already set");
      },
      set(v) {
        Object.defineProperty(object, key, {
          value: v
        });
      },
      configurable: true
    });
  }
  function assignProp(target, prop, value) {
    Object.defineProperty(target, prop, {
      value,
      writable: true,
      enumerable: true,
      configurable: true
    });
  }
  function getElementAtPath(obj, path) {
    if (!path)
      return obj;
    return path.reduce((acc, key) => acc?.[key], obj);
  }
  function promiseAllObject(promisesObj) {
    const keys = Object.keys(promisesObj);
    const promises = keys.map((key) => promisesObj[key]);
    return Promise.all(promises).then((results) => {
      const resolvedObj = {};
      for (let i = 0;i < keys.length; i++) {
        resolvedObj[keys[i]] = results[i];
      }
      return resolvedObj;
    });
  }
  function randomString(length = 10) {
    const chars = "abcdefghijklmnopqrstuvwxyz";
    let str = "";
    for (let i = 0;i < length; i++) {
      str += chars[Math.floor(Math.random() * chars.length)];
    }
    return str;
  }
  function esc(str) {
    return JSON.stringify(str);
  }
  exports.captureStackTrace = Error.captureStackTrace ? Error.captureStackTrace : (..._args) => {};
  function isObject(data) {
    return typeof data === "object" && data !== null && !Array.isArray(data);
  }
  exports.allowsEval = cached(() => {
    if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
      return false;
    }
    try {
      const F = Function;
      new F("");
      return true;
    } catch (_) {
      return false;
    }
  });
  function isPlainObject(o) {
    if (isObject(o) === false)
      return false;
    const ctor = o.constructor;
    if (ctor === undefined)
      return true;
    const prot = ctor.prototype;
    if (isObject(prot) === false)
      return false;
    if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
      return false;
    }
    return true;
  }
  function numKeys(data) {
    let keyCount = 0;
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        keyCount++;
      }
    }
    return keyCount;
  }
  var getParsedType = (data) => {
    const t = typeof data;
    switch (t) {
      case "undefined":
        return "undefined";
      case "string":
        return "string";
      case "number":
        return Number.isNaN(data) ? "nan" : "number";
      case "boolean":
        return "boolean";
      case "function":
        return "function";
      case "bigint":
        return "bigint";
      case "symbol":
        return "symbol";
      case "object":
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
          return "promise";
        }
        if (typeof Map !== "undefined" && data instanceof Map) {
          return "map";
        }
        if (typeof Set !== "undefined" && data instanceof Set) {
          return "set";
        }
        if (typeof Date !== "undefined" && data instanceof Date) {
          return "date";
        }
        if (typeof File !== "undefined" && data instanceof File) {
          return "file";
        }
        return "object";
      default:
        throw new Error(`Unknown data type: ${t}`);
    }
  };
  exports.getParsedType = getParsedType;
  exports.propertyKeyTypes = new Set(["string", "number", "symbol"]);
  exports.primitiveTypes = new Set(["string", "number", "bigint", "boolean", "symbol", "undefined"]);
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function clone(inst, def, params) {
    const cl = new inst._zod.constr(def ?? inst._zod.def);
    if (!def || params?.parent)
      cl._zod.parent = inst;
    return cl;
  }
  function normalizeParams(_params) {
    const params = _params;
    if (!params)
      return {};
    if (typeof params === "string")
      return { error: () => params };
    if (params?.message !== undefined) {
      if (params?.error !== undefined)
        throw new Error("Cannot specify both `message` and `error` params");
      params.error = params.message;
    }
    delete params.message;
    if (typeof params.error === "string")
      return { ...params, error: () => params.error };
    return params;
  }
  function createTransparentProxy(getter) {
    let target;
    return new Proxy({}, {
      get(_, prop, receiver) {
        target ?? (target = getter());
        return Reflect.get(target, prop, receiver);
      },
      set(_, prop, value, receiver) {
        target ?? (target = getter());
        return Reflect.set(target, prop, value, receiver);
      },
      has(_, prop) {
        target ?? (target = getter());
        return Reflect.has(target, prop);
      },
      deleteProperty(_, prop) {
        target ?? (target = getter());
        return Reflect.deleteProperty(target, prop);
      },
      ownKeys(_) {
        target ?? (target = getter());
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(_, prop) {
        target ?? (target = getter());
        return Reflect.getOwnPropertyDescriptor(target, prop);
      },
      defineProperty(_, prop, descriptor) {
        target ?? (target = getter());
        return Reflect.defineProperty(target, prop, descriptor);
      }
    });
  }
  function stringifyPrimitive(value) {
    if (typeof value === "bigint")
      return value.toString() + "n";
    if (typeof value === "string")
      return `"${value}"`;
    return `${value}`;
  }
  function optionalKeys(shape) {
    return Object.keys(shape).filter((k) => {
      return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
    });
  }
  exports.NUMBER_FORMAT_RANGES = {
    safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    int32: [-2147483648, 2147483647],
    uint32: [0, 4294967295],
    float32: [-340282346638528860000000000000000000000, 340282346638528860000000000000000000000],
    float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
  };
  exports.BIGINT_FORMAT_RANGES = {
    int64: [/* @__PURE__ */ BigInt("-9223372036854775808"), /* @__PURE__ */ BigInt("9223372036854775807")],
    uint64: [/* @__PURE__ */ BigInt(0), /* @__PURE__ */ BigInt("18446744073709551615")]
  };
  function pick(schema, mask) {
    const newShape = {};
    const currDef = schema._zod.def;
    for (const key in mask) {
      if (!(key in currDef.shape)) {
        throw new Error(`Unrecognized key: "${key}"`);
      }
      if (!mask[key])
        continue;
      newShape[key] = currDef.shape[key];
    }
    return clone(schema, {
      ...schema._zod.def,
      shape: newShape,
      checks: []
    });
  }
  function omit(schema, mask) {
    const newShape = { ...schema._zod.def.shape };
    const currDef = schema._zod.def;
    for (const key in mask) {
      if (!(key in currDef.shape)) {
        throw new Error(`Unrecognized key: "${key}"`);
      }
      if (!mask[key])
        continue;
      delete newShape[key];
    }
    return clone(schema, {
      ...schema._zod.def,
      shape: newShape,
      checks: []
    });
  }
  function extend(schema, shape) {
    if (!isPlainObject(shape)) {
      throw new Error("Invalid input to extend: expected a plain object");
    }
    const def = {
      ...schema._zod.def,
      get shape() {
        const _shape = { ...schema._zod.def.shape, ...shape };
        assignProp(this, "shape", _shape);
        return _shape;
      },
      checks: []
    };
    return clone(schema, def);
  }
  function merge(a, b) {
    return clone(a, {
      ...a._zod.def,
      get shape() {
        const _shape = { ...a._zod.def.shape, ...b._zod.def.shape };
        assignProp(this, "shape", _shape);
        return _shape;
      },
      catchall: b._zod.def.catchall,
      checks: []
    });
  }
  function partial(Class2, schema, mask) {
    const oldShape = schema._zod.def.shape;
    const shape = { ...oldShape };
    if (mask) {
      for (const key in mask) {
        if (!(key in oldShape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        shape[key] = Class2 ? new Class2({
          type: "optional",
          innerType: oldShape[key]
        }) : oldShape[key];
      }
    } else {
      for (const key in oldShape) {
        shape[key] = Class2 ? new Class2({
          type: "optional",
          innerType: oldShape[key]
        }) : oldShape[key];
      }
    }
    return clone(schema, {
      ...schema._zod.def,
      shape,
      checks: []
    });
  }
  function required(Class2, schema, mask) {
    const oldShape = schema._zod.def.shape;
    const shape = { ...oldShape };
    if (mask) {
      for (const key in mask) {
        if (!(key in shape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        shape[key] = new Class2({
          type: "nonoptional",
          innerType: oldShape[key]
        });
      }
    } else {
      for (const key in oldShape) {
        shape[key] = new Class2({
          type: "nonoptional",
          innerType: oldShape[key]
        });
      }
    }
    return clone(schema, {
      ...schema._zod.def,
      shape,
      checks: []
    });
  }
  function aborted(x, startIndex = 0) {
    for (let i = startIndex;i < x.issues.length; i++) {
      if (x.issues[i]?.continue !== true)
        return true;
    }
    return false;
  }
  function prefixIssues(path, issues) {
    return issues.map((iss) => {
      var _a;
      (_a = iss).path ?? (_a.path = []);
      iss.path.unshift(path);
      return iss;
    });
  }
  function unwrapMessage(message) {
    return typeof message === "string" ? message : message?.message;
  }
  function finalizeIssue(iss, ctx, config) {
    const full = { ...iss, path: iss.path ?? [] };
    if (!iss.message) {
      const message = unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
      full.message = message;
    }
    delete full.inst;
    delete full.continue;
    if (!ctx?.reportInput) {
      delete full.input;
    }
    return full;
  }
  function getSizableOrigin(input) {
    if (input instanceof Set)
      return "set";
    if (input instanceof Map)
      return "map";
    if (input instanceof File)
      return "file";
    return "unknown";
  }
  function getLengthableOrigin(input) {
    if (Array.isArray(input))
      return "array";
    if (typeof input === "string")
      return "string";
    return "unknown";
  }
  function issue(...args) {
    const [iss, input, inst] = args;
    if (typeof iss === "string") {
      return {
        message: iss,
        code: "custom",
        input,
        inst
      };
    }
    return { ...iss };
  }
  function cleanEnum(obj) {
    return Object.entries(obj).filter(([k, _]) => {
      return Number.isNaN(Number.parseInt(k, 10));
    }).map((el) => el[1]);
  }

  class Class {
    constructor(..._args) {}
  }
  exports.Class = Class;
});

// node_modules/zod/v4/core/errors.cjs
var require_errors2 = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.$ZodRealError = exports.$ZodError = undefined;
  exports.flattenError = flattenError;
  exports.formatError = formatError;
  exports.treeifyError = treeifyError;
  exports.toDotPath = toDotPath;
  exports.prettifyError = prettifyError;
  var core_js_1 = require_core();
  var util = __importStar(require_util());
  var initializer = (inst, def) => {
    inst.name = "$ZodError";
    Object.defineProperty(inst, "_zod", {
      value: inst._zod,
      enumerable: false
    });
    Object.defineProperty(inst, "issues", {
      value: def,
      enumerable: false
    });
    Object.defineProperty(inst, "message", {
      get() {
        return JSON.stringify(def, util.jsonStringifyReplacer, 2);
      },
      enumerable: true
    });
    Object.defineProperty(inst, "toString", {
      value: () => inst.message,
      enumerable: false
    });
  };
  exports.$ZodError = (0, core_js_1.$constructor)("$ZodError", initializer);
  exports.$ZodRealError = (0, core_js_1.$constructor)("$ZodError", initializer, { Parent: Error });
  function flattenError(error, mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of error.issues) {
      if (sub.path.length > 0) {
        fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
        fieldErrors[sub.path[0]].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  function formatError(error, _mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error2) => {
      for (const issue of error2.issues) {
        if (issue.code === "invalid_union" && issue.errors.length) {
          issue.errors.map((issues) => processError({ issues }));
        } else if (issue.code === "invalid_key") {
          processError({ issues: issue.issues });
        } else if (issue.code === "invalid_element") {
          processError({ issues: issue.issues });
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(error);
    return fieldErrors;
  }
  function treeifyError(error, _mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const result = { errors: [] };
    const processError = (error2, path = []) => {
      var _a, _b;
      for (const issue of error2.issues) {
        if (issue.code === "invalid_union" && issue.errors.length) {
          issue.errors.map((issues) => processError({ issues }, issue.path));
        } else if (issue.code === "invalid_key") {
          processError({ issues: issue.issues }, issue.path);
        } else if (issue.code === "invalid_element") {
          processError({ issues: issue.issues }, issue.path);
        } else {
          const fullpath = [...path, ...issue.path];
          if (fullpath.length === 0) {
            result.errors.push(mapper(issue));
            continue;
          }
          let curr = result;
          let i = 0;
          while (i < fullpath.length) {
            const el = fullpath[i];
            const terminal = i === fullpath.length - 1;
            if (typeof el === "string") {
              curr.properties ?? (curr.properties = {});
              (_a = curr.properties)[el] ?? (_a[el] = { errors: [] });
              curr = curr.properties[el];
            } else {
              curr.items ?? (curr.items = []);
              (_b = curr.items)[el] ?? (_b[el] = { errors: [] });
              curr = curr.items[el];
            }
            if (terminal) {
              curr.errors.push(mapper(issue));
            }
            i++;
          }
        }
      }
    };
    processError(error);
    return result;
  }
  function toDotPath(path) {
    const segs = [];
    for (const seg of path) {
      if (typeof seg === "number")
        segs.push(`[${seg}]`);
      else if (typeof seg === "symbol")
        segs.push(`[${JSON.stringify(String(seg))}]`);
      else if (/[^\w$]/.test(seg))
        segs.push(`[${JSON.stringify(seg)}]`);
      else {
        if (segs.length)
          segs.push(".");
        segs.push(seg);
      }
    }
    return segs.join("");
  }
  function prettifyError(error) {
    const lines = [];
    const issues = [...error.issues].sort((a, b) => a.path.length - b.path.length);
    for (const issue of issues) {
      lines.push(`✖ ${issue.message}`);
      if (issue.path?.length)
        lines.push(`  → at ${toDotPath(issue.path)}`);
    }
    return lines.join(`
`);
  }
});

// node_modules/zod/v4/core/parse.cjs
var require_parse = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.safeParseAsync = exports._safeParseAsync = exports.safeParse = exports._safeParse = exports.parseAsync = exports._parseAsync = exports.parse = exports._parse = undefined;
  var core = __importStar(require_core());
  var errors = __importStar(require_errors2());
  var util = __importStar(require_util());
  var _parse = (_Err) => (schema, value, _ctx, _params) => {
    const ctx = _ctx ? Object.assign(_ctx, { async: false }) : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
      throw new core.$ZodAsyncError;
    }
    if (result.issues.length) {
      const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => util.finalizeIssue(iss, ctx, core.config())));
      util.captureStackTrace(e, _params?.callee);
      throw e;
    }
    return result.value;
  };
  exports._parse = _parse;
  exports.parse = (0, exports._parse)(errors.$ZodRealError);
  var _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
    const ctx = _ctx ? Object.assign(_ctx, { async: true }) : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
      result = await result;
    if (result.issues.length) {
      const e = new (params?.Err ?? _Err)(result.issues.map((iss) => util.finalizeIssue(iss, ctx, core.config())));
      util.captureStackTrace(e, params?.callee);
      throw e;
    }
    return result.value;
  };
  exports._parseAsync = _parseAsync;
  exports.parseAsync = (0, exports._parseAsync)(errors.$ZodRealError);
  var _safeParse = (_Err) => (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
      throw new core.$ZodAsyncError;
    }
    return result.issues.length ? {
      success: false,
      error: new (_Err ?? errors.$ZodError)(result.issues.map((iss) => util.finalizeIssue(iss, ctx, core.config())))
    } : { success: true, data: result.value };
  };
  exports._safeParse = _safeParse;
  exports.safeParse = (0, exports._safeParse)(errors.$ZodRealError);
  var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
    const ctx = _ctx ? Object.assign(_ctx, { async: true }) : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
      result = await result;
    return result.issues.length ? {
      success: false,
      error: new _Err(result.issues.map((iss) => util.finalizeIssue(iss, ctx, core.config())))
    } : { success: true, data: result.value };
  };
  exports._safeParseAsync = _safeParseAsync;
  exports.safeParseAsync = (0, exports._safeParseAsync)(errors.$ZodRealError);
});

// node_modules/zod/v4/core/regexes.cjs
var require_regexes = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.uppercase = exports.lowercase = exports.undefined = exports.null = exports.boolean = exports.number = exports.integer = exports.bigint = exports.string = exports.date = exports.e164 = exports.domain = exports.hostname = exports.base64url = exports.base64 = exports.cidrv6 = exports.cidrv4 = exports.ipv6 = exports.ipv4 = exports.browserEmail = exports.unicodeEmail = exports.rfc5322Email = exports.html5Email = exports.email = exports.uuid7 = exports.uuid6 = exports.uuid4 = exports.uuid = exports.guid = exports.extendedDuration = exports.duration = exports.nanoid = exports.ksuid = exports.xid = exports.ulid = exports.cuid2 = exports.cuid = undefined;
  exports.emoji = emoji;
  exports.time = time;
  exports.datetime = datetime;
  exports.cuid = /^[cC][^\s-]{8,}$/;
  exports.cuid2 = /^[0-9a-z]+$/;
  exports.ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
  exports.xid = /^[0-9a-vA-V]{20}$/;
  exports.ksuid = /^[A-Za-z0-9]{27}$/;
  exports.nanoid = /^[a-zA-Z0-9_-]{21}$/;
  exports.duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
  exports.extendedDuration = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
  exports.guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
  var uuid = (version) => {
    if (!version)
      return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000)$/;
    return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
  };
  exports.uuid = uuid;
  exports.uuid4 = (0, exports.uuid)(4);
  exports.uuid6 = (0, exports.uuid)(6);
  exports.uuid7 = (0, exports.uuid)(7);
  exports.email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
  exports.html5Email = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  exports.rfc5322Email = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  exports.unicodeEmail = /^[^\s@"]{1,64}@[^\s@]{1,255}$/u;
  exports.browserEmail = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  var _emoji = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
  function emoji() {
    return new RegExp(_emoji, "u");
  }
  exports.ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
  exports.ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})$/;
  exports.cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
  exports.cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
  exports.base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
  exports.base64url = /^[A-Za-z0-9_-]*$/;
  exports.hostname = /^([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+$/;
  exports.domain = /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  exports.e164 = /^\+(?:[0-9]){6,14}[0-9]$/;
  var dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
  exports.date = new RegExp(`^${dateSource}$`);
  function timeSource(args) {
    const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
    const regex = typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
    return regex;
  }
  function time(args) {
    return new RegExp(`^${timeSource(args)}$`);
  }
  function datetime(args) {
    const time2 = timeSource({ precision: args.precision });
    const opts = ["Z"];
    if (args.local)
      opts.push("");
    if (args.offset)
      opts.push(`([+-]\\d{2}:\\d{2})`);
    const timeRegex = `${time2}(?:${opts.join("|")})`;
    return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
  }
  var string = (params) => {
    const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
    return new RegExp(`^${regex}$`);
  };
  exports.string = string;
  exports.bigint = /^\d+n?$/;
  exports.integer = /^\d+$/;
  exports.number = /^-?\d+(?:\.\d+)?/i;
  exports.boolean = /true|false/i;
  var _null = /null/i;
  exports.null = _null;
  var _undefined = /undefined/i;
  exports.undefined = _undefined;
  exports.lowercase = /^[^A-Z]*$/;
  exports.uppercase = /^[^a-z]*$/;
});

// node_modules/zod/v4/core/checks.cjs
var require_checks = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.$ZodCheckOverwrite = exports.$ZodCheckMimeType = exports.$ZodCheckProperty = exports.$ZodCheckEndsWith = exports.$ZodCheckStartsWith = exports.$ZodCheckIncludes = exports.$ZodCheckUpperCase = exports.$ZodCheckLowerCase = exports.$ZodCheckRegex = exports.$ZodCheckStringFormat = exports.$ZodCheckLengthEquals = exports.$ZodCheckMinLength = exports.$ZodCheckMaxLength = exports.$ZodCheckSizeEquals = exports.$ZodCheckMinSize = exports.$ZodCheckMaxSize = exports.$ZodCheckBigIntFormat = exports.$ZodCheckNumberFormat = exports.$ZodCheckMultipleOf = exports.$ZodCheckGreaterThan = exports.$ZodCheckLessThan = exports.$ZodCheck = undefined;
  var core = __importStar(require_core());
  var regexes = __importStar(require_regexes());
  var util = __importStar(require_util());
  exports.$ZodCheck = core.$constructor("$ZodCheck", (inst, def) => {
    var _a;
    inst._zod ?? (inst._zod = {});
    inst._zod.def = def;
    (_a = inst._zod).onattach ?? (_a.onattach = []);
  });
  var numericOriginMap = {
    number: "number",
    bigint: "bigint",
    object: "date"
  };
  exports.$ZodCheckLessThan = core.$constructor("$ZodCheckLessThan", (inst, def) => {
    exports.$ZodCheck.init(inst, def);
    const origin = numericOriginMap[typeof def.value];
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
      if (def.value < curr) {
        if (def.inclusive)
          bag.maximum = def.value;
        else
          bag.exclusiveMaximum = def.value;
      }
    });
    inst._zod.check = (payload) => {
      if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
        return;
      }
      payload.issues.push({
        origin,
        code: "too_big",
        maximum: def.value,
        input: payload.value,
        inclusive: def.inclusive,
        inst,
        continue: !def.abort
      });
    };
  });
  exports.$ZodCheckGreaterThan = core.$constructor("$ZodCheckGreaterThan", (inst, def) => {
    exports.$ZodCheck.init(inst, def);
    const origin = numericOriginMap[typeof def.value];
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
      if (def.value > curr) {
        if (def.inclusive)
          bag.minimum = def.value;
        else
          bag.exclusiveMinimum = def.value;
      }
    });
    inst._zod.check = (payload) => {
      if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
        return;
      }
      payload.issues.push({
        origin,
        code: "too_small",
        minimum: def.value,
        input: payload.value,
        inclusive: def.inclusive,
        inst,
        continue: !def.abort
      });
    };
  });
  exports.$ZodCheckMultipleOf = /* @__PURE__ */ core.$constructor("$ZodCheckMultipleOf", (inst, def) => {
    exports.$ZodCheck.init(inst, def);
    inst._zod.onattach.push((inst2) => {
      var _a;
      (_a = inst2._zod.bag).multipleOf ?? (_a.multipleOf = def.value);
    });
    inst._zod.check = (payload) => {
      if (typeof payload.value !== typeof def.value)
        throw new Error("Cannot mix number and bigint in multiple_of check.");
      const isMultiple = typeof payload.value === "bigint" ? payload.value % def.value === BigInt(0) : util.floatSafeRemainder(payload.value, def.value) === 0;
      if (isMultiple)
        return;
      payload.issues.push({
        origin: typeof payload.value,
        code: "not_multiple_of",
        divisor: def.value,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  exports.$ZodCheckNumberFormat = core.$constructor("$ZodCheckNumberFormat", (inst, def) => {
    exports.$ZodCheck.init(inst, def);
    def.format = def.format || "float64";
    const isInt = def.format?.includes("int");
    const origin = isInt ? "int" : "number";
    const [minimum, maximum] = util.NUMBER_FORMAT_RANGES[def.format];
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      bag.format = def.format;
      bag.minimum = minimum;
      bag.maximum = maximum;
      if (isInt)
        bag.pattern = regexes.integer;
    });
    inst._zod.check = (payload) => {
      const input = payload.value;
      if (isInt) {
        if (!Number.isInteger(input)) {
          payload.issues.push({
            expected: origin,
            format: def.format,
            code: "invalid_type",
            input,
            inst
          });
          return;
        }
        if (!Number.isSafeInteger(input)) {
          if (input > 0) {
            payload.issues.push({
              input,
              code: "too_big",
              maximum: Number.MAX_SAFE_INTEGER,
              note: "Integers must be within the safe integer range.",
              inst,
              origin,
              continue: !def.abort
            });
          } else {
            payload.issues.push({
              input,
              code: "too_small",
              minimum: Number.MIN_SAFE_INTEGER,
              note: "Integers must be within the safe integer range.",
              inst,
              origin,
              continue: !def.abort
            });
          }
          return;
        }
      }
      if (input < minimum) {
        payload.issues.push({
          origin: "number",
          input,
          code: "too_small",
          minimum,
          inclusive: true,
          inst,
          continue: !def.abort
        });
      }
      if (input > maximum) {
        payload.issues.push({
          origin: "number",
          input,
          code: "too_big",
          maximum,
          inst
        });
      }
    };
  });
  exports.$ZodCheckBigIntFormat = core.$constructor("$ZodCheckBigIntFormat", (inst, def) => {
    exports.$ZodCheck.init(inst, def);
    const [minimum, maximum] = util.BIGINT_FORMAT_RANGES[def.format];
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      bag.format = def.format;
      bag.minimum = minimum;
      bag.maximum = maximum;
    });
    inst._zod.check = (payload) => {
      const input = payload.value;
      if (input < minimum) {
        payload.issues.push({
          origin: "bigint",
          input,
          code: "too_small",
          minimum,
          inclusive: true,
          inst,
          continue: !def.abort
        });
      }
      if (input > maximum) {
        payload.issues.push({
          origin: "bigint",
          input,
          code: "too_big",
          maximum,
          inst
        });
      }
    };
  });
  exports.$ZodCheckMaxSize = core.$constructor("$ZodCheckMaxSize", (inst, def) => {
    var _a;
    exports.$ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
      const val = payload.value;
      return !util.nullish(val) && val.size !== undefined;
    });
    inst._zod.onattach.push((inst2) => {
      const curr = inst2._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
      if (def.maximum < curr)
        inst2._zod.bag.maximum = def.maximum;
    });
    inst._zod.check = (payload) => {
      const input = payload.value;
      const size = input.size;
      if (size <= def.maximum)
        return;
      payload.issues.push({
        origin: util.getSizableOrigin(input),
        code: "too_big",
        maximum: def.maximum,
        input,
        inst,
        continue: !def.abort
      });
    };
  });
  exports.$ZodCheckMinSize = core.$constructor("$ZodCheckMinSize", (inst, def) => {
    var _a;
    exports.$ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
      const val = payload.value;
      return !util.nullish(val) && val.size !== undefined;
    });
    inst._zod.onattach.push((inst2) => {
      const curr = inst2._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
      if (def.minimum > curr)
        inst2._zod.bag.minimum = def.minimum;
    });
    inst._zod.check = (payload) => {
      const input = payload.value;
      const size = input.size;
      if (size >= def.minimum)
        return;
      payload.issues.push({
        origin: util.getSizableOrigin(input),
        code: "too_small",
        minimum: def.minimum,
        input,
        inst,
        continue: !def.abort
      });
    };
  });
  exports.$ZodCheckSizeEquals = core.$constructor("$ZodCheckSizeEquals", (inst, def) => {
    var _a;
    exports.$ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
      const val = payload.value;
      return !util.nullish(val) && val.size !== undefined;
    });
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      bag.minimum = def.size;
      bag.maximum = def.size;
      bag.size = def.size;
    });
    inst._zod.check = (payload) => {
      const input = payload.value;
      const size = input.size;
      if (size === def.size)
        return;
      const tooBig = size > def.size;
      payload.issues.push({
        origin: util.getSizableOrigin(input),
        ...tooBig ? { code: "too_big", maximum: def.size } : { code: "too_small", minimum: def.size },
        inclusive: true,
        exact: true,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  exports.$ZodCheckMaxLength = core.$constructor("$ZodCheckMaxLength", (inst, def) => {
    var _a;
    exports.$ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
      const val = payload.value;
      return !util.nullish(val) && val.length !== undefined;
    });
    inst._zod.onattach.push((inst2) => {
      const curr = inst2._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
      if (def.maximum < curr)
        inst2._zod.bag.maximum = def.maximum;
    });
    inst._zod.check = (payload) => {
      const input = payload.value;
      const length = input.length;
      if (length <= def.maximum)
        return;
      const origin = util.getLengthableOrigin(input);
      payload.issues.push({
        origin,
        code: "too_big",
        maximum: def.maximum,
        inclusive: true,
        input,
        inst,
        continue: !def.abort
      });
    };
  });
  exports.$ZodCheckMinLength = core.$constructor("$ZodCheckMinLength", (inst, def) => {
    var _a;
    exports.$ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
      const val = payload.value;
      return !util.nullish(val) && val.length !== undefined;
    });
    inst._zod.onattach.push((inst2) => {
      const curr = inst2._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
      if (def.minimum > curr)
        inst2._zod.bag.minimum = def.minimum;
    });
    inst._zod.check = (payload) => {
      const input = payload.value;
      const length = input.length;
      if (length >= def.minimum)
        return;
      const origin = util.getLengthableOrigin(input);
      payload.issues.push({
        origin,
        code: "too_small",
        minimum: def.minimum,
        inclusive: true,
        input,
        inst,
        continue: !def.abort
      });
    };
  });
  exports.$ZodCheckLengthEquals = core.$constructor("$ZodCheckLengthEquals", (inst, def) => {
    var _a;
    exports.$ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
      const val = payload.value;
      return !util.nullish(val) && val.length !== undefined;
    });
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      bag.minimum = def.length;
      bag.maximum = def.length;
      bag.length = def.length;
    });
    inst._zod.check = (payload) => {
      const input = payload.value;
      const length = input.length;
      if (length === def.length)
        return;
      const origin = util.getLengthableOrigin(input);
      const tooBig = length > def.length;
      payload.issues.push({
        origin,
        ...tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length },
        inclusive: true,
        exact: true,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  exports.$ZodCheckStringFormat = core.$constructor("$ZodCheckStringFormat", (inst, def) => {
    var _a, _b;
    exports.$ZodCheck.init(inst, def);
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      bag.format = def.format;
      if (def.pattern) {
        bag.patterns ?? (bag.patterns = new Set);
        bag.patterns.add(def.pattern);
      }
    });
    if (def.pattern)
      (_a = inst._zod).check ?? (_a.check = (payload) => {
        def.pattern.lastIndex = 0;
        if (def.pattern.test(payload.value))
          return;
        payload.issues.push({
          origin: "string",
          code: "invalid_format",
          format: def.format,
          input: payload.value,
          ...def.pattern ? { pattern: def.pattern.toString() } : {},
          inst,
          continue: !def.abort
        });
      });
    else
      (_b = inst._zod).check ?? (_b.check = () => {});
  });
  exports.$ZodCheckRegex = core.$constructor("$ZodCheckRegex", (inst, def) => {
    exports.$ZodCheckStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      def.pattern.lastIndex = 0;
      if (def.pattern.test(payload.value))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "regex",
        input: payload.value,
        pattern: def.pattern.toString(),
        inst,
        continue: !def.abort
      });
    };
  });
  exports.$ZodCheckLowerCase = core.$constructor("$ZodCheckLowerCase", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.lowercase);
    exports.$ZodCheckStringFormat.init(inst, def);
  });
  exports.$ZodCheckUpperCase = core.$constructor("$ZodCheckUpperCase", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.uppercase);
    exports.$ZodCheckStringFormat.init(inst, def);
  });
  exports.$ZodCheckIncludes = core.$constructor("$ZodCheckIncludes", (inst, def) => {
    exports.$ZodCheck.init(inst, def);
    const escapedRegex = util.escapeRegex(def.includes);
    const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
    def.pattern = pattern;
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      bag.patterns ?? (bag.patterns = new Set);
      bag.patterns.add(pattern);
    });
    inst._zod.check = (payload) => {
      if (payload.value.includes(def.includes, def.position))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "includes",
        includes: def.includes,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  exports.$ZodCheckStartsWith = core.$constructor("$ZodCheckStartsWith", (inst, def) => {
    exports.$ZodCheck.init(inst, def);
    const pattern = new RegExp(`^${util.escapeRegex(def.prefix)}.*`);
    def.pattern ?? (def.pattern = pattern);
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      bag.patterns ?? (bag.patterns = new Set);
      bag.patterns.add(pattern);
    });
    inst._zod.check = (payload) => {
      if (payload.value.startsWith(def.prefix))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "starts_with",
        prefix: def.prefix,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  exports.$ZodCheckEndsWith = core.$constructor("$ZodCheckEndsWith", (inst, def) => {
    exports.$ZodCheck.init(inst, def);
    const pattern = new RegExp(`.*${util.escapeRegex(def.suffix)}$`);
    def.pattern ?? (def.pattern = pattern);
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      bag.patterns ?? (bag.patterns = new Set);
      bag.patterns.add(pattern);
    });
    inst._zod.check = (payload) => {
      if (payload.value.endsWith(def.suffix))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "ends_with",
        suffix: def.suffix,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  function handleCheckPropertyResult(result, payload, property) {
    if (result.issues.length) {
      payload.issues.push(...util.prefixIssues(property, result.issues));
    }
  }
  exports.$ZodCheckProperty = core.$constructor("$ZodCheckProperty", (inst, def) => {
    exports.$ZodCheck.init(inst, def);
    inst._zod.check = (payload) => {
      const result = def.schema._zod.run({
        value: payload.value[def.property],
        issues: []
      }, {});
      if (result instanceof Promise) {
        return result.then((result2) => handleCheckPropertyResult(result2, payload, def.property));
      }
      handleCheckPropertyResult(result, payload, def.property);
      return;
    };
  });
  exports.$ZodCheckMimeType = core.$constructor("$ZodCheckMimeType", (inst, def) => {
    exports.$ZodCheck.init(inst, def);
    const mimeSet = new Set(def.mime);
    inst._zod.onattach.push((inst2) => {
      inst2._zod.bag.mime = def.mime;
    });
    inst._zod.check = (payload) => {
      if (mimeSet.has(payload.value.type))
        return;
      payload.issues.push({
        code: "invalid_value",
        values: def.mime,
        input: payload.value.type,
        inst
      });
    };
  });
  exports.$ZodCheckOverwrite = core.$constructor("$ZodCheckOverwrite", (inst, def) => {
    exports.$ZodCheck.init(inst, def);
    inst._zod.check = (payload) => {
      payload.value = def.tx(payload.value);
    };
  });
});

// node_modules/zod/v4/core/doc.cjs
var require_doc = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.Doc = undefined;

  class Doc {
    constructor(args = []) {
      this.content = [];
      this.indent = 0;
      if (this)
        this.args = args;
    }
    indented(fn) {
      this.indent += 1;
      fn(this);
      this.indent -= 1;
    }
    write(arg) {
      if (typeof arg === "function") {
        arg(this, { execution: "sync" });
        arg(this, { execution: "async" });
        return;
      }
      const content = arg;
      const lines = content.split(`
`).filter((x) => x);
      const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
      const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
      for (const line of dedented) {
        this.content.push(line);
      }
    }
    compile() {
      const F = Function;
      const args = this?.args;
      const content = this?.content ?? [``];
      const lines = [...content.map((x) => `  ${x}`)];
      return new F(...args, lines.join(`
`));
    }
  }
  exports.Doc = Doc;
});

// node_modules/zod/v4/core/versions.cjs
var require_versions = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.version = undefined;
  exports.version = {
    major: 4,
    minor: 0,
    patch: 0
  };
});

// node_modules/zod/v4/core/schemas.cjs
var require_schemas = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.$ZodSet = exports.$ZodMap = exports.$ZodRecord = exports.$ZodTuple = exports.$ZodIntersection = exports.$ZodDiscriminatedUnion = exports.$ZodUnion = exports.$ZodObject = exports.$ZodArray = exports.$ZodDate = exports.$ZodVoid = exports.$ZodNever = exports.$ZodUnknown = exports.$ZodAny = exports.$ZodNull = exports.$ZodUndefined = exports.$ZodSymbol = exports.$ZodBigIntFormat = exports.$ZodBigInt = exports.$ZodBoolean = exports.$ZodNumberFormat = exports.$ZodNumber = exports.$ZodCustomStringFormat = exports.$ZodJWT = exports.$ZodE164 = exports.$ZodBase64URL = exports.$ZodBase64 = exports.$ZodCIDRv6 = exports.$ZodCIDRv4 = exports.$ZodIPv6 = exports.$ZodIPv4 = exports.$ZodISODuration = exports.$ZodISOTime = exports.$ZodISODate = exports.$ZodISODateTime = exports.$ZodKSUID = exports.$ZodXID = exports.$ZodULID = exports.$ZodCUID2 = exports.$ZodCUID = exports.$ZodNanoID = exports.$ZodEmoji = exports.$ZodURL = exports.$ZodEmail = exports.$ZodUUID = exports.$ZodGUID = exports.$ZodStringFormat = exports.$ZodString = exports.clone = exports.$ZodType = undefined;
  exports.$ZodCustom = exports.$ZodLazy = exports.$ZodPromise = exports.$ZodTemplateLiteral = exports.$ZodReadonly = exports.$ZodPipe = exports.$ZodNaN = exports.$ZodCatch = exports.$ZodSuccess = exports.$ZodNonOptional = exports.$ZodPrefault = exports.$ZodDefault = exports.$ZodNullable = exports.$ZodOptional = exports.$ZodTransform = exports.$ZodFile = exports.$ZodLiteral = exports.$ZodEnum = undefined;
  exports.isValidBase64 = isValidBase64;
  exports.isValidBase64URL = isValidBase64URL;
  exports.isValidJWT = isValidJWT;
  var checks = __importStar(require_checks());
  var core = __importStar(require_core());
  var doc_js_1 = require_doc();
  var parse_js_1 = require_parse();
  var regexes = __importStar(require_regexes());
  var util = __importStar(require_util());
  var versions_js_1 = require_versions();
  exports.$ZodType = core.$constructor("$ZodType", (inst, def) => {
    var _a;
    inst ?? (inst = {});
    inst._zod.def = def;
    inst._zod.bag = inst._zod.bag || {};
    inst._zod.version = versions_js_1.version;
    const checks2 = [...inst._zod.def.checks ?? []];
    if (inst._zod.traits.has("$ZodCheck")) {
      checks2.unshift(inst);
    }
    for (const ch of checks2) {
      for (const fn of ch._zod.onattach) {
        fn(inst);
      }
    }
    if (checks2.length === 0) {
      (_a = inst._zod).deferred ?? (_a.deferred = []);
      inst._zod.deferred?.push(() => {
        inst._zod.run = inst._zod.parse;
      });
    } else {
      const runChecks = (payload, checks3, ctx) => {
        let isAborted = util.aborted(payload);
        let asyncResult;
        for (const ch of checks3) {
          if (ch._zod.def.when) {
            const shouldRun = ch._zod.def.when(payload);
            if (!shouldRun)
              continue;
          } else if (isAborted) {
            continue;
          }
          const currLen = payload.issues.length;
          const _ = ch._zod.check(payload);
          if (_ instanceof Promise && ctx?.async === false) {
            throw new core.$ZodAsyncError;
          }
          if (asyncResult || _ instanceof Promise) {
            asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
              await _;
              const nextLen = payload.issues.length;
              if (nextLen === currLen)
                return;
              if (!isAborted)
                isAborted = util.aborted(payload, currLen);
            });
          } else {
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              continue;
            if (!isAborted)
              isAborted = util.aborted(payload, currLen);
          }
        }
        if (asyncResult) {
          return asyncResult.then(() => {
            return payload;
          });
        }
        return payload;
      };
      inst._zod.run = (payload, ctx) => {
        const result = inst._zod.parse(payload, ctx);
        if (result instanceof Promise) {
          if (ctx.async === false)
            throw new core.$ZodAsyncError;
          return result.then((result2) => runChecks(result2, checks2, ctx));
        }
        return runChecks(result, checks2, ctx);
      };
    }
    inst["~standard"] = {
      validate: (value) => {
        try {
          const r = (0, parse_js_1.safeParse)(inst, value);
          return r.success ? { value: r.data } : { issues: r.error?.issues };
        } catch (_) {
          return (0, parse_js_1.safeParseAsync)(inst, value).then((r) => r.success ? { value: r.data } : { issues: r.error?.issues });
        }
      },
      vendor: "zod",
      version: 1
    };
  });
  var util_js_1 = require_util();
  Object.defineProperty(exports, "clone", { enumerable: true, get: function() {
    return util_js_1.clone;
  } });
  exports.$ZodString = core.$constructor("$ZodString", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? regexes.string(inst._zod.bag);
    inst._zod.parse = (payload, _) => {
      if (def.coerce)
        try {
          payload.value = String(payload.value);
        } catch (_2) {}
      if (typeof payload.value === "string")
        return payload;
      payload.issues.push({
        expected: "string",
        code: "invalid_type",
        input: payload.value,
        inst
      });
      return payload;
    };
  });
  exports.$ZodStringFormat = core.$constructor("$ZodStringFormat", (inst, def) => {
    checks.$ZodCheckStringFormat.init(inst, def);
    exports.$ZodString.init(inst, def);
  });
  exports.$ZodGUID = core.$constructor("$ZodGUID", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.guid);
    exports.$ZodStringFormat.init(inst, def);
  });
  exports.$ZodUUID = core.$constructor("$ZodUUID", (inst, def) => {
    if (def.version) {
      const versionMap = {
        v1: 1,
        v2: 2,
        v3: 3,
        v4: 4,
        v5: 5,
        v6: 6,
        v7: 7,
        v8: 8
      };
      const v = versionMap[def.version];
      if (v === undefined)
        throw new Error(`Invalid UUID version: "${def.version}"`);
      def.pattern ?? (def.pattern = regexes.uuid(v));
    } else
      def.pattern ?? (def.pattern = regexes.uuid());
    exports.$ZodStringFormat.init(inst, def);
  });
  exports.$ZodEmail = core.$constructor("$ZodEmail", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.email);
    exports.$ZodStringFormat.init(inst, def);
  });
  exports.$ZodURL = core.$constructor("$ZodURL", (inst, def) => {
    exports.$ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      try {
        const orig = payload.value;
        const url = new URL(orig);
        const href = url.href;
        if (def.hostname) {
          def.hostname.lastIndex = 0;
          if (!def.hostname.test(url.hostname)) {
            payload.issues.push({
              code: "invalid_format",
              format: "url",
              note: "Invalid hostname",
              pattern: regexes.hostname.source,
              input: payload.value,
              inst,
              continue: !def.abort
            });
          }
        }
        if (def.protocol) {
          def.protocol.lastIndex = 0;
          if (!def.protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol)) {
            payload.issues.push({
              code: "invalid_format",
              format: "url",
              note: "Invalid protocol",
              pattern: def.protocol.source,
              input: payload.value,
              inst,
              continue: !def.abort
            });
          }
        }
        if (!orig.endsWith("/") && href.endsWith("/")) {
          payload.value = href.slice(0, -1);
        } else {
          payload.value = href;
        }
        return;
      } catch (_) {
        payload.issues.push({
          code: "invalid_format",
          format: "url",
          input: payload.value,
          inst,
          continue: !def.abort
        });
      }
    };
  });
  exports.$ZodEmoji = core.$constructor("$ZodEmoji", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.emoji());
    exports.$ZodStringFormat.init(inst, def);
  });
  exports.$ZodNanoID = core.$constructor("$ZodNanoID", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.nanoid);
    exports.$ZodStringFormat.init(inst, def);
  });
  exports.$ZodCUID = core.$constructor("$ZodCUID", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.cuid);
    exports.$ZodStringFormat.init(inst, def);
  });
  exports.$ZodCUID2 = core.$constructor("$ZodCUID2", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.cuid2);
    exports.$ZodStringFormat.init(inst, def);
  });
  exports.$ZodULID = core.$constructor("$ZodULID", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.ulid);
    exports.$ZodStringFormat.init(inst, def);
  });
  exports.$ZodXID = core.$constructor("$ZodXID", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.xid);
    exports.$ZodStringFormat.init(inst, def);
  });
  exports.$ZodKSUID = core.$constructor("$ZodKSUID", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.ksuid);
    exports.$ZodStringFormat.init(inst, def);
  });
  exports.$ZodISODateTime = core.$constructor("$ZodISODateTime", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.datetime(def));
    exports.$ZodStringFormat.init(inst, def);
  });
  exports.$ZodISODate = core.$constructor("$ZodISODate", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.date);
    exports.$ZodStringFormat.init(inst, def);
  });
  exports.$ZodISOTime = core.$constructor("$ZodISOTime", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.time(def));
    exports.$ZodStringFormat.init(inst, def);
  });
  exports.$ZodISODuration = core.$constructor("$ZodISODuration", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.duration);
    exports.$ZodStringFormat.init(inst, def);
  });
  exports.$ZodIPv4 = core.$constructor("$ZodIPv4", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.ipv4);
    exports.$ZodStringFormat.init(inst, def);
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      bag.format = `ipv4`;
    });
  });
  exports.$ZodIPv6 = core.$constructor("$ZodIPv6", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.ipv6);
    exports.$ZodStringFormat.init(inst, def);
    inst._zod.onattach.push((inst2) => {
      const bag = inst2._zod.bag;
      bag.format = `ipv6`;
    });
    inst._zod.check = (payload) => {
      try {
        new URL(`http://[${payload.value}]`);
      } catch {
        payload.issues.push({
          code: "invalid_format",
          format: "ipv6",
          input: payload.value,
          inst,
          continue: !def.abort
        });
      }
    };
  });
  exports.$ZodCIDRv4 = core.$constructor("$ZodCIDRv4", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.cidrv4);
    exports.$ZodStringFormat.init(inst, def);
  });
  exports.$ZodCIDRv6 = core.$constructor("$ZodCIDRv6", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.cidrv6);
    exports.$ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      const [address, prefix] = payload.value.split("/");
      try {
        if (!prefix)
          throw new Error;
        const prefixNum = Number(prefix);
        if (`${prefixNum}` !== prefix)
          throw new Error;
        if (prefixNum < 0 || prefixNum > 128)
          throw new Error;
        new URL(`http://[${address}]`);
      } catch {
        payload.issues.push({
          code: "invalid_format",
          format: "cidrv6",
          input: payload.value,
          inst,
          continue: !def.abort
        });
      }
    };
  });
  function isValidBase64(data) {
    if (data === "")
      return true;
    if (data.length % 4 !== 0)
      return false;
    try {
      atob(data);
      return true;
    } catch {
      return false;
    }
  }
  exports.$ZodBase64 = core.$constructor("$ZodBase64", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.base64);
    exports.$ZodStringFormat.init(inst, def);
    inst._zod.onattach.push((inst2) => {
      inst2._zod.bag.contentEncoding = "base64";
    });
    inst._zod.check = (payload) => {
      if (isValidBase64(payload.value))
        return;
      payload.issues.push({
        code: "invalid_format",
        format: "base64",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  function isValidBase64URL(data) {
    if (!regexes.base64url.test(data))
      return false;
    const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return isValidBase64(padded);
  }
  exports.$ZodBase64URL = core.$constructor("$ZodBase64URL", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.base64url);
    exports.$ZodStringFormat.init(inst, def);
    inst._zod.onattach.push((inst2) => {
      inst2._zod.bag.contentEncoding = "base64url";
    });
    inst._zod.check = (payload) => {
      if (isValidBase64URL(payload.value))
        return;
      payload.issues.push({
        code: "invalid_format",
        format: "base64url",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  exports.$ZodE164 = core.$constructor("$ZodE164", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.e164);
    exports.$ZodStringFormat.init(inst, def);
  });
  function isValidJWT(token, algorithm = null) {
    try {
      const tokensParts = token.split(".");
      if (tokensParts.length !== 3)
        return false;
      const [header] = tokensParts;
      if (!header)
        return false;
      const parsedHeader = JSON.parse(atob(header));
      if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
        return false;
      if (!parsedHeader.alg)
        return false;
      if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
        return false;
      return true;
    } catch {
      return false;
    }
  }
  exports.$ZodJWT = core.$constructor("$ZodJWT", (inst, def) => {
    exports.$ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      if (isValidJWT(payload.value, def.alg))
        return;
      payload.issues.push({
        code: "invalid_format",
        format: "jwt",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  exports.$ZodCustomStringFormat = core.$constructor("$ZodCustomStringFormat", (inst, def) => {
    exports.$ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      if (def.fn(payload.value))
        return;
      payload.issues.push({
        code: "invalid_format",
        format: def.format,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  exports.$ZodNumber = core.$constructor("$ZodNumber", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.pattern = inst._zod.bag.pattern ?? regexes.number;
    inst._zod.parse = (payload, _ctx) => {
      if (def.coerce)
        try {
          payload.value = Number(payload.value);
        } catch (_) {}
      const input = payload.value;
      if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
        return payload;
      }
      const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : undefined : undefined;
      payload.issues.push({
        expected: "number",
        code: "invalid_type",
        input,
        inst,
        ...received ? { received } : {}
      });
      return payload;
    };
  });
  exports.$ZodNumberFormat = core.$constructor("$ZodNumber", (inst, def) => {
    checks.$ZodCheckNumberFormat.init(inst, def);
    exports.$ZodNumber.init(inst, def);
  });
  exports.$ZodBoolean = core.$constructor("$ZodBoolean", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.pattern = regexes.boolean;
    inst._zod.parse = (payload, _ctx) => {
      if (def.coerce)
        try {
          payload.value = Boolean(payload.value);
        } catch (_) {}
      const input = payload.value;
      if (typeof input === "boolean")
        return payload;
      payload.issues.push({
        expected: "boolean",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    };
  });
  exports.$ZodBigInt = core.$constructor("$ZodBigInt", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.pattern = regexes.bigint;
    inst._zod.parse = (payload, _ctx) => {
      if (def.coerce)
        try {
          payload.value = BigInt(payload.value);
        } catch (_) {}
      if (typeof payload.value === "bigint")
        return payload;
      payload.issues.push({
        expected: "bigint",
        code: "invalid_type",
        input: payload.value,
        inst
      });
      return payload;
    };
  });
  exports.$ZodBigIntFormat = core.$constructor("$ZodBigInt", (inst, def) => {
    checks.$ZodCheckBigIntFormat.init(inst, def);
    exports.$ZodBigInt.init(inst, def);
  });
  exports.$ZodSymbol = core.$constructor("$ZodSymbol", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
      const input = payload.value;
      if (typeof input === "symbol")
        return payload;
      payload.issues.push({
        expected: "symbol",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    };
  });
  exports.$ZodUndefined = core.$constructor("$ZodUndefined", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.pattern = regexes.undefined;
    inst._zod.values = new Set([undefined]);
    inst._zod.optin = "optional";
    inst._zod.optout = "optional";
    inst._zod.parse = (payload, _ctx) => {
      const input = payload.value;
      if (typeof input === "undefined")
        return payload;
      payload.issues.push({
        expected: "undefined",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    };
  });
  exports.$ZodNull = core.$constructor("$ZodNull", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.pattern = regexes.null;
    inst._zod.values = new Set([null]);
    inst._zod.parse = (payload, _ctx) => {
      const input = payload.value;
      if (input === null)
        return payload;
      payload.issues.push({
        expected: "null",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    };
  });
  exports.$ZodAny = core.$constructor("$ZodAny", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.parse = (payload) => payload;
  });
  exports.$ZodUnknown = core.$constructor("$ZodUnknown", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.parse = (payload) => payload;
  });
  exports.$ZodNever = core.$constructor("$ZodNever", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
      payload.issues.push({
        expected: "never",
        code: "invalid_type",
        input: payload.value,
        inst
      });
      return payload;
    };
  });
  exports.$ZodVoid = core.$constructor("$ZodVoid", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
      const input = payload.value;
      if (typeof input === "undefined")
        return payload;
      payload.issues.push({
        expected: "void",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    };
  });
  exports.$ZodDate = core.$constructor("$ZodDate", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
      if (def.coerce) {
        try {
          payload.value = new Date(payload.value);
        } catch (_err) {}
      }
      const input = payload.value;
      const isDate = input instanceof Date;
      const isValidDate = isDate && !Number.isNaN(input.getTime());
      if (isValidDate)
        return payload;
      payload.issues.push({
        expected: "date",
        code: "invalid_type",
        input,
        ...isDate ? { received: "Invalid Date" } : {},
        inst
      });
      return payload;
    };
  });
  function handleArrayResult(result, final, index) {
    if (result.issues.length) {
      final.issues.push(...util.prefixIssues(index, result.issues));
    }
    final.value[index] = result.value;
  }
  exports.$ZodArray = core.$constructor("$ZodArray", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      if (!Array.isArray(input)) {
        payload.issues.push({
          expected: "array",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      }
      payload.value = Array(input.length);
      const proms = [];
      for (let i = 0;i < input.length; i++) {
        const item = input[i];
        const result = def.element._zod.run({
          value: item,
          issues: []
        }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result2) => handleArrayResult(result2, payload, i)));
        } else {
          handleArrayResult(result, payload, i);
        }
      }
      if (proms.length) {
        return Promise.all(proms).then(() => payload);
      }
      return payload;
    };
  });
  function handleObjectResult(result, final, key) {
    if (result.issues.length) {
      final.issues.push(...util.prefixIssues(key, result.issues));
    }
    final.value[key] = result.value;
  }
  function handleOptionalObjectResult(result, final, key, input) {
    if (result.issues.length) {
      if (input[key] === undefined) {
        if (key in input) {
          final.value[key] = undefined;
        } else {
          final.value[key] = result.value;
        }
      } else {
        final.issues.push(...util.prefixIssues(key, result.issues));
      }
    } else if (result.value === undefined) {
      if (key in input)
        final.value[key] = undefined;
    } else {
      final.value[key] = result.value;
    }
  }
  exports.$ZodObject = core.$constructor("$ZodObject", (inst, def) => {
    exports.$ZodType.init(inst, def);
    const _normalized = util.cached(() => {
      const keys = Object.keys(def.shape);
      for (const k of keys) {
        if (!(def.shape[k] instanceof exports.$ZodType)) {
          throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
        }
      }
      const okeys = util.optionalKeys(def.shape);
      return {
        shape: def.shape,
        keys,
        keySet: new Set(keys),
        numKeys: keys.length,
        optionalKeys: new Set(okeys)
      };
    });
    util.defineLazy(inst._zod, "propValues", () => {
      const shape = def.shape;
      const propValues = {};
      for (const key in shape) {
        const field = shape[key]._zod;
        if (field.values) {
          propValues[key] ?? (propValues[key] = new Set);
          for (const v of field.values)
            propValues[key].add(v);
        }
      }
      return propValues;
    });
    const generateFastpass = (shape) => {
      const doc = new doc_js_1.Doc(["shape", "payload", "ctx"]);
      const normalized = _normalized.value;
      const parseStr = (key) => {
        const k = util.esc(key);
        return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
      };
      doc.write(`const input = payload.value;`);
      const ids = Object.create(null);
      let counter = 0;
      for (const key of normalized.keys) {
        ids[key] = `key_${counter++}`;
      }
      doc.write(`const newResult = {}`);
      for (const key of normalized.keys) {
        if (normalized.optionalKeys.has(key)) {
          const id = ids[key];
          doc.write(`const ${id} = ${parseStr(key)};`);
          const k = util.esc(key);
          doc.write(`
        if (${id}.issues.length) {
          if (input[${k}] === undefined) {
            if (${k} in input) {
              newResult[${k}] = undefined;
            }
          } else {
            payload.issues = payload.issues.concat(
              ${id}.issues.map((iss) => ({
                ...iss,
                path: iss.path ? [${k}, ...iss.path] : [${k}],
              }))
            );
          }
        } else if (${id}.value === undefined) {
          if (${k} in input) newResult[${k}] = undefined;
        } else {
          newResult[${k}] = ${id}.value;
        }
        `);
        } else {
          const id = ids[key];
          doc.write(`const ${id} = ${parseStr(key)};`);
          doc.write(`
          if (${id}.issues.length) payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${util.esc(key)}, ...iss.path] : [${util.esc(key)}]
          })));`);
          doc.write(`newResult[${util.esc(key)}] = ${id}.value`);
        }
      }
      doc.write(`payload.value = newResult;`);
      doc.write(`return payload;`);
      const fn = doc.compile();
      return (payload, ctx) => fn(shape, payload, ctx);
    };
    let fastpass;
    const isObject = util.isObject;
    const jit = !core.globalConfig.jitless;
    const allowsEval = util.allowsEval;
    const fastEnabled = jit && allowsEval.value;
    const catchall = def.catchall;
    let value;
    inst._zod.parse = (payload, ctx) => {
      value ?? (value = _normalized.value);
      const input = payload.value;
      if (!isObject(input)) {
        payload.issues.push({
          expected: "object",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      }
      const proms = [];
      if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
        if (!fastpass)
          fastpass = generateFastpass(def.shape);
        payload = fastpass(payload, ctx);
      } else {
        payload.value = {};
        const shape = value.shape;
        for (const key of value.keys) {
          const el = shape[key];
          const r = el._zod.run({ value: input[key], issues: [] }, ctx);
          const isOptional = el._zod.optin === "optional" && el._zod.optout === "optional";
          if (r instanceof Promise) {
            proms.push(r.then((r2) => isOptional ? handleOptionalObjectResult(r2, payload, key, input) : handleObjectResult(r2, payload, key)));
          } else if (isOptional) {
            handleOptionalObjectResult(r, payload, key, input);
          } else {
            handleObjectResult(r, payload, key);
          }
        }
      }
      if (!catchall) {
        return proms.length ? Promise.all(proms).then(() => payload) : payload;
      }
      const unrecognized = [];
      const keySet = value.keySet;
      const _catchall = catchall._zod;
      const t = _catchall.def.type;
      for (const key of Object.keys(input)) {
        if (keySet.has(key))
          continue;
        if (t === "never") {
          unrecognized.push(key);
          continue;
        }
        const r = _catchall.run({ value: input[key], issues: [] }, ctx);
        if (r instanceof Promise) {
          proms.push(r.then((r2) => handleObjectResult(r2, payload, key)));
        } else {
          handleObjectResult(r, payload, key);
        }
      }
      if (unrecognized.length) {
        payload.issues.push({
          code: "unrecognized_keys",
          keys: unrecognized,
          input,
          inst
        });
      }
      if (!proms.length)
        return payload;
      return Promise.all(proms).then(() => {
        return payload;
      });
    };
  });
  function handleUnionResults(results, final, inst, ctx) {
    for (const result of results) {
      if (result.issues.length === 0) {
        final.value = result.value;
        return final;
      }
    }
    final.issues.push({
      code: "invalid_union",
      input: final.value,
      inst,
      errors: results.map((result) => result.issues.map((iss) => util.finalizeIssue(iss, ctx, core.config())))
    });
    return final;
  }
  exports.$ZodUnion = core.$constructor("$ZodUnion", (inst, def) => {
    exports.$ZodType.init(inst, def);
    util.defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : undefined);
    util.defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : undefined);
    util.defineLazy(inst._zod, "values", () => {
      if (def.options.every((o) => o._zod.values)) {
        return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
      }
      return;
    });
    util.defineLazy(inst._zod, "pattern", () => {
      if (def.options.every((o) => o._zod.pattern)) {
        const patterns = def.options.map((o) => o._zod.pattern);
        return new RegExp(`^(${patterns.map((p) => util.cleanRegex(p.source)).join("|")})$`);
      }
      return;
    });
    inst._zod.parse = (payload, ctx) => {
      let async = false;
      const results = [];
      for (const option of def.options) {
        const result = option._zod.run({
          value: payload.value,
          issues: []
        }, ctx);
        if (result instanceof Promise) {
          results.push(result);
          async = true;
        } else {
          if (result.issues.length === 0)
            return result;
          results.push(result);
        }
      }
      if (!async)
        return handleUnionResults(results, payload, inst, ctx);
      return Promise.all(results).then((results2) => {
        return handleUnionResults(results2, payload, inst, ctx);
      });
    };
  });
  exports.$ZodDiscriminatedUnion = /* @__PURE__ */ core.$constructor("$ZodDiscriminatedUnion", (inst, def) => {
    exports.$ZodUnion.init(inst, def);
    const _super = inst._zod.parse;
    util.defineLazy(inst._zod, "propValues", () => {
      const propValues = {};
      for (const option of def.options) {
        const pv = option._zod.propValues;
        if (!pv || Object.keys(pv).length === 0)
          throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
        for (const [k, v] of Object.entries(pv)) {
          if (!propValues[k])
            propValues[k] = new Set;
          for (const val of v) {
            propValues[k].add(val);
          }
        }
      }
      return propValues;
    });
    const disc = util.cached(() => {
      const opts = def.options;
      const map = new Map;
      for (const o of opts) {
        const values = o._zod.propValues[def.discriminator];
        if (!values || values.size === 0)
          throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(o)}"`);
        for (const v of values) {
          if (map.has(v)) {
            throw new Error(`Duplicate discriminator value "${String(v)}"`);
          }
          map.set(v, o);
        }
      }
      return map;
    });
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      if (!util.isObject(input)) {
        payload.issues.push({
          code: "invalid_type",
          expected: "object",
          input,
          inst
        });
        return payload;
      }
      const opt = disc.value.get(input?.[def.discriminator]);
      if (opt) {
        return opt._zod.run(payload, ctx);
      }
      if (def.unionFallback) {
        return _super(payload, ctx);
      }
      payload.issues.push({
        code: "invalid_union",
        errors: [],
        note: "No matching discriminator",
        input,
        path: [def.discriminator],
        inst
      });
      return payload;
    };
  });
  exports.$ZodIntersection = core.$constructor("$ZodIntersection", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      const left = def.left._zod.run({ value: input, issues: [] }, ctx);
      const right = def.right._zod.run({ value: input, issues: [] }, ctx);
      const async = left instanceof Promise || right instanceof Promise;
      if (async) {
        return Promise.all([left, right]).then(([left2, right2]) => {
          return handleIntersectionResults(payload, left2, right2);
        });
      }
      return handleIntersectionResults(payload, left, right);
    };
  });
  function mergeValues(a, b) {
    if (a === b) {
      return { valid: true, data: a };
    }
    if (a instanceof Date && b instanceof Date && +a === +b) {
      return { valid: true, data: a };
    }
    if (util.isPlainObject(a) && util.isPlainObject(b)) {
      const bKeys = Object.keys(b);
      const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
      const newObj = { ...a, ...b };
      for (const key of sharedKeys) {
        const sharedValue = mergeValues(a[key], b[key]);
        if (!sharedValue.valid) {
          return {
            valid: false,
            mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
          };
        }
        newObj[key] = sharedValue.data;
      }
      return { valid: true, data: newObj };
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        return { valid: false, mergeErrorPath: [] };
      }
      const newArray = [];
      for (let index = 0;index < a.length; index++) {
        const itemA = a[index];
        const itemB = b[index];
        const sharedValue = mergeValues(itemA, itemB);
        if (!sharedValue.valid) {
          return {
            valid: false,
            mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
          };
        }
        newArray.push(sharedValue.data);
      }
      return { valid: true, data: newArray };
    }
    return { valid: false, mergeErrorPath: [] };
  }
  function handleIntersectionResults(result, left, right) {
    if (left.issues.length) {
      result.issues.push(...left.issues);
    }
    if (right.issues.length) {
      result.issues.push(...right.issues);
    }
    if (util.aborted(result))
      return result;
    const merged = mergeValues(left.value, right.value);
    if (!merged.valid) {
      throw new Error(`Unmergable intersection. Error path: ` + `${JSON.stringify(merged.mergeErrorPath)}`);
    }
    result.value = merged.data;
    return result;
  }
  exports.$ZodTuple = core.$constructor("$ZodTuple", (inst, def) => {
    exports.$ZodType.init(inst, def);
    const items = def.items;
    const optStart = items.length - [...items].reverse().findIndex((item) => item._zod.optin !== "optional");
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      if (!Array.isArray(input)) {
        payload.issues.push({
          input,
          inst,
          expected: "tuple",
          code: "invalid_type"
        });
        return payload;
      }
      payload.value = [];
      const proms = [];
      if (!def.rest) {
        const tooBig = input.length > items.length;
        const tooSmall = input.length < optStart - 1;
        if (tooBig || tooSmall) {
          payload.issues.push({
            input,
            inst,
            origin: "array",
            ...tooBig ? { code: "too_big", maximum: items.length } : { code: "too_small", minimum: items.length }
          });
          return payload;
        }
      }
      let i = -1;
      for (const item of items) {
        i++;
        if (i >= input.length) {
          if (i >= optStart)
            continue;
        }
        const result = item._zod.run({
          value: input[i],
          issues: []
        }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result2) => handleTupleResult(result2, payload, i)));
        } else {
          handleTupleResult(result, payload, i);
        }
      }
      if (def.rest) {
        const rest = input.slice(items.length);
        for (const el of rest) {
          i++;
          const result = def.rest._zod.run({
            value: el,
            issues: []
          }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((result2) => handleTupleResult(result2, payload, i)));
          } else {
            handleTupleResult(result, payload, i);
          }
        }
      }
      if (proms.length)
        return Promise.all(proms).then(() => payload);
      return payload;
    };
  });
  function handleTupleResult(result, final, index) {
    if (result.issues.length) {
      final.issues.push(...util.prefixIssues(index, result.issues));
    }
    final.value[index] = result.value;
  }
  exports.$ZodRecord = core.$constructor("$ZodRecord", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      if (!util.isPlainObject(input)) {
        payload.issues.push({
          expected: "record",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      }
      const proms = [];
      if (def.keyType._zod.values) {
        const values = def.keyType._zod.values;
        payload.value = {};
        for (const key of values) {
          if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
            const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
            if (result instanceof Promise) {
              proms.push(result.then((result2) => {
                if (result2.issues.length) {
                  payload.issues.push(...util.prefixIssues(key, result2.issues));
                }
                payload.value[key] = result2.value;
              }));
            } else {
              if (result.issues.length) {
                payload.issues.push(...util.prefixIssues(key, result.issues));
              }
              payload.value[key] = result.value;
            }
          }
        }
        let unrecognized;
        for (const key in input) {
          if (!values.has(key)) {
            unrecognized = unrecognized ?? [];
            unrecognized.push(key);
          }
        }
        if (unrecognized && unrecognized.length > 0) {
          payload.issues.push({
            code: "unrecognized_keys",
            input,
            inst,
            keys: unrecognized
          });
        }
      } else {
        payload.value = {};
        for (const key of Reflect.ownKeys(input)) {
          if (key === "__proto__")
            continue;
          const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
          if (keyResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (keyResult.issues.length) {
            payload.issues.push({
              origin: "record",
              code: "invalid_key",
              issues: keyResult.issues.map((iss) => util.finalizeIssue(iss, ctx, core.config())),
              input: key,
              path: [key],
              inst
            });
            payload.value[keyResult.value] = keyResult.value;
            continue;
          }
          const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((result2) => {
              if (result2.issues.length) {
                payload.issues.push(...util.prefixIssues(key, result2.issues));
              }
              payload.value[keyResult.value] = result2.value;
            }));
          } else {
            if (result.issues.length) {
              payload.issues.push(...util.prefixIssues(key, result.issues));
            }
            payload.value[keyResult.value] = result.value;
          }
        }
      }
      if (proms.length) {
        return Promise.all(proms).then(() => payload);
      }
      return payload;
    };
  });
  exports.$ZodMap = core.$constructor("$ZodMap", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      if (!(input instanceof Map)) {
        payload.issues.push({
          expected: "map",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      }
      const proms = [];
      payload.value = new Map;
      for (const [key, value] of input) {
        const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
        const valueResult = def.valueType._zod.run({ value, issues: [] }, ctx);
        if (keyResult instanceof Promise || valueResult instanceof Promise) {
          proms.push(Promise.all([keyResult, valueResult]).then(([keyResult2, valueResult2]) => {
            handleMapResult(keyResult2, valueResult2, payload, key, input, inst, ctx);
          }));
        } else {
          handleMapResult(keyResult, valueResult, payload, key, input, inst, ctx);
        }
      }
      if (proms.length)
        return Promise.all(proms).then(() => payload);
      return payload;
    };
  });
  function handleMapResult(keyResult, valueResult, final, key, input, inst, ctx) {
    if (keyResult.issues.length) {
      if (util.propertyKeyTypes.has(typeof key)) {
        final.issues.push(...util.prefixIssues(key, keyResult.issues));
      } else {
        final.issues.push({
          origin: "map",
          code: "invalid_key",
          input,
          inst,
          issues: keyResult.issues.map((iss) => util.finalizeIssue(iss, ctx, core.config()))
        });
      }
    }
    if (valueResult.issues.length) {
      if (util.propertyKeyTypes.has(typeof key)) {
        final.issues.push(...util.prefixIssues(key, valueResult.issues));
      } else {
        final.issues.push({
          origin: "map",
          code: "invalid_element",
          input,
          inst,
          key,
          issues: valueResult.issues.map((iss) => util.finalizeIssue(iss, ctx, core.config()))
        });
      }
    }
    final.value.set(keyResult.value, valueResult.value);
  }
  exports.$ZodSet = core.$constructor("$ZodSet", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      if (!(input instanceof Set)) {
        payload.issues.push({
          input,
          inst,
          expected: "set",
          code: "invalid_type"
        });
        return payload;
      }
      const proms = [];
      payload.value = new Set;
      for (const item of input) {
        const result = def.valueType._zod.run({ value: item, issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result2) => handleSetResult(result2, payload)));
        } else
          handleSetResult(result, payload);
      }
      if (proms.length)
        return Promise.all(proms).then(() => payload);
      return payload;
    };
  });
  function handleSetResult(result, final) {
    if (result.issues.length) {
      final.issues.push(...result.issues);
    }
    final.value.add(result.value);
  }
  exports.$ZodEnum = core.$constructor("$ZodEnum", (inst, def) => {
    exports.$ZodType.init(inst, def);
    const values = util.getEnumValues(def.entries);
    inst._zod.values = new Set(values);
    inst._zod.pattern = new RegExp(`^(${values.filter((k) => util.propertyKeyTypes.has(typeof k)).map((o) => typeof o === "string" ? util.escapeRegex(o) : o.toString()).join("|")})$`);
    inst._zod.parse = (payload, _ctx) => {
      const input = payload.value;
      if (inst._zod.values.has(input)) {
        return payload;
      }
      payload.issues.push({
        code: "invalid_value",
        values,
        input,
        inst
      });
      return payload;
    };
  });
  exports.$ZodLiteral = core.$constructor("$ZodLiteral", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.values = new Set(def.values);
    inst._zod.pattern = new RegExp(`^(${def.values.map((o) => typeof o === "string" ? util.escapeRegex(o) : o ? o.toString() : String(o)).join("|")})$`);
    inst._zod.parse = (payload, _ctx) => {
      const input = payload.value;
      if (inst._zod.values.has(input)) {
        return payload;
      }
      payload.issues.push({
        code: "invalid_value",
        values: def.values,
        input,
        inst
      });
      return payload;
    };
  });
  exports.$ZodFile = core.$constructor("$ZodFile", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
      const input = payload.value;
      if (input instanceof File)
        return payload;
      payload.issues.push({
        expected: "file",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    };
  });
  exports.$ZodTransform = core.$constructor("$ZodTransform", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
      const _out = def.transform(payload.value, payload);
      if (_ctx.async) {
        const output = _out instanceof Promise ? _out : Promise.resolve(_out);
        return output.then((output2) => {
          payload.value = output2;
          return payload;
        });
      }
      if (_out instanceof Promise) {
        throw new core.$ZodAsyncError;
      }
      payload.value = _out;
      return payload;
    };
  });
  exports.$ZodOptional = core.$constructor("$ZodOptional", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.optin = "optional";
    inst._zod.optout = "optional";
    util.defineLazy(inst._zod, "values", () => {
      return def.innerType._zod.values ? new Set([...def.innerType._zod.values, undefined]) : undefined;
    });
    util.defineLazy(inst._zod, "pattern", () => {
      const pattern = def.innerType._zod.pattern;
      return pattern ? new RegExp(`^(${util.cleanRegex(pattern.source)})?$`) : undefined;
    });
    inst._zod.parse = (payload, ctx) => {
      if (def.innerType._zod.optin === "optional") {
        return def.innerType._zod.run(payload, ctx);
      }
      if (payload.value === undefined) {
        return payload;
      }
      return def.innerType._zod.run(payload, ctx);
    };
  });
  exports.$ZodNullable = core.$constructor("$ZodNullable", (inst, def) => {
    exports.$ZodType.init(inst, def);
    util.defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
    util.defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
    util.defineLazy(inst._zod, "pattern", () => {
      const pattern = def.innerType._zod.pattern;
      return pattern ? new RegExp(`^(${util.cleanRegex(pattern.source)}|null)$`) : undefined;
    });
    util.defineLazy(inst._zod, "values", () => {
      return def.innerType._zod.values ? new Set([...def.innerType._zod.values, null]) : undefined;
    });
    inst._zod.parse = (payload, ctx) => {
      if (payload.value === null)
        return payload;
      return def.innerType._zod.run(payload, ctx);
    };
  });
  exports.$ZodDefault = core.$constructor("$ZodDefault", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.optin = "optional";
    util.defineLazy(inst._zod, "values", () => def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
      if (payload.value === undefined) {
        payload.value = def.defaultValue;
        return payload;
      }
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise) {
        return result.then((result2) => handleDefaultResult(result2, def));
      }
      return handleDefaultResult(result, def);
    };
  });
  function handleDefaultResult(payload, def) {
    if (payload.value === undefined) {
      payload.value = def.defaultValue;
    }
    return payload;
  }
  exports.$ZodPrefault = core.$constructor("$ZodPrefault", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.optin = "optional";
    util.defineLazy(inst._zod, "values", () => def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
      if (payload.value === undefined) {
        payload.value = def.defaultValue;
      }
      return def.innerType._zod.run(payload, ctx);
    };
  });
  exports.$ZodNonOptional = core.$constructor("$ZodNonOptional", (inst, def) => {
    exports.$ZodType.init(inst, def);
    util.defineLazy(inst._zod, "values", () => {
      const v = def.innerType._zod.values;
      return v ? new Set([...v].filter((x) => x !== undefined)) : undefined;
    });
    inst._zod.parse = (payload, ctx) => {
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise) {
        return result.then((result2) => handleNonOptionalResult(result2, inst));
      }
      return handleNonOptionalResult(result, inst);
    };
  });
  function handleNonOptionalResult(payload, inst) {
    if (!payload.issues.length && payload.value === undefined) {
      payload.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: payload.value,
        inst
      });
    }
    return payload;
  }
  exports.$ZodSuccess = core.$constructor("$ZodSuccess", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise) {
        return result.then((result2) => {
          payload.value = result2.issues.length === 0;
          return payload;
        });
      }
      payload.value = result.issues.length === 0;
      return payload;
    };
  });
  exports.$ZodCatch = core.$constructor("$ZodCatch", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.optin = "optional";
    util.defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
    util.defineLazy(inst._zod, "values", () => def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise) {
        return result.then((result2) => {
          payload.value = result2.value;
          if (result2.issues.length) {
            payload.value = def.catchValue({
              ...payload,
              error: {
                issues: result2.issues.map((iss) => util.finalizeIssue(iss, ctx, core.config()))
              },
              input: payload.value
            });
            payload.issues = [];
          }
          return payload;
        });
      }
      payload.value = result.value;
      if (result.issues.length) {
        payload.value = def.catchValue({
          ...payload,
          error: {
            issues: result.issues.map((iss) => util.finalizeIssue(iss, ctx, core.config()))
          },
          input: payload.value
        });
        payload.issues = [];
      }
      return payload;
    };
  });
  exports.$ZodNaN = core.$constructor("$ZodNaN", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
      if (typeof payload.value !== "number" || !Number.isNaN(payload.value)) {
        payload.issues.push({
          input: payload.value,
          inst,
          expected: "nan",
          code: "invalid_type"
        });
        return payload;
      }
      return payload;
    };
  });
  exports.$ZodPipe = core.$constructor("$ZodPipe", (inst, def) => {
    exports.$ZodType.init(inst, def);
    util.defineLazy(inst._zod, "values", () => def.in._zod.values);
    util.defineLazy(inst._zod, "optin", () => def.in._zod.optin);
    util.defineLazy(inst._zod, "optout", () => def.out._zod.optout);
    inst._zod.parse = (payload, ctx) => {
      const left = def.in._zod.run(payload, ctx);
      if (left instanceof Promise) {
        return left.then((left2) => handlePipeResult(left2, def, ctx));
      }
      return handlePipeResult(left, def, ctx);
    };
  });
  function handlePipeResult(left, def, ctx) {
    if (util.aborted(left)) {
      return left;
    }
    return def.out._zod.run({ value: left.value, issues: left.issues }, ctx);
  }
  exports.$ZodReadonly = core.$constructor("$ZodReadonly", (inst, def) => {
    exports.$ZodType.init(inst, def);
    util.defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
    util.defineLazy(inst._zod, "values", () => def.innerType._zod.values);
    util.defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
    util.defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
    inst._zod.parse = (payload, ctx) => {
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise) {
        return result.then(handleReadonlyResult);
      }
      return handleReadonlyResult(result);
    };
  });
  function handleReadonlyResult(payload) {
    payload.value = Object.freeze(payload.value);
    return payload;
  }
  exports.$ZodTemplateLiteral = core.$constructor("$ZodTemplateLiteral", (inst, def) => {
    exports.$ZodType.init(inst, def);
    const regexParts = [];
    for (const part of def.parts) {
      if (part instanceof exports.$ZodType) {
        if (!part._zod.pattern) {
          throw new Error(`Invalid template literal part, no pattern found: ${[...part._zod.traits].shift()}`);
        }
        const source = part._zod.pattern instanceof RegExp ? part._zod.pattern.source : part._zod.pattern;
        if (!source)
          throw new Error(`Invalid template literal part: ${part._zod.traits}`);
        const start = source.startsWith("^") ? 1 : 0;
        const end = source.endsWith("$") ? source.length - 1 : source.length;
        regexParts.push(source.slice(start, end));
      } else if (part === null || util.primitiveTypes.has(typeof part)) {
        regexParts.push(util.escapeRegex(`${part}`));
      } else {
        throw new Error(`Invalid template literal part: ${part}`);
      }
    }
    inst._zod.pattern = new RegExp(`^${regexParts.join("")}$`);
    inst._zod.parse = (payload, _ctx) => {
      if (typeof payload.value !== "string") {
        payload.issues.push({
          input: payload.value,
          inst,
          expected: "template_literal",
          code: "invalid_type"
        });
        return payload;
      }
      inst._zod.pattern.lastIndex = 0;
      if (!inst._zod.pattern.test(payload.value)) {
        payload.issues.push({
          input: payload.value,
          inst,
          code: "invalid_format",
          format: "template_literal",
          pattern: inst._zod.pattern.source
        });
        return payload;
      }
      return payload;
    };
  });
  exports.$ZodPromise = core.$constructor("$ZodPromise", (inst, def) => {
    exports.$ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
      return Promise.resolve(payload.value).then((inner) => def.innerType._zod.run({ value: inner, issues: [] }, ctx));
    };
  });
  exports.$ZodLazy = core.$constructor("$ZodLazy", (inst, def) => {
    exports.$ZodType.init(inst, def);
    util.defineLazy(inst._zod, "innerType", () => def.getter());
    util.defineLazy(inst._zod, "pattern", () => inst._zod.innerType._zod.pattern);
    util.defineLazy(inst._zod, "propValues", () => inst._zod.innerType._zod.propValues);
    util.defineLazy(inst._zod, "optin", () => inst._zod.innerType._zod.optin);
    util.defineLazy(inst._zod, "optout", () => inst._zod.innerType._zod.optout);
    inst._zod.parse = (payload, ctx) => {
      const inner = inst._zod.innerType;
      return inner._zod.run(payload, ctx);
    };
  });
  exports.$ZodCustom = core.$constructor("$ZodCustom", (inst, def) => {
    checks.$ZodCheck.init(inst, def);
    exports.$ZodType.init(inst, def);
    inst._zod.parse = (payload, _) => {
      return payload;
    };
    inst._zod.check = (payload) => {
      const input = payload.value;
      const r = def.fn(input);
      if (r instanceof Promise) {
        return r.then((r2) => handleRefineResult(r2, payload, input, inst));
      }
      handleRefineResult(r, payload, input, inst);
      return;
    };
  });
  function handleRefineResult(result, payload, input, inst) {
    if (!result) {
      const _iss = {
        code: "custom",
        input,
        inst,
        path: [...inst._zod.def.path ?? []],
        continue: !inst._zod.def.abort
      };
      if (inst._zod.def.params)
        _iss.params = inst._zod.def.params;
      payload.issues.push(util.issue(_iss));
    }
  }
});

// node_modules/zod/v4/locales/ar.cjs
var require_ar = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "حرف", verb: "أن يحوي" },
      file: { unit: "بايت", verb: "أن يحوي" },
      array: { unit: "عنصر", verb: "أن يحوي" },
      set: { unit: "عنصر", verb: "أن يحوي" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "number";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "array";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "مدخل",
      email: "بريد إلكتروني",
      url: "رابط",
      emoji: "إيموجي",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "تاريخ ووقت بمعيار ISO",
      date: "تاريخ بمعيار ISO",
      time: "وقت بمعيار ISO",
      duration: "مدة بمعيار ISO",
      ipv4: "عنوان IPv4",
      ipv6: "عنوان IPv6",
      cidrv4: "مدى عناوين بصيغة IPv4",
      cidrv6: "مدى عناوين بصيغة IPv6",
      base64: "نَص بترميز base64-encoded",
      base64url: "نَص بترميز base64url-encoded",
      json_string: "نَص على هيئة JSON",
      e164: "رقم هاتف بمعيار E.164",
      jwt: "JWT",
      template_literal: "مدخل"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `مدخلات غير مقبولة: يفترض إدخال ${issue.expected}، ولكن تم إدخال ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `مدخلات غير مقبولة: يفترض إدخال ${util.stringifyPrimitive(issue.values[0])}`;
          return `اختيار غير مقبول: يتوقع انتقاء أحد هذه الخيارات: ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return ` أكبر من اللازم: يفترض أن تكون ${issue.origin ?? "القيمة"} ${adj} ${issue.maximum.toString()} ${sizing.unit ?? "عنصر"}`;
          return `أكبر من اللازم: يفترض أن تكون ${issue.origin ?? "القيمة"} ${adj} ${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `أصغر من اللازم: يفترض لـ ${issue.origin} أن يكون ${adj} ${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `أصغر من اللازم: يفترض لـ ${issue.origin} أن يكون ${adj} ${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `نَص غير مقبول: يجب أن يبدأ بـ "${issue.prefix}"`;
          if (_issue.format === "ends_with")
            return `نَص غير مقبول: يجب أن ينتهي بـ "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `نَص غير مقبول: يجب أن يتضمَّن "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `نَص غير مقبول: يجب أن يطابق النمط ${_issue.pattern}`;
          return `${Nouns[_issue.format] ?? issue.format} غير مقبول`;
        }
        case "not_multiple_of":
          return `رقم غير مقبول: يجب أن يكون من مضاعفات ${issue.divisor}`;
        case "unrecognized_keys":
          return `معرف${issue.keys.length > 1 ? "ات" : ""} غريب${issue.keys.length > 1 ? "ة" : ""}: ${util.joinValues(issue.keys, "، ")}`;
        case "invalid_key":
          return `معرف غير مقبول في ${issue.origin}`;
        case "invalid_union":
          return "مدخل غير مقبول";
        case "invalid_element":
          return `مدخل غير مقبول في ${issue.origin}`;
        default:
          return "مدخل غير مقبول";
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/az.cjs
var require_az = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "simvol", verb: "olmalıdır" },
      file: { unit: "bayt", verb: "olmalıdır" },
      array: { unit: "element", verb: "olmalıdır" },
      set: { unit: "element", verb: "olmalıdır" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "number";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "array";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "input",
      email: "email address",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO datetime",
      date: "ISO date",
      time: "ISO time",
      duration: "ISO duration",
      ipv4: "IPv4 address",
      ipv6: "IPv6 address",
      cidrv4: "IPv4 range",
      cidrv6: "IPv6 range",
      base64: "base64-encoded string",
      base64url: "base64url-encoded string",
      json_string: "JSON string",
      e164: "E.164 number",
      jwt: "JWT",
      template_literal: "input"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Yanlış dəyər: gözlənilən ${issue.expected}, daxil olan ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Yanlış dəyər: gözlənilən ${util.stringifyPrimitive(issue.values[0])}`;
          return `Yanlış seçim: aşağıdakılardan biri olmalıdır: ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Çox böyük: gözlənilən ${issue.origin ?? "dəyər"} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "element"}`;
          return `Çox böyük: gözlənilən ${issue.origin ?? "dəyər"} ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Çox kiçik: gözlənilən ${issue.origin} ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          return `Çox kiçik: gözlənilən ${issue.origin} ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `Yanlış mətn: "${_issue.prefix}" ilə başlamalıdır`;
          if (_issue.format === "ends_with")
            return `Yanlış mətn: "${_issue.suffix}" ilə bitməlidir`;
          if (_issue.format === "includes")
            return `Yanlış mətn: "${_issue.includes}" daxil olmalıdır`;
          if (_issue.format === "regex")
            return `Yanlış mətn: ${_issue.pattern} şablonuna uyğun olmalıdır`;
          return `Yanlış ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Yanlış ədəd: ${issue.divisor} ilə bölünə bilən olmalıdır`;
        case "unrecognized_keys":
          return `Tanınmayan açar${issue.keys.length > 1 ? "lar" : ""}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `${issue.origin} daxilində yanlış açar`;
        case "invalid_union":
          return "Yanlış dəyər";
        case "invalid_element":
          return `${issue.origin} daxilində yanlış dəyər`;
        default:
          return `Yanlış dəyər`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/be.cjs
var require_be = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  function getBelarusianPlural(count, one, few, many) {
    const absCount = Math.abs(count);
    const lastDigit = absCount % 10;
    const lastTwoDigits = absCount % 100;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
      return many;
    }
    if (lastDigit === 1) {
      return one;
    }
    if (lastDigit >= 2 && lastDigit <= 4) {
      return few;
    }
    return many;
  }
  var error = () => {
    const Sizable = {
      string: {
        unit: {
          one: "сімвал",
          few: "сімвалы",
          many: "сімвалаў"
        },
        verb: "мець"
      },
      array: {
        unit: {
          one: "элемент",
          few: "элементы",
          many: "элементаў"
        },
        verb: "мець"
      },
      set: {
        unit: {
          one: "элемент",
          few: "элементы",
          many: "элементаў"
        },
        verb: "мець"
      },
      file: {
        unit: {
          one: "байт",
          few: "байты",
          many: "байтаў"
        },
        verb: "мець"
      }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "лік";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "масіў";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "увод",
      email: "email адрас",
      url: "URL",
      emoji: "эмодзі",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO дата і час",
      date: "ISO дата",
      time: "ISO час",
      duration: "ISO працягласць",
      ipv4: "IPv4 адрас",
      ipv6: "IPv6 адрас",
      cidrv4: "IPv4 дыяпазон",
      cidrv6: "IPv6 дыяпазон",
      base64: "радок у фармаце base64",
      base64url: "радок у фармаце base64url",
      json_string: "JSON радок",
      e164: "нумар E.164",
      jwt: "JWT",
      template_literal: "увод"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Няправільны ўвод: чакаўся ${issue.expected}, атрымана ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Няправільны ўвод: чакалася ${util.stringifyPrimitive(issue.values[0])}`;
          return `Няправільны варыянт: чакаўся адзін з ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            const maxValue = Number(issue.maximum);
            const unit = getBelarusianPlural(maxValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
            return `Занадта вялікі: чакалася, што ${issue.origin ?? "значэнне"} павінна ${sizing.verb} ${adj}${issue.maximum.toString()} ${unit}`;
          }
          return `Занадта вялікі: чакалася, што ${issue.origin ?? "значэнне"} павінна быць ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            const minValue = Number(issue.minimum);
            const unit = getBelarusianPlural(minValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
            return `Занадта малы: чакалася, што ${issue.origin} павінна ${sizing.verb} ${adj}${issue.minimum.toString()} ${unit}`;
          }
          return `Занадта малы: чакалася, што ${issue.origin} павінна быць ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `Няправільны радок: павінен пачынацца з "${_issue.prefix}"`;
          if (_issue.format === "ends_with")
            return `Няправільны радок: павінен заканчвацца на "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Няправільны радок: павінен змяшчаць "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Няправільны радок: павінен адпавядаць шаблону ${_issue.pattern}`;
          return `Няправільны ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Няправільны лік: павінен быць кратным ${issue.divisor}`;
        case "unrecognized_keys":
          return `Нераспазнаны ${issue.keys.length > 1 ? "ключы" : "ключ"}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Няправільны ключ у ${issue.origin}`;
        case "invalid_union":
          return "Няправільны ўвод";
        case "invalid_element":
          return `Няправільнае значэнне ў ${issue.origin}`;
        default:
          return `Няправільны ўвод`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/ca.cjs
var require_ca = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "caràcters", verb: "contenir" },
      file: { unit: "bytes", verb: "contenir" },
      array: { unit: "elements", verb: "contenir" },
      set: { unit: "elements", verb: "contenir" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "number";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "array";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "entrada",
      email: "adreça electrònica",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "data i hora ISO",
      date: "data ISO",
      time: "hora ISO",
      duration: "durada ISO",
      ipv4: "adreça IPv4",
      ipv6: "adreça IPv6",
      cidrv4: "rang IPv4",
      cidrv6: "rang IPv6",
      base64: "cadena codificada en base64",
      base64url: "cadena codificada en base64url",
      json_string: "cadena JSON",
      e164: "número E.164",
      jwt: "JWT",
      template_literal: "entrada"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Tipus invàlid: s'esperava ${issue.expected}, s'ha rebut ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Valor invàlid: s'esperava ${util.stringifyPrimitive(issue.values[0])}`;
          return `Opció invàlida: s'esperava una de ${util.joinValues(issue.values, " o ")}`;
        case "too_big": {
          const adj = issue.inclusive ? "com a màxim" : "menys de";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Massa gran: s'esperava que ${issue.origin ?? "el valor"} contingués ${adj} ${issue.maximum.toString()} ${sizing.unit ?? "elements"}`;
          return `Massa gran: s'esperava que ${issue.origin ?? "el valor"} fos ${adj} ${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? "com a mínim" : "més de";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Massa petit: s'esperava que ${issue.origin} contingués ${adj} ${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `Massa petit: s'esperava que ${issue.origin} fos ${adj} ${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with") {
            return `Format invàlid: ha de començar amb "${_issue.prefix}"`;
          }
          if (_issue.format === "ends_with")
            return `Format invàlid: ha d'acabar amb "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Format invàlid: ha d'incloure "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Format invàlid: ha de coincidir amb el patró ${_issue.pattern}`;
          return `Format invàlid per a ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Número invàlid: ha de ser múltiple de ${issue.divisor}`;
        case "unrecognized_keys":
          return `Clau${issue.keys.length > 1 ? "s" : ""} no reconeguda${issue.keys.length > 1 ? "s" : ""}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Clau invàlida a ${issue.origin}`;
        case "invalid_union":
          return "Entrada invàlida";
        case "invalid_element":
          return `Element invàlid a ${issue.origin}`;
        default:
          return `Entrada invàlida`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/cs.cjs
var require_cs = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "znaků", verb: "mít" },
      file: { unit: "bajtů", verb: "mít" },
      array: { unit: "prvků", verb: "mít" },
      set: { unit: "prvků", verb: "mít" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "číslo";
        }
        case "string": {
          return "řetězec";
        }
        case "boolean": {
          return "boolean";
        }
        case "bigint": {
          return "bigint";
        }
        case "function": {
          return "funkce";
        }
        case "symbol": {
          return "symbol";
        }
        case "undefined": {
          return "undefined";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "pole";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "regulární výraz",
      email: "e-mailová adresa",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "datum a čas ve formátu ISO",
      date: "datum ve formátu ISO",
      time: "čas ve formátu ISO",
      duration: "doba trvání ISO",
      ipv4: "IPv4 adresa",
      ipv6: "IPv6 adresa",
      cidrv4: "rozsah IPv4",
      cidrv6: "rozsah IPv6",
      base64: "řetězec zakódovaný ve formátu base64",
      base64url: "řetězec zakódovaný ve formátu base64url",
      json_string: "řetězec ve formátu JSON",
      e164: "číslo E.164",
      jwt: "JWT",
      template_literal: "vstup"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Neplatný vstup: očekáváno ${issue.expected}, obdrženo ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Neplatný vstup: očekáváno ${util.stringifyPrimitive(issue.values[0])}`;
          return `Neplatná možnost: očekávána jedna z hodnot ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Hodnota je příliš velká: ${issue.origin ?? "hodnota"} musí mít ${adj}${issue.maximum.toString()} ${sizing.unit ?? "prvků"}`;
          }
          return `Hodnota je příliš velká: ${issue.origin ?? "hodnota"} musí být ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Hodnota je příliš malá: ${issue.origin ?? "hodnota"} musí mít ${adj}${issue.minimum.toString()} ${sizing.unit ?? "prvků"}`;
          }
          return `Hodnota je příliš malá: ${issue.origin ?? "hodnota"} musí být ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `Neplatný řetězec: musí začínat na "${_issue.prefix}"`;
          if (_issue.format === "ends_with")
            return `Neplatný řetězec: musí končit na "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Neplatný řetězec: musí obsahovat "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Neplatný řetězec: musí odpovídat vzoru ${_issue.pattern}`;
          return `Neplatný formát ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Neplatné číslo: musí být násobkem ${issue.divisor}`;
        case "unrecognized_keys":
          return `Neznámé klíče: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Neplatný klíč v ${issue.origin}`;
        case "invalid_union":
          return "Neplatný vstup";
        case "invalid_element":
          return `Neplatná hodnota v ${issue.origin}`;
        default:
          return `Neplatný vstup`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/de.cjs
var require_de = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "Zeichen", verb: "zu haben" },
      file: { unit: "Bytes", verb: "zu haben" },
      array: { unit: "Elemente", verb: "zu haben" },
      set: { unit: "Elemente", verb: "zu haben" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "Zahl";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "Array";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "Eingabe",
      email: "E-Mail-Adresse",
      url: "URL",
      emoji: "Emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO-Datum und -Uhrzeit",
      date: "ISO-Datum",
      time: "ISO-Uhrzeit",
      duration: "ISO-Dauer",
      ipv4: "IPv4-Adresse",
      ipv6: "IPv6-Adresse",
      cidrv4: "IPv4-Bereich",
      cidrv6: "IPv6-Bereich",
      base64: "Base64-codierter String",
      base64url: "Base64-URL-codierter String",
      json_string: "JSON-String",
      e164: "E.164-Nummer",
      jwt: "JWT",
      template_literal: "Eingabe"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Ungültige Eingabe: erwartet ${issue.expected}, erhalten ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Ungültige Eingabe: erwartet ${util.stringifyPrimitive(issue.values[0])}`;
          return `Ungültige Option: erwartet eine von ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Zu groß: erwartet, dass ${issue.origin ?? "Wert"} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "Elemente"} hat`;
          return `Zu groß: erwartet, dass ${issue.origin ?? "Wert"} ${adj}${issue.maximum.toString()} ist`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Zu klein: erwartet, dass ${issue.origin} ${adj}${issue.minimum.toString()} ${sizing.unit} hat`;
          }
          return `Zu klein: erwartet, dass ${issue.origin} ${adj}${issue.minimum.toString()} ist`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `Ungültiger String: muss mit "${_issue.prefix}" beginnen`;
          if (_issue.format === "ends_with")
            return `Ungültiger String: muss mit "${_issue.suffix}" enden`;
          if (_issue.format === "includes")
            return `Ungültiger String: muss "${_issue.includes}" enthalten`;
          if (_issue.format === "regex")
            return `Ungültiger String: muss dem Muster ${_issue.pattern} entsprechen`;
          return `Ungültig: ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Ungültige Zahl: muss ein Vielfaches von ${issue.divisor} sein`;
        case "unrecognized_keys":
          return `${issue.keys.length > 1 ? "Unbekannte Schlüssel" : "Unbekannter Schlüssel"}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Ungültiger Schlüssel in ${issue.origin}`;
        case "invalid_union":
          return "Ungültige Eingabe";
        case "invalid_element":
          return `Ungültiger Wert in ${issue.origin}`;
        default:
          return `Ungültige Eingabe`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/en.cjs
var require_en = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.parsedType = undefined;
  exports.default = default_1;
  var util = __importStar(require_util());
  var parsedType = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  exports.parsedType = parsedType;
  var error = () => {
    const Sizable = {
      string: { unit: "characters", verb: "to have" },
      file: { unit: "bytes", verb: "to have" },
      array: { unit: "items", verb: "to have" },
      set: { unit: "items", verb: "to have" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const Nouns = {
      regex: "input",
      email: "email address",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO datetime",
      date: "ISO date",
      time: "ISO time",
      duration: "ISO duration",
      ipv4: "IPv4 address",
      ipv6: "IPv6 address",
      cidrv4: "IPv4 range",
      cidrv6: "IPv6 range",
      base64: "base64-encoded string",
      base64url: "base64url-encoded string",
      json_string: "JSON string",
      e164: "E.164 number",
      jwt: "JWT",
      template_literal: "input"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Invalid input: expected ${issue.expected}, received ${(0, exports.parsedType)(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Invalid input: expected ${util.stringifyPrimitive(issue.values[0])}`;
          return `Invalid option: expected one of ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Too big: expected ${issue.origin ?? "value"} to have ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elements"}`;
          return `Too big: expected ${issue.origin ?? "value"} to be ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Too small: expected ${issue.origin} to have ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `Too small: expected ${issue.origin} to be ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with") {
            return `Invalid string: must start with "${_issue.prefix}"`;
          }
          if (_issue.format === "ends_with")
            return `Invalid string: must end with "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Invalid string: must include "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Invalid string: must match pattern ${_issue.pattern}`;
          return `Invalid ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Invalid number: must be a multiple of ${issue.divisor}`;
        case "unrecognized_keys":
          return `Unrecognized key${issue.keys.length > 1 ? "s" : ""}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Invalid key in ${issue.origin}`;
        case "invalid_union":
          return "Invalid input";
        case "invalid_element":
          return `Invalid value in ${issue.origin}`;
        default:
          return `Invalid input`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/eo.cjs
var require_eo = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.parsedType = undefined;
  exports.default = default_1;
  var util = __importStar(require_util());
  var parsedType = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "nombro";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "tabelo";
        }
        if (data === null) {
          return "senvalora";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  exports.parsedType = parsedType;
  var error = () => {
    const Sizable = {
      string: { unit: "karaktrojn", verb: "havi" },
      file: { unit: "bajtojn", verb: "havi" },
      array: { unit: "elementojn", verb: "havi" },
      set: { unit: "elementojn", verb: "havi" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const Nouns = {
      regex: "enigo",
      email: "retadreso",
      url: "URL",
      emoji: "emoĝio",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO-datotempo",
      date: "ISO-dato",
      time: "ISO-tempo",
      duration: "ISO-daŭro",
      ipv4: "IPv4-adreso",
      ipv6: "IPv6-adreso",
      cidrv4: "IPv4-rango",
      cidrv6: "IPv6-rango",
      base64: "64-ume kodita karaktraro",
      base64url: "URL-64-ume kodita karaktraro",
      json_string: "JSON-karaktraro",
      e164: "E.164-nombro",
      jwt: "JWT",
      template_literal: "enigo"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Nevalida enigo: atendiĝis ${issue.expected}, riceviĝis ${(0, exports.parsedType)(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Nevalida enigo: atendiĝis ${util.stringifyPrimitive(issue.values[0])}`;
          return `Nevalida opcio: atendiĝis unu el ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Tro granda: atendiĝis ke ${issue.origin ?? "valoro"} havu ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elementojn"}`;
          return `Tro granda: atendiĝis ke ${issue.origin ?? "valoro"} havu ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Tro malgranda: atendiĝis ke ${issue.origin} havu ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `Tro malgranda: atendiĝis ke ${issue.origin} estu ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `Nevalida karaktraro: devas komenciĝi per "${_issue.prefix}"`;
          if (_issue.format === "ends_with")
            return `Nevalida karaktraro: devas finiĝi per "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Nevalida karaktraro: devas inkluzivi "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Nevalida karaktraro: devas kongrui kun la modelo ${_issue.pattern}`;
          return `Nevalida ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Nevalida nombro: devas esti oblo de ${issue.divisor}`;
        case "unrecognized_keys":
          return `Nekonata${issue.keys.length > 1 ? "j" : ""} ŝlosilo${issue.keys.length > 1 ? "j" : ""}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Nevalida ŝlosilo en ${issue.origin}`;
        case "invalid_union":
          return "Nevalida enigo";
        case "invalid_element":
          return `Nevalida valoro en ${issue.origin}`;
        default:
          return `Nevalida enigo`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/es.cjs
var require_es = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "caracteres", verb: "tener" },
      file: { unit: "bytes", verb: "tener" },
      array: { unit: "elementos", verb: "tener" },
      set: { unit: "elementos", verb: "tener" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "número";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "arreglo";
          }
          if (data === null) {
            return "nulo";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "entrada",
      email: "dirección de correo electrónico",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "fecha y hora ISO",
      date: "fecha ISO",
      time: "hora ISO",
      duration: "duración ISO",
      ipv4: "dirección IPv4",
      ipv6: "dirección IPv6",
      cidrv4: "rango IPv4",
      cidrv6: "rango IPv6",
      base64: "cadena codificada en base64",
      base64url: "URL codificada en base64",
      json_string: "cadena JSON",
      e164: "número E.164",
      jwt: "JWT",
      template_literal: "entrada"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Entrada inválida: se esperaba ${issue.expected}, recibido ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Entrada inválida: se esperaba ${util.stringifyPrimitive(issue.values[0])}`;
          return `Opción inválida: se esperaba una de ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Demasiado grande: se esperaba que ${issue.origin ?? "valor"} tuviera ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elementos"}`;
          return `Demasiado grande: se esperaba que ${issue.origin ?? "valor"} fuera ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Demasiado pequeño: se esperaba que ${issue.origin} tuviera ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `Demasiado pequeño: se esperaba que ${issue.origin} fuera ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `Cadena inválida: debe comenzar con "${_issue.prefix}"`;
          if (_issue.format === "ends_with")
            return `Cadena inválida: debe terminar en "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Cadena inválida: debe incluir "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Cadena inválida: debe coincidir con el patrón ${_issue.pattern}`;
          return `Inválido ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Número inválido: debe ser múltiplo de ${issue.divisor}`;
        case "unrecognized_keys":
          return `Llave${issue.keys.length > 1 ? "s" : ""} desconocida${issue.keys.length > 1 ? "s" : ""}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Llave inválida en ${issue.origin}`;
        case "invalid_union":
          return "Entrada inválida";
        case "invalid_element":
          return `Valor inválido en ${issue.origin}`;
        default:
          return `Entrada inválida`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/fa.cjs
var require_fa = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "کاراکتر", verb: "داشته باشد" },
      file: { unit: "بایت", verb: "داشته باشد" },
      array: { unit: "آیتم", verb: "داشته باشد" },
      set: { unit: "آیتم", verb: "داشته باشد" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "عدد";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "آرایه";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "ورودی",
      email: "آدرس ایمیل",
      url: "URL",
      emoji: "ایموجی",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "تاریخ و زمان ایزو",
      date: "تاریخ ایزو",
      time: "زمان ایزو",
      duration: "مدت زمان ایزو",
      ipv4: "IPv4 آدرس",
      ipv6: "IPv6 آدرس",
      cidrv4: "IPv4 دامنه",
      cidrv6: "IPv6 دامنه",
      base64: "base64-encoded رشته",
      base64url: "base64url-encoded رشته",
      json_string: "JSON رشته",
      e164: "E.164 عدد",
      jwt: "JWT",
      template_literal: "ورودی"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `ورودی نامعتبر: می‌بایست ${issue.expected} می‌بود، ${parsedType(issue.input)} دریافت شد`;
        case "invalid_value":
          if (issue.values.length === 1) {
            return `ورودی نامعتبر: می‌بایست ${util.stringifyPrimitive(issue.values[0])} می‌بود`;
          }
          return `گزینه نامعتبر: می‌بایست یکی از ${util.joinValues(issue.values, "|")} می‌بود`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `خیلی بزرگ: ${issue.origin ?? "مقدار"} باید ${adj}${issue.maximum.toString()} ${sizing.unit ?? "عنصر"} باشد`;
          }
          return `خیلی بزرگ: ${issue.origin ?? "مقدار"} باید ${adj}${issue.maximum.toString()} باشد`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `خیلی کوچک: ${issue.origin} باید ${adj}${issue.minimum.toString()} ${sizing.unit} باشد`;
          }
          return `خیلی کوچک: ${issue.origin} باید ${adj}${issue.minimum.toString()} باشد`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with") {
            return `رشته نامعتبر: باید با "${_issue.prefix}" شروع شود`;
          }
          if (_issue.format === "ends_with") {
            return `رشته نامعتبر: باید با "${_issue.suffix}" تمام شود`;
          }
          if (_issue.format === "includes") {
            return `رشته نامعتبر: باید شامل "${_issue.includes}" باشد`;
          }
          if (_issue.format === "regex") {
            return `رشته نامعتبر: باید با الگوی ${_issue.pattern} مطابقت داشته باشد`;
          }
          return `${Nouns[_issue.format] ?? issue.format} نامعتبر`;
        }
        case "not_multiple_of":
          return `عدد نامعتبر: باید مضرب ${issue.divisor} باشد`;
        case "unrecognized_keys":
          return `کلید${issue.keys.length > 1 ? "های" : ""} ناشناس: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `کلید ناشناس در ${issue.origin}`;
        case "invalid_union":
          return `ورودی نامعتبر`;
        case "invalid_element":
          return `مقدار نامعتبر در ${issue.origin}`;
        default:
          return `ورودی نامعتبر`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/fi.cjs
var require_fi = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "merkkiä", subject: "merkkijonon" },
      file: { unit: "tavua", subject: "tiedoston" },
      array: { unit: "alkiota", subject: "listan" },
      set: { unit: "alkiota", subject: "joukon" },
      number: { unit: "", subject: "luvun" },
      bigint: { unit: "", subject: "suuren kokonaisluvun" },
      int: { unit: "", subject: "kokonaisluvun" },
      date: { unit: "", subject: "päivämäärän" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "number";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "array";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "säännöllinen lauseke",
      email: "sähköpostiosoite",
      url: "URL-osoite",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO-aikaleima",
      date: "ISO-päivämäärä",
      time: "ISO-aika",
      duration: "ISO-kesto",
      ipv4: "IPv4-osoite",
      ipv6: "IPv6-osoite",
      cidrv4: "IPv4-alue",
      cidrv6: "IPv6-alue",
      base64: "base64-koodattu merkkijono",
      base64url: "base64url-koodattu merkkijono",
      json_string: "JSON-merkkijono",
      e164: "E.164-luku",
      jwt: "JWT",
      template_literal: "templaattimerkkijono"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Virheellinen tyyppi: odotettiin ${issue.expected}, oli ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Virheellinen syöte: täytyy olla ${util.stringifyPrimitive(issue.values[0])}`;
          return `Virheellinen valinta: täytyy olla yksi seuraavista: ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Liian suuri: ${sizing.subject} täytyy olla ${adj}${issue.maximum.toString()} ${sizing.unit}`.trim();
          }
          return `Liian suuri: arvon täytyy olla ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Liian pieni: ${sizing.subject} täytyy olla ${adj}${issue.minimum.toString()} ${sizing.unit}`.trim();
          }
          return `Liian pieni: arvon täytyy olla ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `Virheellinen syöte: täytyy alkaa "${_issue.prefix}"`;
          if (_issue.format === "ends_with")
            return `Virheellinen syöte: täytyy loppua "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Virheellinen syöte: täytyy sisältää "${_issue.includes}"`;
          if (_issue.format === "regex") {
            return `Virheellinen syöte: täytyy vastata säännöllistä lauseketta ${_issue.pattern}`;
          }
          return `Virheellinen ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Virheellinen luku: täytyy olla luvun ${issue.divisor} monikerta`;
        case "unrecognized_keys":
          return `${issue.keys.length > 1 ? "Tuntemattomat avaimet" : "Tuntematon avain"}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return "Virheellinen avain tietueessa";
        case "invalid_union":
          return "Virheellinen unioni";
        case "invalid_element":
          return "Virheellinen arvo joukossa";
        default:
          return `Virheellinen syöte`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/fr.cjs
var require_fr = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "caractères", verb: "avoir" },
      file: { unit: "octets", verb: "avoir" },
      array: { unit: "éléments", verb: "avoir" },
      set: { unit: "éléments", verb: "avoir" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "nombre";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "tableau";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "entrée",
      email: "adresse e-mail",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "date et heure ISO",
      date: "date ISO",
      time: "heure ISO",
      duration: "durée ISO",
      ipv4: "adresse IPv4",
      ipv6: "adresse IPv6",
      cidrv4: "plage IPv4",
      cidrv6: "plage IPv6",
      base64: "chaîne encodée en base64",
      base64url: "chaîne encodée en base64url",
      json_string: "chaîne JSON",
      e164: "numéro E.164",
      jwt: "JWT",
      template_literal: "entrée"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Entrée invalide : ${issue.expected} attendu, ${parsedType(issue.input)} reçu`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Entrée invalide : ${util.stringifyPrimitive(issue.values[0])} attendu`;
          return `Option invalide : une valeur parmi ${util.joinValues(issue.values, "|")} attendue`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Trop grand : ${issue.origin ?? "valeur"} doit ${sizing.verb} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "élément(s)"}`;
          return `Trop grand : ${issue.origin ?? "valeur"} doit être ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Trop petit : ${issue.origin} doit ${sizing.verb} ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `Trop petit : ${issue.origin} doit être ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `Chaîne invalide : doit commencer par "${_issue.prefix}"`;
          if (_issue.format === "ends_with")
            return `Chaîne invalide : doit se terminer par "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Chaîne invalide : doit inclure "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Chaîne invalide : doit correspondre au modèle ${_issue.pattern}`;
          return `${Nouns[_issue.format] ?? issue.format} invalide`;
        }
        case "not_multiple_of":
          return `Nombre invalide : doit être un multiple de ${issue.divisor}`;
        case "unrecognized_keys":
          return `Clé${issue.keys.length > 1 ? "s" : ""} non reconnue${issue.keys.length > 1 ? "s" : ""} : ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Clé invalide dans ${issue.origin}`;
        case "invalid_union":
          return "Entrée invalide";
        case "invalid_element":
          return `Valeur invalide dans ${issue.origin}`;
        default:
          return `Entrée invalide`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/fr-CA.cjs
var require_fr_CA = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "caractères", verb: "avoir" },
      file: { unit: "octets", verb: "avoir" },
      array: { unit: "éléments", verb: "avoir" },
      set: { unit: "éléments", verb: "avoir" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "number";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "array";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "entrée",
      email: "adresse courriel",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "date-heure ISO",
      date: "date ISO",
      time: "heure ISO",
      duration: "durée ISO",
      ipv4: "adresse IPv4",
      ipv6: "adresse IPv6",
      cidrv4: "plage IPv4",
      cidrv6: "plage IPv6",
      base64: "chaîne encodée en base64",
      base64url: "chaîne encodée en base64url",
      json_string: "chaîne JSON",
      e164: "numéro E.164",
      jwt: "JWT",
      template_literal: "entrée"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Entrée invalide : attendu ${issue.expected}, reçu ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Entrée invalide : attendu ${util.stringifyPrimitive(issue.values[0])}`;
          return `Option invalide : attendu l'une des valeurs suivantes ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "≤" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Trop grand : attendu que ${issue.origin ?? "la valeur"} ait ${adj}${issue.maximum.toString()} ${sizing.unit}`;
          return `Trop grand : attendu que ${issue.origin ?? "la valeur"} soit ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? "≥" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Trop petit : attendu que ${issue.origin} ait ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `Trop petit : attendu que ${issue.origin} soit ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with") {
            return `Chaîne invalide : doit commencer par "${_issue.prefix}"`;
          }
          if (_issue.format === "ends_with")
            return `Chaîne invalide : doit se terminer par "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Chaîne invalide : doit inclure "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Chaîne invalide : doit correspondre au motif ${_issue.pattern}`;
          return `${Nouns[_issue.format] ?? issue.format} invalide`;
        }
        case "not_multiple_of":
          return `Nombre invalide : doit être un multiple de ${issue.divisor}`;
        case "unrecognized_keys":
          return `Clé${issue.keys.length > 1 ? "s" : ""} non reconnue${issue.keys.length > 1 ? "s" : ""} : ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Clé invalide dans ${issue.origin}`;
        case "invalid_union":
          return "Entrée invalide";
        case "invalid_element":
          return `Valeur invalide dans ${issue.origin}`;
        default:
          return `Entrée invalide`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/he.cjs
var require_he = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "אותיות", verb: "לכלול" },
      file: { unit: "בייטים", verb: "לכלול" },
      array: { unit: "פריטים", verb: "לכלול" },
      set: { unit: "פריטים", verb: "לכלול" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "number";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "array";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "קלט",
      email: "כתובת אימייל",
      url: "כתובת רשת",
      emoji: "אימוג'י",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "תאריך וזמן ISO",
      date: "תאריך ISO",
      time: "זמן ISO",
      duration: "משך זמן ISO",
      ipv4: "כתובת IPv4",
      ipv6: "כתובת IPv6",
      cidrv4: "טווח IPv4",
      cidrv6: "טווח IPv6",
      base64: "מחרוזת בבסיס 64",
      base64url: "מחרוזת בבסיס 64 לכתובות רשת",
      json_string: "מחרוזת JSON",
      e164: "מספר E.164",
      jwt: "JWT",
      template_literal: "קלט"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `קלט לא תקין: צריך ${issue.expected}, התקבל ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `קלט לא תקין: צריך ${util.stringifyPrimitive(issue.values[0])}`;
          return `קלט לא תקין: צריך אחת מהאפשרויות  ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `גדול מדי: ${issue.origin ?? "value"} צריך להיות ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elements"}`;
          return `גדול מדי: ${issue.origin ?? "value"} צריך להיות ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `קטן מדי: ${issue.origin} צריך להיות ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `קטן מדי: ${issue.origin} צריך להיות ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `מחרוזת לא תקינה: חייבת להתחיל ב"${_issue.prefix}"`;
          if (_issue.format === "ends_with")
            return `מחרוזת לא תקינה: חייבת להסתיים ב "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `מחרוזת לא תקינה: חייבת לכלול "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `מחרוזת לא תקינה: חייבת להתאים לתבנית ${_issue.pattern}`;
          return `${Nouns[_issue.format] ?? issue.format} לא תקין`;
        }
        case "not_multiple_of":
          return `מספר לא תקין: חייב להיות מכפלה של ${issue.divisor}`;
        case "unrecognized_keys":
          return `מפתח${issue.keys.length > 1 ? "ות" : ""} לא מזוה${issue.keys.length > 1 ? "ים" : "ה"}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `מפתח לא תקין ב${issue.origin}`;
        case "invalid_union":
          return "קלט לא תקין";
        case "invalid_element":
          return `ערך לא תקין ב${issue.origin}`;
        default:
          return `קלט לא תקין`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/hu.cjs
var require_hu = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "karakter", verb: "legyen" },
      file: { unit: "byte", verb: "legyen" },
      array: { unit: "elem", verb: "legyen" },
      set: { unit: "elem", verb: "legyen" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "szám";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "tömb";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "bemenet",
      email: "email cím",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO időbélyeg",
      date: "ISO dátum",
      time: "ISO idő",
      duration: "ISO időintervallum",
      ipv4: "IPv4 cím",
      ipv6: "IPv6 cím",
      cidrv4: "IPv4 tartomány",
      cidrv6: "IPv6 tartomány",
      base64: "base64-kódolt string",
      base64url: "base64url-kódolt string",
      json_string: "JSON string",
      e164: "E.164 szám",
      jwt: "JWT",
      template_literal: "bemenet"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Érvénytelen bemenet: a várt érték ${issue.expected}, a kapott érték ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Érvénytelen bemenet: a várt érték ${util.stringifyPrimitive(issue.values[0])}`;
          return `Érvénytelen opció: valamelyik érték várt ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Túl nagy: ${issue.origin ?? "érték"} mérete túl nagy ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elem"}`;
          return `Túl nagy: a bemeneti érték ${issue.origin ?? "érték"} túl nagy: ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Túl kicsi: a bemeneti érték ${issue.origin} mérete túl kicsi ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `Túl kicsi: a bemeneti érték ${issue.origin} túl kicsi ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `Érvénytelen string: "${_issue.prefix}" értékkel kell kezdődnie`;
          if (_issue.format === "ends_with")
            return `Érvénytelen string: "${_issue.suffix}" értékkel kell végződnie`;
          if (_issue.format === "includes")
            return `Érvénytelen string: "${_issue.includes}" értéket kell tartalmaznia`;
          if (_issue.format === "regex")
            return `Érvénytelen string: ${_issue.pattern} mintának kell megfelelnie`;
          return `Érvénytelen ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Érvénytelen szám: ${issue.divisor} többszörösének kell lennie`;
        case "unrecognized_keys":
          return `Ismeretlen kulcs${issue.keys.length > 1 ? "s" : ""}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Érvénytelen kulcs ${issue.origin}`;
        case "invalid_union":
          return "Érvénytelen bemenet";
        case "invalid_element":
          return `Érvénytelen érték: ${issue.origin}`;
        default:
          return `Érvénytelen bemenet`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/id.cjs
var require_id = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "karakter", verb: "memiliki" },
      file: { unit: "byte", verb: "memiliki" },
      array: { unit: "item", verb: "memiliki" },
      set: { unit: "item", verb: "memiliki" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "number";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "array";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "input",
      email: "alamat email",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "tanggal dan waktu format ISO",
      date: "tanggal format ISO",
      time: "jam format ISO",
      duration: "durasi format ISO",
      ipv4: "alamat IPv4",
      ipv6: "alamat IPv6",
      cidrv4: "rentang alamat IPv4",
      cidrv6: "rentang alamat IPv6",
      base64: "string dengan enkode base64",
      base64url: "string dengan enkode base64url",
      json_string: "string JSON",
      e164: "angka E.164",
      jwt: "JWT",
      template_literal: "input"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Input tidak valid: diharapkan ${issue.expected}, diterima ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Input tidak valid: diharapkan ${util.stringifyPrimitive(issue.values[0])}`;
          return `Pilihan tidak valid: diharapkan salah satu dari ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Terlalu besar: diharapkan ${issue.origin ?? "value"} memiliki ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elemen"}`;
          return `Terlalu besar: diharapkan ${issue.origin ?? "value"} menjadi ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Terlalu kecil: diharapkan ${issue.origin} memiliki ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `Terlalu kecil: diharapkan ${issue.origin} menjadi ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `String tidak valid: harus dimulai dengan "${_issue.prefix}"`;
          if (_issue.format === "ends_with")
            return `String tidak valid: harus berakhir dengan "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `String tidak valid: harus menyertakan "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `String tidak valid: harus sesuai pola ${_issue.pattern}`;
          return `${Nouns[_issue.format] ?? issue.format} tidak valid`;
        }
        case "not_multiple_of":
          return `Angka tidak valid: harus kelipatan dari ${issue.divisor}`;
        case "unrecognized_keys":
          return `Kunci tidak dikenali ${issue.keys.length > 1 ? "s" : ""}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Kunci tidak valid di ${issue.origin}`;
        case "invalid_union":
          return "Input tidak valid";
        case "invalid_element":
          return `Nilai tidak valid di ${issue.origin}`;
        default:
          return `Input tidak valid`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/it.cjs
var require_it = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "caratteri", verb: "avere" },
      file: { unit: "byte", verb: "avere" },
      array: { unit: "elementi", verb: "avere" },
      set: { unit: "elementi", verb: "avere" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "numero";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "vettore";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "input",
      email: "indirizzo email",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "data e ora ISO",
      date: "data ISO",
      time: "ora ISO",
      duration: "durata ISO",
      ipv4: "indirizzo IPv4",
      ipv6: "indirizzo IPv6",
      cidrv4: "intervallo IPv4",
      cidrv6: "intervallo IPv6",
      base64: "stringa codificata in base64",
      base64url: "URL codificata in base64",
      json_string: "stringa JSON",
      e164: "numero E.164",
      jwt: "JWT",
      template_literal: "input"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Input non valido: atteso ${issue.expected}, ricevuto ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Input non valido: atteso ${util.stringifyPrimitive(issue.values[0])}`;
          return `Opzione non valida: atteso uno tra ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Troppo grande: ${issue.origin ?? "valore"} deve avere ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elementi"}`;
          return `Troppo grande: ${issue.origin ?? "valore"} deve essere ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Troppo piccolo: ${issue.origin} deve avere ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `Troppo piccolo: ${issue.origin} deve essere ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `Stringa non valida: deve iniziare con "${_issue.prefix}"`;
          if (_issue.format === "ends_with")
            return `Stringa non valida: deve terminare con "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Stringa non valida: deve includere "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Stringa non valida: deve corrispondere al pattern ${_issue.pattern}`;
          return `Invalid ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Numero non valido: deve essere un multiplo di ${issue.divisor}`;
        case "unrecognized_keys":
          return `Chiav${issue.keys.length > 1 ? "i" : "e"} non riconosciut${issue.keys.length > 1 ? "e" : "a"}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Chiave non valida in ${issue.origin}`;
        case "invalid_union":
          return "Input non valido";
        case "invalid_element":
          return `Valore non valido in ${issue.origin}`;
        default:
          return `Input non valido`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/ja.cjs
var require_ja = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "文字", verb: "である" },
      file: { unit: "バイト", verb: "である" },
      array: { unit: "要素", verb: "である" },
      set: { unit: "要素", verb: "である" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "数値";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "配列";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "入力値",
      email: "メールアドレス",
      url: "URL",
      emoji: "絵文字",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO日時",
      date: "ISO日付",
      time: "ISO時刻",
      duration: "ISO期間",
      ipv4: "IPv4アドレス",
      ipv6: "IPv6アドレス",
      cidrv4: "IPv4範囲",
      cidrv6: "IPv6範囲",
      base64: "base64エンコード文字列",
      base64url: "base64urlエンコード文字列",
      json_string: "JSON文字列",
      e164: "E.164番号",
      jwt: "JWT",
      template_literal: "入力値"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `無効な入力: ${issue.expected}が期待されましたが、${parsedType(issue.input)}が入力されました`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `無効な入力: ${util.stringifyPrimitive(issue.values[0])}が期待されました`;
          return `無効な選択: ${util.joinValues(issue.values, "、")}のいずれかである必要があります`;
        case "too_big": {
          const adj = issue.inclusive ? "以下である" : "より小さい";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `大きすぎる値: ${issue.origin ?? "値"}は${issue.maximum.toString()}${sizing.unit ?? "要素"}${adj}必要があります`;
          return `大きすぎる値: ${issue.origin ?? "値"}は${issue.maximum.toString()}${adj}必要があります`;
        }
        case "too_small": {
          const adj = issue.inclusive ? "以上である" : "より大きい";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `小さすぎる値: ${issue.origin}は${issue.minimum.toString()}${sizing.unit}${adj}必要があります`;
          return `小さすぎる値: ${issue.origin}は${issue.minimum.toString()}${adj}必要があります`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `無効な文字列: "${_issue.prefix}"で始まる必要があります`;
          if (_issue.format === "ends_with")
            return `無効な文字列: "${_issue.suffix}"で終わる必要があります`;
          if (_issue.format === "includes")
            return `無効な文字列: "${_issue.includes}"を含む必要があります`;
          if (_issue.format === "regex")
            return `無効な文字列: パターン${_issue.pattern}に一致する必要があります`;
          return `無効な${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `無効な数値: ${issue.divisor}の倍数である必要があります`;
        case "unrecognized_keys":
          return `認識されていないキー${issue.keys.length > 1 ? "群" : ""}: ${util.joinValues(issue.keys, "、")}`;
        case "invalid_key":
          return `${issue.origin}内の無効なキー`;
        case "invalid_union":
          return "無効な入力";
        case "invalid_element":
          return `${issue.origin}内の無効な値`;
        default:
          return `無効な入力`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/kh.cjs
var require_kh = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "តួអក្សរ", verb: "គួរមាន" },
      file: { unit: "បៃ", verb: "គួរមាន" },
      array: { unit: "ធាតុ", verb: "គួរមាន" },
      set: { unit: "ធាតុ", verb: "គួរមាន" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "មិនមែនជាលេខ (NaN)" : "លេខ";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "អារេ (Array)";
          }
          if (data === null) {
            return "គ្មានតម្លៃ (null)";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "ទិន្នន័យបញ្ចូល",
      email: "អាសយដ្ឋានអ៊ីមែល",
      url: "URL",
      emoji: "សញ្ញាអារម្មណ៍",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "កាលបរិច្ឆេទ និងម៉ោង ISO",
      date: "កាលបរិច្ឆេទ ISO",
      time: "ម៉ោង ISO",
      duration: "រយៈពេល ISO",
      ipv4: "អាសយដ្ឋាន IPv4",
      ipv6: "អាសយដ្ឋាន IPv6",
      cidrv4: "ដែនអាសយដ្ឋាន IPv4",
      cidrv6: "ដែនអាសយដ្ឋាន IPv6",
      base64: "ខ្សែអក្សរអ៊ិកូដ base64",
      base64url: "ខ្សែអក្សរអ៊ិកូដ base64url",
      json_string: "ខ្សែអក្សរ JSON",
      e164: "លេខ E.164",
      jwt: "JWT",
      template_literal: "ទិន្នន័យបញ្ចូល"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `ទិន្នន័យបញ្ចូលមិនត្រឹមត្រូវ៖ ត្រូវការ ${issue.expected} ប៉ុន្តែទទួលបាន ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `ទិន្នន័យបញ្ចូលមិនត្រឹមត្រូវ៖ ត្រូវការ ${util.stringifyPrimitive(issue.values[0])}`;
          return `ជម្រើសមិនត្រឹមត្រូវ៖ ត្រូវជាមួយក្នុងចំណោម ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `ធំពេក៖ ត្រូវការ ${issue.origin ?? "តម្លៃ"} ${adj} ${issue.maximum.toString()} ${sizing.unit ?? "ធាតុ"}`;
          return `ធំពេក៖ ត្រូវការ ${issue.origin ?? "តម្លៃ"} ${adj} ${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `តូចពេក៖ ត្រូវការ ${issue.origin} ${adj} ${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `តូចពេក៖ ត្រូវការ ${issue.origin} ${adj} ${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with") {
            return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវចាប់ផ្តើមដោយ "${_issue.prefix}"`;
          }
          if (_issue.format === "ends_with")
            return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវបញ្ចប់ដោយ "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវមាន "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `ខ្សែអក្សរមិនត្រឹមត្រូវ៖ ត្រូវតែផ្គូផ្គងនឹងទម្រង់ដែលបានកំណត់ ${_issue.pattern}`;
          return `មិនត្រឹមត្រូវ៖ ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `លេខមិនត្រឹមត្រូវ៖ ត្រូវតែជាពហុគុណនៃ ${issue.divisor}`;
        case "unrecognized_keys":
          return `រកឃើញសោមិនស្គាល់៖ ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `សោមិនត្រឹមត្រូវនៅក្នុង ${issue.origin}`;
        case "invalid_union":
          return `ទិន្នន័យមិនត្រឹមត្រូវ`;
        case "invalid_element":
          return `ទិន្នន័យមិនត្រឹមត្រូវនៅក្នុង ${issue.origin}`;
        default:
          return `ទិន្នន័យមិនត្រឹមត្រូវ`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/ko.cjs
var require_ko = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "문자", verb: "to have" },
      file: { unit: "바이트", verb: "to have" },
      array: { unit: "개", verb: "to have" },
      set: { unit: "개", verb: "to have" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "number";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "array";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "입력",
      email: "이메일 주소",
      url: "URL",
      emoji: "이모지",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO 날짜시간",
      date: "ISO 날짜",
      time: "ISO 시간",
      duration: "ISO 기간",
      ipv4: "IPv4 주소",
      ipv6: "IPv6 주소",
      cidrv4: "IPv4 범위",
      cidrv6: "IPv6 범위",
      base64: "base64 인코딩 문자열",
      base64url: "base64url 인코딩 문자열",
      json_string: "JSON 문자열",
      e164: "E.164 번호",
      jwt: "JWT",
      template_literal: "입력"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `잘못된 입력: 예상 타입은 ${issue.expected}, 받은 타입은 ${parsedType(issue.input)}입니다`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `잘못된 입력: 값은 ${util.stringifyPrimitive(issue.values[0])} 이어야 합니다`;
          return `잘못된 옵션: ${util.joinValues(issue.values, "또는 ")} 중 하나여야 합니다`;
        case "too_big": {
          const adj = issue.inclusive ? "이하" : "미만";
          const suffix = adj === "미만" ? "이어야 합니다" : "여야 합니다";
          const sizing = getSizing(issue.origin);
          const unit = sizing?.unit ?? "요소";
          if (sizing)
            return `${issue.origin ?? "값"}이 너무 큽니다: ${issue.maximum.toString()}${unit} ${adj}${suffix}`;
          return `${issue.origin ?? "값"}이 너무 큽니다: ${issue.maximum.toString()} ${adj}${suffix}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? "이상" : "초과";
          const suffix = adj === "이상" ? "이어야 합니다" : "여야 합니다";
          const sizing = getSizing(issue.origin);
          const unit = sizing?.unit ?? "요소";
          if (sizing) {
            return `${issue.origin ?? "값"}이 너무 작습니다: ${issue.minimum.toString()}${unit} ${adj}${suffix}`;
          }
          return `${issue.origin ?? "값"}이 너무 작습니다: ${issue.minimum.toString()} ${adj}${suffix}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with") {
            return `잘못된 문자열: "${_issue.prefix}"(으)로 시작해야 합니다`;
          }
          if (_issue.format === "ends_with")
            return `잘못된 문자열: "${_issue.suffix}"(으)로 끝나야 합니다`;
          if (_issue.format === "includes")
            return `잘못된 문자열: "${_issue.includes}"을(를) 포함해야 합니다`;
          if (_issue.format === "regex")
            return `잘못된 문자열: 정규식 ${_issue.pattern} 패턴과 일치해야 합니다`;
          return `잘못된 ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `잘못된 숫자: ${issue.divisor}의 배수여야 합니다`;
        case "unrecognized_keys":
          return `인식할 수 없는 키: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `잘못된 키: ${issue.origin}`;
        case "invalid_union":
          return `잘못된 입력`;
        case "invalid_element":
          return `잘못된 값: ${issue.origin}`;
        default:
          return `잘못된 입력`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/mk.cjs
var require_mk = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "знаци", verb: "да имаат" },
      file: { unit: "бајти", verb: "да имаат" },
      array: { unit: "ставки", verb: "да имаат" },
      set: { unit: "ставки", verb: "да имаат" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "број";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "низа";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "внес",
      email: "адреса на е-пошта",
      url: "URL",
      emoji: "емоџи",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO датум и време",
      date: "ISO датум",
      time: "ISO време",
      duration: "ISO времетраење",
      ipv4: "IPv4 адреса",
      ipv6: "IPv6 адреса",
      cidrv4: "IPv4 опсег",
      cidrv6: "IPv6 опсег",
      base64: "base64-енкодирана низа",
      base64url: "base64url-енкодирана низа",
      json_string: "JSON низа",
      e164: "E.164 број",
      jwt: "JWT",
      template_literal: "внес"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Грешен внес: се очекува ${issue.expected}, примено ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Invalid input: expected ${util.stringifyPrimitive(issue.values[0])}`;
          return `Грешана опција: се очекува една ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Премногу голем: се очекува ${issue.origin ?? "вредноста"} да има ${adj}${issue.maximum.toString()} ${sizing.unit ?? "елементи"}`;
          return `Премногу голем: се очекува ${issue.origin ?? "вредноста"} да биде ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Премногу мал: се очекува ${issue.origin} да има ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `Премногу мал: се очекува ${issue.origin} да биде ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with") {
            return `Неважечка низа: мора да започнува со "${_issue.prefix}"`;
          }
          if (_issue.format === "ends_with")
            return `Неважечка низа: мора да завршува со "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Неважечка низа: мора да вклучува "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Неважечка низа: мора да одгоара на патернот ${_issue.pattern}`;
          return `Invalid ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Грешен број: мора да биде делив со ${issue.divisor}`;
        case "unrecognized_keys":
          return `${issue.keys.length > 1 ? "Непрепознаени клучеви" : "Непрепознаен клуч"}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Грешен клуч во ${issue.origin}`;
        case "invalid_union":
          return "Грешен внес";
        case "invalid_element":
          return `Грешна вредност во ${issue.origin}`;
        default:
          return `Грешен внес`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/ms.cjs
var require_ms = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "aksara", verb: "mempunyai" },
      file: { unit: "bait", verb: "mempunyai" },
      array: { unit: "elemen", verb: "mempunyai" },
      set: { unit: "elemen", verb: "mempunyai" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "nombor";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "array";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "input",
      email: "alamat e-mel",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "tarikh masa ISO",
      date: "tarikh ISO",
      time: "masa ISO",
      duration: "tempoh ISO",
      ipv4: "alamat IPv4",
      ipv6: "alamat IPv6",
      cidrv4: "julat IPv4",
      cidrv6: "julat IPv6",
      base64: "string dikodkan base64",
      base64url: "string dikodkan base64url",
      json_string: "string JSON",
      e164: "nombor E.164",
      jwt: "JWT",
      template_literal: "input"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Input tidak sah: dijangka ${issue.expected}, diterima ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Input tidak sah: dijangka ${util.stringifyPrimitive(issue.values[0])}`;
          return `Pilihan tidak sah: dijangka salah satu daripada ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Terlalu besar: dijangka ${issue.origin ?? "nilai"} ${sizing.verb} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elemen"}`;
          return `Terlalu besar: dijangka ${issue.origin ?? "nilai"} adalah ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Terlalu kecil: dijangka ${issue.origin} ${sizing.verb} ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `Terlalu kecil: dijangka ${issue.origin} adalah ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `String tidak sah: mesti bermula dengan "${_issue.prefix}"`;
          if (_issue.format === "ends_with")
            return `String tidak sah: mesti berakhir dengan "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `String tidak sah: mesti mengandungi "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `String tidak sah: mesti sepadan dengan corak ${_issue.pattern}`;
          return `${Nouns[_issue.format] ?? issue.format} tidak sah`;
        }
        case "not_multiple_of":
          return `Nombor tidak sah: perlu gandaan ${issue.divisor}`;
        case "unrecognized_keys":
          return `Kunci tidak dikenali: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Kunci tidak sah dalam ${issue.origin}`;
        case "invalid_union":
          return "Input tidak sah";
        case "invalid_element":
          return `Nilai tidak sah dalam ${issue.origin}`;
        default:
          return `Input tidak sah`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/nl.cjs
var require_nl = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "tekens" },
      file: { unit: "bytes" },
      array: { unit: "elementen" },
      set: { unit: "elementen" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "getal";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "array";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "invoer",
      email: "emailadres",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO datum en tijd",
      date: "ISO datum",
      time: "ISO tijd",
      duration: "ISO duur",
      ipv4: "IPv4-adres",
      ipv6: "IPv6-adres",
      cidrv4: "IPv4-bereik",
      cidrv6: "IPv6-bereik",
      base64: "base64-gecodeerde tekst",
      base64url: "base64 URL-gecodeerde tekst",
      json_string: "JSON string",
      e164: "E.164-nummer",
      jwt: "JWT",
      template_literal: "invoer"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Ongeldige invoer: verwacht ${issue.expected}, ontving ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Ongeldige invoer: verwacht ${util.stringifyPrimitive(issue.values[0])}`;
          return `Ongeldige optie: verwacht één van ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Te lang: verwacht dat ${issue.origin ?? "waarde"} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elementen"} bevat`;
          return `Te lang: verwacht dat ${issue.origin ?? "waarde"} ${adj}${issue.maximum.toString()} is`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Te kort: verwacht dat ${issue.origin} ${adj}${issue.minimum.toString()} ${sizing.unit} bevat`;
          }
          return `Te kort: verwacht dat ${issue.origin} ${adj}${issue.minimum.toString()} is`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with") {
            return `Ongeldige tekst: moet met "${_issue.prefix}" beginnen`;
          }
          if (_issue.format === "ends_with")
            return `Ongeldige tekst: moet op "${_issue.suffix}" eindigen`;
          if (_issue.format === "includes")
            return `Ongeldige tekst: moet "${_issue.includes}" bevatten`;
          if (_issue.format === "regex")
            return `Ongeldige tekst: moet overeenkomen met patroon ${_issue.pattern}`;
          return `Ongeldig: ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Ongeldig getal: moet een veelvoud van ${issue.divisor} zijn`;
        case "unrecognized_keys":
          return `Onbekende key${issue.keys.length > 1 ? "s" : ""}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Ongeldige key in ${issue.origin}`;
        case "invalid_union":
          return "Ongeldige invoer";
        case "invalid_element":
          return `Ongeldige waarde in ${issue.origin}`;
        default:
          return `Ongeldige invoer`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/no.cjs
var require_no = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "tegn", verb: "å ha" },
      file: { unit: "bytes", verb: "å ha" },
      array: { unit: "elementer", verb: "å inneholde" },
      set: { unit: "elementer", verb: "å inneholde" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "tall";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "liste";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "input",
      email: "e-postadresse",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO dato- og klokkeslett",
      date: "ISO-dato",
      time: "ISO-klokkeslett",
      duration: "ISO-varighet",
      ipv4: "IPv4-område",
      ipv6: "IPv6-område",
      cidrv4: "IPv4-spekter",
      cidrv6: "IPv6-spekter",
      base64: "base64-enkodet streng",
      base64url: "base64url-enkodet streng",
      json_string: "JSON-streng",
      e164: "E.164-nummer",
      jwt: "JWT",
      template_literal: "input"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Ugyldig input: forventet ${issue.expected}, fikk ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Ugyldig verdi: forventet ${util.stringifyPrimitive(issue.values[0])}`;
          return `Ugyldig valg: forventet en av ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `For stor(t): forventet ${issue.origin ?? "value"} til å ha ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elementer"}`;
          return `For stor(t): forventet ${issue.origin ?? "value"} til å ha ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `For lite(n): forventet ${issue.origin} til å ha ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `For lite(n): forventet ${issue.origin} til å ha ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `Ugyldig streng: må starte med "${_issue.prefix}"`;
          if (_issue.format === "ends_with")
            return `Ugyldig streng: må ende med "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Ugyldig streng: må inneholde "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Ugyldig streng: må matche mønsteret ${_issue.pattern}`;
          return `Ugyldig ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Ugyldig tall: må være et multiplum av ${issue.divisor}`;
        case "unrecognized_keys":
          return `${issue.keys.length > 1 ? "Ukjente nøkler" : "Ukjent nøkkel"}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Ugyldig nøkkel i ${issue.origin}`;
        case "invalid_union":
          return "Ugyldig input";
        case "invalid_element":
          return `Ugyldig verdi i ${issue.origin}`;
        default:
          return `Ugyldig input`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/ota.cjs
var require_ota = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "harf", verb: "olmalıdır" },
      file: { unit: "bayt", verb: "olmalıdır" },
      array: { unit: "unsur", verb: "olmalıdır" },
      set: { unit: "unsur", verb: "olmalıdır" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "numara";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "saf";
          }
          if (data === null) {
            return "gayb";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "giren",
      email: "epostagâh",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO hengâmı",
      date: "ISO tarihi",
      time: "ISO zamanı",
      duration: "ISO müddeti",
      ipv4: "IPv4 nişânı",
      ipv6: "IPv6 nişânı",
      cidrv4: "IPv4 menzili",
      cidrv6: "IPv6 menzili",
      base64: "base64-şifreli metin",
      base64url: "base64url-şifreli metin",
      json_string: "JSON metin",
      e164: "E.164 sayısı",
      jwt: "JWT",
      template_literal: "giren"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Fâsit giren: umulan ${issue.expected}, alınan ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Fâsit giren: umulan ${util.stringifyPrimitive(issue.values[0])}`;
          return `Fâsit tercih: mûteberler ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Fazla büyük: ${issue.origin ?? "value"}, ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elements"} sahip olmalıydı.`;
          return `Fazla büyük: ${issue.origin ?? "value"}, ${adj}${issue.maximum.toString()} olmalıydı.`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Fazla küçük: ${issue.origin}, ${adj}${issue.minimum.toString()} ${sizing.unit} sahip olmalıydı.`;
          }
          return `Fazla küçük: ${issue.origin}, ${adj}${issue.minimum.toString()} olmalıydı.`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `Fâsit metin: "${_issue.prefix}" ile başlamalı.`;
          if (_issue.format === "ends_with")
            return `Fâsit metin: "${_issue.suffix}" ile bitmeli.`;
          if (_issue.format === "includes")
            return `Fâsit metin: "${_issue.includes}" ihtivâ etmeli.`;
          if (_issue.format === "regex")
            return `Fâsit metin: ${_issue.pattern} nakşına uymalı.`;
          return `Fâsit ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Fâsit sayı: ${issue.divisor} katı olmalıydı.`;
        case "unrecognized_keys":
          return `Tanınmayan anahtar ${issue.keys.length > 1 ? "s" : ""}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `${issue.origin} için tanınmayan anahtar var.`;
        case "invalid_union":
          return "Giren tanınamadı.";
        case "invalid_element":
          return `${issue.origin} için tanınmayan kıymet var.`;
        default:
          return `Kıymet tanınamadı.`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/ps.cjs
var require_ps = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "توکي", verb: "ولري" },
      file: { unit: "بایټس", verb: "ولري" },
      array: { unit: "توکي", verb: "ولري" },
      set: { unit: "توکي", verb: "ولري" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "عدد";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "ارې";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "ورودي",
      email: "بریښنالیک",
      url: "یو آر ال",
      emoji: "ایموجي",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "نیټه او وخت",
      date: "نېټه",
      time: "وخت",
      duration: "موده",
      ipv4: "د IPv4 پته",
      ipv6: "د IPv6 پته",
      cidrv4: "د IPv4 ساحه",
      cidrv6: "د IPv6 ساحه",
      base64: "base64-encoded متن",
      base64url: "base64url-encoded متن",
      json_string: "JSON متن",
      e164: "د E.164 شمېره",
      jwt: "JWT",
      template_literal: "ورودي"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `ناسم ورودي: باید ${issue.expected} وای, مګر ${parsedType(issue.input)} ترلاسه شو`;
        case "invalid_value":
          if (issue.values.length === 1) {
            return `ناسم ورودي: باید ${util.stringifyPrimitive(issue.values[0])} وای`;
          }
          return `ناسم انتخاب: باید یو له ${util.joinValues(issue.values, "|")} څخه وای`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `ډیر لوی: ${issue.origin ?? "ارزښت"} باید ${adj}${issue.maximum.toString()} ${sizing.unit ?? "عنصرونه"} ولري`;
          }
          return `ډیر لوی: ${issue.origin ?? "ارزښت"} باید ${adj}${issue.maximum.toString()} وي`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `ډیر کوچنی: ${issue.origin} باید ${adj}${issue.minimum.toString()} ${sizing.unit} ولري`;
          }
          return `ډیر کوچنی: ${issue.origin} باید ${adj}${issue.minimum.toString()} وي`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with") {
            return `ناسم متن: باید د "${_issue.prefix}" سره پیل شي`;
          }
          if (_issue.format === "ends_with") {
            return `ناسم متن: باید د "${_issue.suffix}" سره پای ته ورسيږي`;
          }
          if (_issue.format === "includes") {
            return `ناسم متن: باید "${_issue.includes}" ولري`;
          }
          if (_issue.format === "regex") {
            return `ناسم متن: باید د ${_issue.pattern} سره مطابقت ولري`;
          }
          return `${Nouns[_issue.format] ?? issue.format} ناسم دی`;
        }
        case "not_multiple_of":
          return `ناسم عدد: باید د ${issue.divisor} مضرب وي`;
        case "unrecognized_keys":
          return `ناسم ${issue.keys.length > 1 ? "کلیډونه" : "کلیډ"}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `ناسم کلیډ په ${issue.origin} کې`;
        case "invalid_union":
          return `ناسمه ورودي`;
        case "invalid_element":
          return `ناسم عنصر په ${issue.origin} کې`;
        default:
          return `ناسمه ورودي`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/pl.cjs
var require_pl = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "znaków", verb: "mieć" },
      file: { unit: "bajtów", verb: "mieć" },
      array: { unit: "elementów", verb: "mieć" },
      set: { unit: "elementów", verb: "mieć" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "liczba";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "tablica";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "wyrażenie",
      email: "adres email",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "data i godzina w formacie ISO",
      date: "data w formacie ISO",
      time: "godzina w formacie ISO",
      duration: "czas trwania ISO",
      ipv4: "adres IPv4",
      ipv6: "adres IPv6",
      cidrv4: "zakres IPv4",
      cidrv6: "zakres IPv6",
      base64: "ciąg znaków zakodowany w formacie base64",
      base64url: "ciąg znaków zakodowany w formacie base64url",
      json_string: "ciąg znaków w formacie JSON",
      e164: "liczba E.164",
      jwt: "JWT",
      template_literal: "wejście"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Nieprawidłowe dane wejściowe: oczekiwano ${issue.expected}, otrzymano ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Nieprawidłowe dane wejściowe: oczekiwano ${util.stringifyPrimitive(issue.values[0])}`;
          return `Nieprawidłowa opcja: oczekiwano jednej z wartości ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Za duża wartość: oczekiwano, że ${issue.origin ?? "wartość"} będzie mieć ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elementów"}`;
          }
          return `Zbyt duż(y/a/e): oczekiwano, że ${issue.origin ?? "wartość"} będzie wynosić ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Za mała wartość: oczekiwano, że ${issue.origin ?? "wartość"} będzie mieć ${adj}${issue.minimum.toString()} ${sizing.unit ?? "elementów"}`;
          }
          return `Zbyt mał(y/a/e): oczekiwano, że ${issue.origin ?? "wartość"} będzie wynosić ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `Nieprawidłowy ciąg znaków: musi zaczynać się od "${_issue.prefix}"`;
          if (_issue.format === "ends_with")
            return `Nieprawidłowy ciąg znaków: musi kończyć się na "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Nieprawidłowy ciąg znaków: musi zawierać "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Nieprawidłowy ciąg znaków: musi odpowiadać wzorcowi ${_issue.pattern}`;
          return `Nieprawidłow(y/a/e) ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Nieprawidłowa liczba: musi być wielokrotnością ${issue.divisor}`;
        case "unrecognized_keys":
          return `Nierozpoznane klucze${issue.keys.length > 1 ? "s" : ""}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Nieprawidłowy klucz w ${issue.origin}`;
        case "invalid_union":
          return "Nieprawidłowe dane wejściowe";
        case "invalid_element":
          return `Nieprawidłowa wartość w ${issue.origin}`;
        default:
          return `Nieprawidłowe dane wejściowe`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/pt.cjs
var require_pt = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "caracteres", verb: "ter" },
      file: { unit: "bytes", verb: "ter" },
      array: { unit: "itens", verb: "ter" },
      set: { unit: "itens", verb: "ter" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "número";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "array";
          }
          if (data === null) {
            return "nulo";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "padrão",
      email: "endereço de e-mail",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "data e hora ISO",
      date: "data ISO",
      time: "hora ISO",
      duration: "duração ISO",
      ipv4: "endereço IPv4",
      ipv6: "endereço IPv6",
      cidrv4: "faixa de IPv4",
      cidrv6: "faixa de IPv6",
      base64: "texto codificado em base64",
      base64url: "URL codificada em base64",
      json_string: "texto JSON",
      e164: "número E.164",
      jwt: "JWT",
      template_literal: "entrada"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Tipo inválido: esperado ${issue.expected}, recebido ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Entrada inválida: esperado ${util.stringifyPrimitive(issue.values[0])}`;
          return `Opção inválida: esperada uma das ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Muito grande: esperado que ${issue.origin ?? "valor"} tivesse ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elementos"}`;
          return `Muito grande: esperado que ${issue.origin ?? "valor"} fosse ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Muito pequeno: esperado que ${issue.origin} tivesse ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `Muito pequeno: esperado que ${issue.origin} fosse ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `Texto inválido: deve começar com "${_issue.prefix}"`;
          if (_issue.format === "ends_with")
            return `Texto inválido: deve terminar com "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Texto inválido: deve incluir "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Texto inválido: deve corresponder ao padrão ${_issue.pattern}`;
          return `${Nouns[_issue.format] ?? issue.format} inválido`;
        }
        case "not_multiple_of":
          return `Número inválido: deve ser múltiplo de ${issue.divisor}`;
        case "unrecognized_keys":
          return `Chave${issue.keys.length > 1 ? "s" : ""} desconhecida${issue.keys.length > 1 ? "s" : ""}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Chave inválida em ${issue.origin}`;
        case "invalid_union":
          return "Entrada inválida";
        case "invalid_element":
          return `Valor inválido em ${issue.origin}`;
        default:
          return `Campo inválido`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/ru.cjs
var require_ru = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  function getRussianPlural(count, one, few, many) {
    const absCount = Math.abs(count);
    const lastDigit = absCount % 10;
    const lastTwoDigits = absCount % 100;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
      return many;
    }
    if (lastDigit === 1) {
      return one;
    }
    if (lastDigit >= 2 && lastDigit <= 4) {
      return few;
    }
    return many;
  }
  var error = () => {
    const Sizable = {
      string: {
        unit: {
          one: "символ",
          few: "символа",
          many: "символов"
        },
        verb: "иметь"
      },
      file: {
        unit: {
          one: "байт",
          few: "байта",
          many: "байт"
        },
        verb: "иметь"
      },
      array: {
        unit: {
          one: "элемент",
          few: "элемента",
          many: "элементов"
        },
        verb: "иметь"
      },
      set: {
        unit: {
          one: "элемент",
          few: "элемента",
          many: "элементов"
        },
        verb: "иметь"
      }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "число";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "массив";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "ввод",
      email: "email адрес",
      url: "URL",
      emoji: "эмодзи",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO дата и время",
      date: "ISO дата",
      time: "ISO время",
      duration: "ISO длительность",
      ipv4: "IPv4 адрес",
      ipv6: "IPv6 адрес",
      cidrv4: "IPv4 диапазон",
      cidrv6: "IPv6 диапазон",
      base64: "строка в формате base64",
      base64url: "строка в формате base64url",
      json_string: "JSON строка",
      e164: "номер E.164",
      jwt: "JWT",
      template_literal: "ввод"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Неверный ввод: ожидалось ${issue.expected}, получено ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Неверный ввод: ожидалось ${util.stringifyPrimitive(issue.values[0])}`;
          return `Неверный вариант: ожидалось одно из ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            const maxValue = Number(issue.maximum);
            const unit = getRussianPlural(maxValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
            return `Слишком большое значение: ожидалось, что ${issue.origin ?? "значение"} будет иметь ${adj}${issue.maximum.toString()} ${unit}`;
          }
          return `Слишком большое значение: ожидалось, что ${issue.origin ?? "значение"} будет ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            const minValue = Number(issue.minimum);
            const unit = getRussianPlural(minValue, sizing.unit.one, sizing.unit.few, sizing.unit.many);
            return `Слишком маленькое значение: ожидалось, что ${issue.origin} будет иметь ${adj}${issue.minimum.toString()} ${unit}`;
          }
          return `Слишком маленькое значение: ожидалось, что ${issue.origin} будет ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `Неверная строка: должна начинаться с "${_issue.prefix}"`;
          if (_issue.format === "ends_with")
            return `Неверная строка: должна заканчиваться на "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Неверная строка: должна содержать "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Неверная строка: должна соответствовать шаблону ${_issue.pattern}`;
          return `Неверный ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Неверное число: должно быть кратным ${issue.divisor}`;
        case "unrecognized_keys":
          return `Нераспознанн${issue.keys.length > 1 ? "ые" : "ый"} ключ${issue.keys.length > 1 ? "и" : ""}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Неверный ключ в ${issue.origin}`;
        case "invalid_union":
          return "Неверные входные данные";
        case "invalid_element":
          return `Неверное значение в ${issue.origin}`;
        default:
          return `Неверные входные данные`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/sl.cjs
var require_sl = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "znakov", verb: "imeti" },
      file: { unit: "bajtov", verb: "imeti" },
      array: { unit: "elementov", verb: "imeti" },
      set: { unit: "elementov", verb: "imeti" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "število";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "tabela";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "vnos",
      email: "e-poštni naslov",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO datum in čas",
      date: "ISO datum",
      time: "ISO čas",
      duration: "ISO trajanje",
      ipv4: "IPv4 naslov",
      ipv6: "IPv6 naslov",
      cidrv4: "obseg IPv4",
      cidrv6: "obseg IPv6",
      base64: "base64 kodiran niz",
      base64url: "base64url kodiran niz",
      json_string: "JSON niz",
      e164: "E.164 številka",
      jwt: "JWT",
      template_literal: "vnos"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Neveljaven vnos: pričakovano ${issue.expected}, prejeto ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Neveljaven vnos: pričakovano ${util.stringifyPrimitive(issue.values[0])}`;
          return `Neveljavna možnost: pričakovano eno izmed ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Preveliko: pričakovano, da bo ${issue.origin ?? "vrednost"} imelo ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elementov"}`;
          return `Preveliko: pričakovano, da bo ${issue.origin ?? "vrednost"} ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Premajhno: pričakovano, da bo ${issue.origin} imelo ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `Premajhno: pričakovano, da bo ${issue.origin} ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with") {
            return `Neveljaven niz: mora se začeti z "${_issue.prefix}"`;
          }
          if (_issue.format === "ends_with")
            return `Neveljaven niz: mora se končati z "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Neveljaven niz: mora vsebovati "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Neveljaven niz: mora ustrezati vzorcu ${_issue.pattern}`;
          return `Neveljaven ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Neveljavno število: mora biti večkratnik ${issue.divisor}`;
        case "unrecognized_keys":
          return `Neprepoznan${issue.keys.length > 1 ? "i ključi" : " ključ"}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Neveljaven ključ v ${issue.origin}`;
        case "invalid_union":
          return "Neveljaven vnos";
        case "invalid_element":
          return `Neveljavna vrednost v ${issue.origin}`;
        default:
          return "Neveljaven vnos";
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/sv.cjs
var require_sv = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "tecken", verb: "att ha" },
      file: { unit: "bytes", verb: "att ha" },
      array: { unit: "objekt", verb: "att innehålla" },
      set: { unit: "objekt", verb: "att innehålla" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "antal";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "lista";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "reguljärt uttryck",
      email: "e-postadress",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO-datum och tid",
      date: "ISO-datum",
      time: "ISO-tid",
      duration: "ISO-varaktighet",
      ipv4: "IPv4-intervall",
      ipv6: "IPv6-intervall",
      cidrv4: "IPv4-spektrum",
      cidrv6: "IPv6-spektrum",
      base64: "base64-kodad sträng",
      base64url: "base64url-kodad sträng",
      json_string: "JSON-sträng",
      e164: "E.164-nummer",
      jwt: "JWT",
      template_literal: "mall-literal"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Ogiltig inmatning: förväntat ${issue.expected}, fick ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Ogiltig inmatning: förväntat ${util.stringifyPrimitive(issue.values[0])}`;
          return `Ogiltigt val: förväntade en av ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `För stor(t): förväntade ${issue.origin ?? "värdet"} att ha ${adj}${issue.maximum.toString()} ${sizing.unit ?? "element"}`;
          }
          return `För stor(t): förväntat ${issue.origin ?? "värdet"} att ha ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `För lite(t): förväntade ${issue.origin ?? "värdet"} att ha ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `För lite(t): förväntade ${issue.origin ?? "värdet"} att ha ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with") {
            return `Ogiltig sträng: måste börja med "${_issue.prefix}"`;
          }
          if (_issue.format === "ends_with")
            return `Ogiltig sträng: måste sluta med "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Ogiltig sträng: måste innehålla "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Ogiltig sträng: måste matcha mönstret "${_issue.pattern}"`;
          return `Ogiltig(t) ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Ogiltigt tal: måste vara en multipel av ${issue.divisor}`;
        case "unrecognized_keys":
          return `${issue.keys.length > 1 ? "Okända nycklar" : "Okänd nyckel"}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Ogiltig nyckel i ${issue.origin ?? "värdet"}`;
        case "invalid_union":
          return "Ogiltig input";
        case "invalid_element":
          return `Ogiltigt värde i ${issue.origin ?? "värdet"}`;
        default:
          return `Ogiltig input`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/ta.cjs
var require_ta = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "எழுத்துக்கள்", verb: "கொண்டிருக்க வேண்டும்" },
      file: { unit: "பைட்டுகள்", verb: "கொண்டிருக்க வேண்டும்" },
      array: { unit: "உறுப்புகள்", verb: "கொண்டிருக்க வேண்டும்" },
      set: { unit: "உறுப்புகள்", verb: "கொண்டிருக்க வேண்டும்" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "எண் அல்லாதது" : "எண்";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "அணி";
          }
          if (data === null) {
            return "வெறுமை";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "உள்ளீடு",
      email: "மின்னஞ்சல் முகவரி",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO தேதி நேரம்",
      date: "ISO தேதி",
      time: "ISO நேரம்",
      duration: "ISO கால அளவு",
      ipv4: "IPv4 முகவரி",
      ipv6: "IPv6 முகவரி",
      cidrv4: "IPv4 வரம்பு",
      cidrv6: "IPv6 வரம்பு",
      base64: "base64-encoded சரம்",
      base64url: "base64url-encoded சரம்",
      json_string: "JSON சரம்",
      e164: "E.164 எண்",
      jwt: "JWT",
      template_literal: "input"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `தவறான உள்ளீடு: எதிர்பார்க்கப்பட்டது ${issue.expected}, பெறப்பட்டது ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `தவறான உள்ளீடு: எதிர்பார்க்கப்பட்டது ${util.stringifyPrimitive(issue.values[0])}`;
          return `தவறான விருப்பம்: எதிர்பார்க்கப்பட்டது ${util.joinValues(issue.values, "|")} இல் ஒன்று`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `மிக பெரியது: எதிர்பார்க்கப்பட்டது ${issue.origin ?? "மதிப்பு"} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "உறுப்புகள்"} ஆக இருக்க வேண்டும்`;
          }
          return `மிக பெரியது: எதிர்பார்க்கப்பட்டது ${issue.origin ?? "மதிப்பு"} ${adj}${issue.maximum.toString()} ஆக இருக்க வேண்டும்`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `மிகச் சிறியது: எதிர்பார்க்கப்பட்டது ${issue.origin} ${adj}${issue.minimum.toString()} ${sizing.unit} ஆக இருக்க வேண்டும்`;
          }
          return `மிகச் சிறியது: எதிர்பார்க்கப்பட்டது ${issue.origin} ${adj}${issue.minimum.toString()} ஆக இருக்க வேண்டும்`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `தவறான சரம்: "${_issue.prefix}" இல் தொடங்க வேண்டும்`;
          if (_issue.format === "ends_with")
            return `தவறான சரம்: "${_issue.suffix}" இல் முடிவடைய வேண்டும்`;
          if (_issue.format === "includes")
            return `தவறான சரம்: "${_issue.includes}" ஐ உள்ளடக்க வேண்டும்`;
          if (_issue.format === "regex")
            return `தவறான சரம்: ${_issue.pattern} முறைபாட்டுடன் பொருந்த வேண்டும்`;
          return `தவறான ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `தவறான எண்: ${issue.divisor} இன் பலமாக இருக்க வேண்டும்`;
        case "unrecognized_keys":
          return `அடையாளம் தெரியாத விசை${issue.keys.length > 1 ? "கள்" : ""}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `${issue.origin} இல் தவறான விசை`;
        case "invalid_union":
          return "தவறான உள்ளீடு";
        case "invalid_element":
          return `${issue.origin} இல் தவறான மதிப்பு`;
        default:
          return `தவறான உள்ளீடு`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/th.cjs
var require_th = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "ตัวอักษร", verb: "ควรมี" },
      file: { unit: "ไบต์", verb: "ควรมี" },
      array: { unit: "รายการ", verb: "ควรมี" },
      set: { unit: "รายการ", verb: "ควรมี" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "ไม่ใช่ตัวเลข (NaN)" : "ตัวเลข";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "อาร์เรย์ (Array)";
          }
          if (data === null) {
            return "ไม่มีค่า (null)";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "ข้อมูลที่ป้อน",
      email: "ที่อยู่อีเมล",
      url: "URL",
      emoji: "อิโมจิ",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "วันที่เวลาแบบ ISO",
      date: "วันที่แบบ ISO",
      time: "เวลาแบบ ISO",
      duration: "ช่วงเวลาแบบ ISO",
      ipv4: "ที่อยู่ IPv4",
      ipv6: "ที่อยู่ IPv6",
      cidrv4: "ช่วง IP แบบ IPv4",
      cidrv6: "ช่วง IP แบบ IPv6",
      base64: "ข้อความแบบ Base64",
      base64url: "ข้อความแบบ Base64 สำหรับ URL",
      json_string: "ข้อความแบบ JSON",
      e164: "เบอร์โทรศัพท์ระหว่างประเทศ (E.164)",
      jwt: "โทเคน JWT",
      template_literal: "ข้อมูลที่ป้อน"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `ประเภทข้อมูลไม่ถูกต้อง: ควรเป็น ${issue.expected} แต่ได้รับ ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `ค่าไม่ถูกต้อง: ควรเป็น ${util.stringifyPrimitive(issue.values[0])}`;
          return `ตัวเลือกไม่ถูกต้อง: ควรเป็นหนึ่งใน ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "ไม่เกิน" : "น้อยกว่า";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `เกินกำหนด: ${issue.origin ?? "ค่า"} ควรมี${adj} ${issue.maximum.toString()} ${sizing.unit ?? "รายการ"}`;
          return `เกินกำหนด: ${issue.origin ?? "ค่า"} ควรมี${adj} ${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? "อย่างน้อย" : "มากกว่า";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `น้อยกว่ากำหนด: ${issue.origin} ควรมี${adj} ${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `น้อยกว่ากำหนด: ${issue.origin} ควรมี${adj} ${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with") {
            return `รูปแบบไม่ถูกต้อง: ข้อความต้องขึ้นต้นด้วย "${_issue.prefix}"`;
          }
          if (_issue.format === "ends_with")
            return `รูปแบบไม่ถูกต้อง: ข้อความต้องลงท้ายด้วย "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `รูปแบบไม่ถูกต้อง: ข้อความต้องมี "${_issue.includes}" อยู่ในข้อความ`;
          if (_issue.format === "regex")
            return `รูปแบบไม่ถูกต้อง: ต้องตรงกับรูปแบบที่กำหนด ${_issue.pattern}`;
          return `รูปแบบไม่ถูกต้อง: ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `ตัวเลขไม่ถูกต้อง: ต้องเป็นจำนวนที่หารด้วย ${issue.divisor} ได้ลงตัว`;
        case "unrecognized_keys":
          return `พบคีย์ที่ไม่รู้จัก: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `คีย์ไม่ถูกต้องใน ${issue.origin}`;
        case "invalid_union":
          return "ข้อมูลไม่ถูกต้อง: ไม่ตรงกับรูปแบบยูเนียนที่กำหนดไว้";
        case "invalid_element":
          return `ข้อมูลไม่ถูกต้องใน ${issue.origin}`;
        default:
          return `ข้อมูลไม่ถูกต้อง`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/tr.cjs
var require_tr = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.parsedType = undefined;
  exports.default = default_1;
  var util = __importStar(require_util());
  var parsedType = (data) => {
    const t = typeof data;
    switch (t) {
      case "number": {
        return Number.isNaN(data) ? "NaN" : "number";
      }
      case "object": {
        if (Array.isArray(data)) {
          return "array";
        }
        if (data === null) {
          return "null";
        }
        if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
          return data.constructor.name;
        }
      }
    }
    return t;
  };
  exports.parsedType = parsedType;
  var error = () => {
    const Sizable = {
      string: { unit: "karakter", verb: "olmalı" },
      file: { unit: "bayt", verb: "olmalı" },
      array: { unit: "öğe", verb: "olmalı" },
      set: { unit: "öğe", verb: "olmalı" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const Nouns = {
      regex: "girdi",
      email: "e-posta adresi",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO tarih ve saat",
      date: "ISO tarih",
      time: "ISO saat",
      duration: "ISO süre",
      ipv4: "IPv4 adresi",
      ipv6: "IPv6 adresi",
      cidrv4: "IPv4 aralığı",
      cidrv6: "IPv6 aralığı",
      base64: "base64 ile şifrelenmiş metin",
      base64url: "base64url ile şifrelenmiş metin",
      json_string: "JSON dizesi",
      e164: "E.164 sayısı",
      jwt: "JWT",
      template_literal: "Şablon dizesi"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Geçersiz değer: beklenen ${issue.expected}, alınan ${(0, exports.parsedType)(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Geçersiz değer: beklenen ${util.stringifyPrimitive(issue.values[0])}`;
          return `Geçersiz seçenek: aşağıdakilerden biri olmalı: ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Çok büyük: beklenen ${issue.origin ?? "değer"} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "öğe"}`;
          return `Çok büyük: beklenen ${issue.origin ?? "değer"} ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Çok küçük: beklenen ${issue.origin} ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          return `Çok küçük: beklenen ${issue.origin} ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `Geçersiz metin: "${_issue.prefix}" ile başlamalı`;
          if (_issue.format === "ends_with")
            return `Geçersiz metin: "${_issue.suffix}" ile bitmeli`;
          if (_issue.format === "includes")
            return `Geçersiz metin: "${_issue.includes}" içermeli`;
          if (_issue.format === "regex")
            return `Geçersiz metin: ${_issue.pattern} desenine uymalı`;
          return `Geçersiz ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Geçersiz sayı: ${issue.divisor} ile tam bölünebilmeli`;
        case "unrecognized_keys":
          return `Tanınmayan anahtar${issue.keys.length > 1 ? "lar" : ""}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `${issue.origin} içinde geçersiz anahtar`;
        case "invalid_union":
          return "Geçersiz değer";
        case "invalid_element":
          return `${issue.origin} içinde geçersiz değer`;
        default:
          return `Geçersiz değer`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/ua.cjs
var require_ua = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "символів", verb: "матиме" },
      file: { unit: "байтів", verb: "матиме" },
      array: { unit: "елементів", verb: "матиме" },
      set: { unit: "елементів", verb: "матиме" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "число";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "масив";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "вхідні дані",
      email: "адреса електронної пошти",
      url: "URL",
      emoji: "емодзі",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "дата та час ISO",
      date: "дата ISO",
      time: "час ISO",
      duration: "тривалість ISO",
      ipv4: "адреса IPv4",
      ipv6: "адреса IPv6",
      cidrv4: "діапазон IPv4",
      cidrv6: "діапазон IPv6",
      base64: "рядок у кодуванні base64",
      base64url: "рядок у кодуванні base64url",
      json_string: "рядок JSON",
      e164: "номер E.164",
      jwt: "JWT",
      template_literal: "вхідні дані"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Неправильні вхідні дані: очікується ${issue.expected}, отримано ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Неправильні вхідні дані: очікується ${util.stringifyPrimitive(issue.values[0])}`;
          return `Неправильна опція: очікується одне з ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Занадто велике: очікується, що ${issue.origin ?? "значення"} ${sizing.verb} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "елементів"}`;
          return `Занадто велике: очікується, що ${issue.origin ?? "значення"} буде ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Занадто мале: очікується, що ${issue.origin} ${sizing.verb} ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `Занадто мале: очікується, що ${issue.origin} буде ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `Неправильний рядок: повинен починатися з "${_issue.prefix}"`;
          if (_issue.format === "ends_with")
            return `Неправильний рядок: повинен закінчуватися на "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Неправильний рядок: повинен містити "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Неправильний рядок: повинен відповідати шаблону ${_issue.pattern}`;
          return `Неправильний ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `Неправильне число: повинно бути кратним ${issue.divisor}`;
        case "unrecognized_keys":
          return `Нерозпізнаний ключ${issue.keys.length > 1 ? "і" : ""}: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Неправильний ключ у ${issue.origin}`;
        case "invalid_union":
          return "Неправильні вхідні дані";
        case "invalid_element":
          return `Неправильне значення у ${issue.origin}`;
        default:
          return `Неправильні вхідні дані`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/ur.cjs
var require_ur = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "حروف", verb: "ہونا" },
      file: { unit: "بائٹس", verb: "ہونا" },
      array: { unit: "آئٹمز", verb: "ہونا" },
      set: { unit: "آئٹمز", verb: "ہونا" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "نمبر";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "آرے";
          }
          if (data === null) {
            return "نل";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "ان پٹ",
      email: "ای میل ایڈریس",
      url: "یو آر ایل",
      emoji: "ایموجی",
      uuid: "یو یو آئی ڈی",
      uuidv4: "یو یو آئی ڈی وی 4",
      uuidv6: "یو یو آئی ڈی وی 6",
      nanoid: "نینو آئی ڈی",
      guid: "جی یو آئی ڈی",
      cuid: "سی یو آئی ڈی",
      cuid2: "سی یو آئی ڈی 2",
      ulid: "یو ایل آئی ڈی",
      xid: "ایکس آئی ڈی",
      ksuid: "کے ایس یو آئی ڈی",
      datetime: "آئی ایس او ڈیٹ ٹائم",
      date: "آئی ایس او تاریخ",
      time: "آئی ایس او وقت",
      duration: "آئی ایس او مدت",
      ipv4: "آئی پی وی 4 ایڈریس",
      ipv6: "آئی پی وی 6 ایڈریس",
      cidrv4: "آئی پی وی 4 رینج",
      cidrv6: "آئی پی وی 6 رینج",
      base64: "بیس 64 ان کوڈڈ سٹرنگ",
      base64url: "بیس 64 یو آر ایل ان کوڈڈ سٹرنگ",
      json_string: "جے ایس او این سٹرنگ",
      e164: "ای 164 نمبر",
      jwt: "جے ڈبلیو ٹی",
      template_literal: "ان پٹ"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `غلط ان پٹ: ${issue.expected} متوقع تھا، ${parsedType(issue.input)} موصول ہوا`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `غلط ان پٹ: ${util.stringifyPrimitive(issue.values[0])} متوقع تھا`;
          return `غلط آپشن: ${util.joinValues(issue.values, "|")} میں سے ایک متوقع تھا`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `بہت بڑا: ${issue.origin ?? "ویلیو"} کے ${adj}${issue.maximum.toString()} ${sizing.unit ?? "عناصر"} ہونے متوقع تھے`;
          return `بہت بڑا: ${issue.origin ?? "ویلیو"} کا ${adj}${issue.maximum.toString()} ہونا متوقع تھا`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `بہت چھوٹا: ${issue.origin} کے ${adj}${issue.minimum.toString()} ${sizing.unit} ہونے متوقع تھے`;
          }
          return `بہت چھوٹا: ${issue.origin} کا ${adj}${issue.minimum.toString()} ہونا متوقع تھا`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with") {
            return `غلط سٹرنگ: "${_issue.prefix}" سے شروع ہونا چاہیے`;
          }
          if (_issue.format === "ends_with")
            return `غلط سٹرنگ: "${_issue.suffix}" پر ختم ہونا چاہیے`;
          if (_issue.format === "includes")
            return `غلط سٹرنگ: "${_issue.includes}" شامل ہونا چاہیے`;
          if (_issue.format === "regex")
            return `غلط سٹرنگ: پیٹرن ${_issue.pattern} سے میچ ہونا چاہیے`;
          return `غلط ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `غلط نمبر: ${issue.divisor} کا مضاعف ہونا چاہیے`;
        case "unrecognized_keys":
          return `غیر تسلیم شدہ کی${issue.keys.length > 1 ? "ز" : ""}: ${util.joinValues(issue.keys, "، ")}`;
        case "invalid_key":
          return `${issue.origin} میں غلط کی`;
        case "invalid_union":
          return "غلط ان پٹ";
        case "invalid_element":
          return `${issue.origin} میں غلط ویلیو`;
        default:
          return `غلط ان پٹ`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/vi.cjs
var require_vi = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "ký tự", verb: "có" },
      file: { unit: "byte", verb: "có" },
      array: { unit: "phần tử", verb: "có" },
      set: { unit: "phần tử", verb: "có" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "số";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "mảng";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "đầu vào",
      email: "địa chỉ email",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ngày giờ ISO",
      date: "ngày ISO",
      time: "giờ ISO",
      duration: "khoảng thời gian ISO",
      ipv4: "địa chỉ IPv4",
      ipv6: "địa chỉ IPv6",
      cidrv4: "dải IPv4",
      cidrv6: "dải IPv6",
      base64: "chuỗi mã hóa base64",
      base64url: "chuỗi mã hóa base64url",
      json_string: "chuỗi JSON",
      e164: "số E.164",
      jwt: "JWT",
      template_literal: "đầu vào"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `Đầu vào không hợp lệ: mong đợi ${issue.expected}, nhận được ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `Đầu vào không hợp lệ: mong đợi ${util.stringifyPrimitive(issue.values[0])}`;
          return `Tùy chọn không hợp lệ: mong đợi một trong các giá trị ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `Quá lớn: mong đợi ${issue.origin ?? "giá trị"} ${sizing.verb} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "phần tử"}`;
          return `Quá lớn: mong đợi ${issue.origin ?? "giá trị"} ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `Quá nhỏ: mong đợi ${issue.origin} ${sizing.verb} ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `Quá nhỏ: mong đợi ${issue.origin} ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `Chuỗi không hợp lệ: phải bắt đầu bằng "${_issue.prefix}"`;
          if (_issue.format === "ends_with")
            return `Chuỗi không hợp lệ: phải kết thúc bằng "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Chuỗi không hợp lệ: phải bao gồm "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Chuỗi không hợp lệ: phải khớp với mẫu ${_issue.pattern}`;
          return `${Nouns[_issue.format] ?? issue.format} không hợp lệ`;
        }
        case "not_multiple_of":
          return `Số không hợp lệ: phải là bội số của ${issue.divisor}`;
        case "unrecognized_keys":
          return `Khóa không được nhận dạng: ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `Khóa không hợp lệ trong ${issue.origin}`;
        case "invalid_union":
          return "Đầu vào không hợp lệ";
        case "invalid_element":
          return `Giá trị không hợp lệ trong ${issue.origin}`;
        default:
          return `Đầu vào không hợp lệ`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/zh-CN.cjs
var require_zh_CN = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "字符", verb: "包含" },
      file: { unit: "字节", verb: "包含" },
      array: { unit: "项", verb: "包含" },
      set: { unit: "项", verb: "包含" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "非数字(NaN)" : "数字";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "数组";
          }
          if (data === null) {
            return "空值(null)";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "输入",
      email: "电子邮件",
      url: "URL",
      emoji: "表情符号",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO日期时间",
      date: "ISO日期",
      time: "ISO时间",
      duration: "ISO时长",
      ipv4: "IPv4地址",
      ipv6: "IPv6地址",
      cidrv4: "IPv4网段",
      cidrv6: "IPv6网段",
      base64: "base64编码字符串",
      base64url: "base64url编码字符串",
      json_string: "JSON字符串",
      e164: "E.164号码",
      jwt: "JWT",
      template_literal: "输入"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `无效输入：期望 ${issue.expected}，实际接收 ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `无效输入：期望 ${util.stringifyPrimitive(issue.values[0])}`;
          return `无效选项：期望以下之一 ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `数值过大：期望 ${issue.origin ?? "值"} ${adj}${issue.maximum.toString()} ${sizing.unit ?? "个元素"}`;
          return `数值过大：期望 ${issue.origin ?? "值"} ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `数值过小：期望 ${issue.origin} ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `数值过小：期望 ${issue.origin} ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with")
            return `无效字符串：必须以 "${_issue.prefix}" 开头`;
          if (_issue.format === "ends_with")
            return `无效字符串：必须以 "${_issue.suffix}" 结尾`;
          if (_issue.format === "includes")
            return `无效字符串：必须包含 "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `无效字符串：必须满足正则表达式 ${_issue.pattern}`;
          return `无效${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `无效数字：必须是 ${issue.divisor} 的倍数`;
        case "unrecognized_keys":
          return `出现未知的键(key): ${util.joinValues(issue.keys, ", ")}`;
        case "invalid_key":
          return `${issue.origin} 中的键(key)无效`;
        case "invalid_union":
          return "无效输入";
        case "invalid_element":
          return `${issue.origin} 中包含无效值(value)`;
        default:
          return `无效输入`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/zh-TW.cjs
var require_zh_TW = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = default_1;
  var util = __importStar(require_util());
  var error = () => {
    const Sizable = {
      string: { unit: "字元", verb: "擁有" },
      file: { unit: "位元組", verb: "擁有" },
      array: { unit: "項目", verb: "擁有" },
      set: { unit: "項目", verb: "擁有" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const parsedType = (data) => {
      const t = typeof data;
      switch (t) {
        case "number": {
          return Number.isNaN(data) ? "NaN" : "number";
        }
        case "object": {
          if (Array.isArray(data)) {
            return "array";
          }
          if (data === null) {
            return "null";
          }
          if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
            return data.constructor.name;
          }
        }
      }
      return t;
    };
    const Nouns = {
      regex: "輸入",
      email: "郵件地址",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO 日期時間",
      date: "ISO 日期",
      time: "ISO 時間",
      duration: "ISO 期間",
      ipv4: "IPv4 位址",
      ipv6: "IPv6 位址",
      cidrv4: "IPv4 範圍",
      cidrv6: "IPv6 範圍",
      base64: "base64 編碼字串",
      base64url: "base64url 編碼字串",
      json_string: "JSON 字串",
      e164: "E.164 數值",
      jwt: "JWT",
      template_literal: "輸入"
    };
    return (issue) => {
      switch (issue.code) {
        case "invalid_type":
          return `無效的輸入值：預期為 ${issue.expected}，但收到 ${parsedType(issue.input)}`;
        case "invalid_value":
          if (issue.values.length === 1)
            return `無效的輸入值：預期為 ${util.stringifyPrimitive(issue.values[0])}`;
          return `無效的選項：預期為以下其中之一 ${util.joinValues(issue.values, "|")}`;
        case "too_big": {
          const adj = issue.inclusive ? "<=" : "<";
          const sizing = getSizing(issue.origin);
          if (sizing)
            return `數值過大：預期 ${issue.origin ?? "值"} 應為 ${adj}${issue.maximum.toString()} ${sizing.unit ?? "個元素"}`;
          return `數值過大：預期 ${issue.origin ?? "值"} 應為 ${adj}${issue.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue.inclusive ? ">=" : ">";
          const sizing = getSizing(issue.origin);
          if (sizing) {
            return `數值過小：預期 ${issue.origin} 應為 ${adj}${issue.minimum.toString()} ${sizing.unit}`;
          }
          return `數值過小：預期 ${issue.origin} 應為 ${adj}${issue.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue;
          if (_issue.format === "starts_with") {
            return `無效的字串：必須以 "${_issue.prefix}" 開頭`;
          }
          if (_issue.format === "ends_with")
            return `無效的字串：必須以 "${_issue.suffix}" 結尾`;
          if (_issue.format === "includes")
            return `無效的字串：必須包含 "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `無效的字串：必須符合格式 ${_issue.pattern}`;
          return `無效的 ${Nouns[_issue.format] ?? issue.format}`;
        }
        case "not_multiple_of":
          return `無效的數字：必須為 ${issue.divisor} 的倍數`;
        case "unrecognized_keys":
          return `無法識別的鍵值${issue.keys.length > 1 ? "們" : ""}：${util.joinValues(issue.keys, "、")}`;
        case "invalid_key":
          return `${issue.origin} 中有無效的鍵值`;
        case "invalid_union":
          return "無效的輸入值";
        case "invalid_element":
          return `${issue.origin} 中有無效的值`;
        default:
          return `無效的輸入值`;
      }
    };
  };
  function default_1() {
    return {
      localeError: error()
    };
  }
});

// node_modules/zod/v4/locales/index.cjs
var require_locales = __commonJS((exports) => {
  var __importDefault = exports && exports.__importDefault || function(mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.zhTW = exports.zhCN = exports.vi = exports.ur = exports.ua = exports.tr = exports.th = exports.ta = exports.sv = exports.sl = exports.ru = exports.pt = exports.pl = exports.ps = exports.ota = exports.no = exports.nl = exports.ms = exports.mk = exports.ko = exports.kh = exports.ja = exports.it = exports.id = exports.hu = exports.he = exports.frCA = exports.fr = exports.fi = exports.fa = exports.es = exports.eo = exports.en = exports.de = exports.cs = exports.ca = exports.be = exports.az = exports.ar = undefined;
  var ar_js_1 = require_ar();
  Object.defineProperty(exports, "ar", { enumerable: true, get: function() {
    return __importDefault(ar_js_1).default;
  } });
  var az_js_1 = require_az();
  Object.defineProperty(exports, "az", { enumerable: true, get: function() {
    return __importDefault(az_js_1).default;
  } });
  var be_js_1 = require_be();
  Object.defineProperty(exports, "be", { enumerable: true, get: function() {
    return __importDefault(be_js_1).default;
  } });
  var ca_js_1 = require_ca();
  Object.defineProperty(exports, "ca", { enumerable: true, get: function() {
    return __importDefault(ca_js_1).default;
  } });
  var cs_js_1 = require_cs();
  Object.defineProperty(exports, "cs", { enumerable: true, get: function() {
    return __importDefault(cs_js_1).default;
  } });
  var de_js_1 = require_de();
  Object.defineProperty(exports, "de", { enumerable: true, get: function() {
    return __importDefault(de_js_1).default;
  } });
  var en_js_1 = require_en();
  Object.defineProperty(exports, "en", { enumerable: true, get: function() {
    return __importDefault(en_js_1).default;
  } });
  var eo_js_1 = require_eo();
  Object.defineProperty(exports, "eo", { enumerable: true, get: function() {
    return __importDefault(eo_js_1).default;
  } });
  var es_js_1 = require_es();
  Object.defineProperty(exports, "es", { enumerable: true, get: function() {
    return __importDefault(es_js_1).default;
  } });
  var fa_js_1 = require_fa();
  Object.defineProperty(exports, "fa", { enumerable: true, get: function() {
    return __importDefault(fa_js_1).default;
  } });
  var fi_js_1 = require_fi();
  Object.defineProperty(exports, "fi", { enumerable: true, get: function() {
    return __importDefault(fi_js_1).default;
  } });
  var fr_js_1 = require_fr();
  Object.defineProperty(exports, "fr", { enumerable: true, get: function() {
    return __importDefault(fr_js_1).default;
  } });
  var fr_CA_js_1 = require_fr_CA();
  Object.defineProperty(exports, "frCA", { enumerable: true, get: function() {
    return __importDefault(fr_CA_js_1).default;
  } });
  var he_js_1 = require_he();
  Object.defineProperty(exports, "he", { enumerable: true, get: function() {
    return __importDefault(he_js_1).default;
  } });
  var hu_js_1 = require_hu();
  Object.defineProperty(exports, "hu", { enumerable: true, get: function() {
    return __importDefault(hu_js_1).default;
  } });
  var id_js_1 = require_id();
  Object.defineProperty(exports, "id", { enumerable: true, get: function() {
    return __importDefault(id_js_1).default;
  } });
  var it_js_1 = require_it();
  Object.defineProperty(exports, "it", { enumerable: true, get: function() {
    return __importDefault(it_js_1).default;
  } });
  var ja_js_1 = require_ja();
  Object.defineProperty(exports, "ja", { enumerable: true, get: function() {
    return __importDefault(ja_js_1).default;
  } });
  var kh_js_1 = require_kh();
  Object.defineProperty(exports, "kh", { enumerable: true, get: function() {
    return __importDefault(kh_js_1).default;
  } });
  var ko_js_1 = require_ko();
  Object.defineProperty(exports, "ko", { enumerable: true, get: function() {
    return __importDefault(ko_js_1).default;
  } });
  var mk_js_1 = require_mk();
  Object.defineProperty(exports, "mk", { enumerable: true, get: function() {
    return __importDefault(mk_js_1).default;
  } });
  var ms_js_1 = require_ms();
  Object.defineProperty(exports, "ms", { enumerable: true, get: function() {
    return __importDefault(ms_js_1).default;
  } });
  var nl_js_1 = require_nl();
  Object.defineProperty(exports, "nl", { enumerable: true, get: function() {
    return __importDefault(nl_js_1).default;
  } });
  var no_js_1 = require_no();
  Object.defineProperty(exports, "no", { enumerable: true, get: function() {
    return __importDefault(no_js_1).default;
  } });
  var ota_js_1 = require_ota();
  Object.defineProperty(exports, "ota", { enumerable: true, get: function() {
    return __importDefault(ota_js_1).default;
  } });
  var ps_js_1 = require_ps();
  Object.defineProperty(exports, "ps", { enumerable: true, get: function() {
    return __importDefault(ps_js_1).default;
  } });
  var pl_js_1 = require_pl();
  Object.defineProperty(exports, "pl", { enumerable: true, get: function() {
    return __importDefault(pl_js_1).default;
  } });
  var pt_js_1 = require_pt();
  Object.defineProperty(exports, "pt", { enumerable: true, get: function() {
    return __importDefault(pt_js_1).default;
  } });
  var ru_js_1 = require_ru();
  Object.defineProperty(exports, "ru", { enumerable: true, get: function() {
    return __importDefault(ru_js_1).default;
  } });
  var sl_js_1 = require_sl();
  Object.defineProperty(exports, "sl", { enumerable: true, get: function() {
    return __importDefault(sl_js_1).default;
  } });
  var sv_js_1 = require_sv();
  Object.defineProperty(exports, "sv", { enumerable: true, get: function() {
    return __importDefault(sv_js_1).default;
  } });
  var ta_js_1 = require_ta();
  Object.defineProperty(exports, "ta", { enumerable: true, get: function() {
    return __importDefault(ta_js_1).default;
  } });
  var th_js_1 = require_th();
  Object.defineProperty(exports, "th", { enumerable: true, get: function() {
    return __importDefault(th_js_1).default;
  } });
  var tr_js_1 = require_tr();
  Object.defineProperty(exports, "tr", { enumerable: true, get: function() {
    return __importDefault(tr_js_1).default;
  } });
  var ua_js_1 = require_ua();
  Object.defineProperty(exports, "ua", { enumerable: true, get: function() {
    return __importDefault(ua_js_1).default;
  } });
  var ur_js_1 = require_ur();
  Object.defineProperty(exports, "ur", { enumerable: true, get: function() {
    return __importDefault(ur_js_1).default;
  } });
  var vi_js_1 = require_vi();
  Object.defineProperty(exports, "vi", { enumerable: true, get: function() {
    return __importDefault(vi_js_1).default;
  } });
  var zh_CN_js_1 = require_zh_CN();
  Object.defineProperty(exports, "zhCN", { enumerable: true, get: function() {
    return __importDefault(zh_CN_js_1).default;
  } });
  var zh_TW_js_1 = require_zh_TW();
  Object.defineProperty(exports, "zhTW", { enumerable: true, get: function() {
    return __importDefault(zh_TW_js_1).default;
  } });
});

// node_modules/zod/v4/core/registries.cjs
var require_registries = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.globalRegistry = exports.$ZodRegistry = exports.$input = exports.$output = undefined;
  exports.registry = registry;
  exports.$output = Symbol("ZodOutput");
  exports.$input = Symbol("ZodInput");

  class $ZodRegistry {
    constructor() {
      this._map = new Map;
      this._idmap = new Map;
    }
    add(schema, ..._meta) {
      const meta = _meta[0];
      this._map.set(schema, meta);
      if (meta && typeof meta === "object" && "id" in meta) {
        if (this._idmap.has(meta.id)) {
          throw new Error(`ID ${meta.id} already exists in the registry`);
        }
        this._idmap.set(meta.id, schema);
      }
      return this;
    }
    clear() {
      this._map = new Map;
      this._idmap = new Map;
      return this;
    }
    remove(schema) {
      const meta = this._map.get(schema);
      if (meta && typeof meta === "object" && "id" in meta) {
        this._idmap.delete(meta.id);
      }
      this._map.delete(schema);
      return this;
    }
    get(schema) {
      const p = schema._zod.parent;
      if (p) {
        const pm = { ...this.get(p) ?? {} };
        delete pm.id;
        return { ...pm, ...this._map.get(schema) };
      }
      return this._map.get(schema);
    }
    has(schema) {
      return this._map.has(schema);
    }
  }
  exports.$ZodRegistry = $ZodRegistry;
  function registry() {
    return new $ZodRegistry;
  }
  exports.globalRegistry = registry();
});

// node_modules/zod/v4/core/api.cjs
var require_api = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.TimePrecision = undefined;
  exports._string = _string;
  exports._coercedString = _coercedString;
  exports._email = _email;
  exports._guid = _guid;
  exports._uuid = _uuid;
  exports._uuidv4 = _uuidv4;
  exports._uuidv6 = _uuidv6;
  exports._uuidv7 = _uuidv7;
  exports._url = _url;
  exports._emoji = _emoji;
  exports._nanoid = _nanoid;
  exports._cuid = _cuid;
  exports._cuid2 = _cuid2;
  exports._ulid = _ulid;
  exports._xid = _xid;
  exports._ksuid = _ksuid;
  exports._ipv4 = _ipv4;
  exports._ipv6 = _ipv6;
  exports._cidrv4 = _cidrv4;
  exports._cidrv6 = _cidrv6;
  exports._base64 = _base64;
  exports._base64url = _base64url;
  exports._e164 = _e164;
  exports._jwt = _jwt;
  exports._isoDateTime = _isoDateTime;
  exports._isoDate = _isoDate;
  exports._isoTime = _isoTime;
  exports._isoDuration = _isoDuration;
  exports._number = _number;
  exports._coercedNumber = _coercedNumber;
  exports._int = _int;
  exports._float32 = _float32;
  exports._float64 = _float64;
  exports._int32 = _int32;
  exports._uint32 = _uint32;
  exports._boolean = _boolean;
  exports._coercedBoolean = _coercedBoolean;
  exports._bigint = _bigint;
  exports._coercedBigint = _coercedBigint;
  exports._int64 = _int64;
  exports._uint64 = _uint64;
  exports._symbol = _symbol;
  exports._undefined = _undefined;
  exports._null = _null;
  exports._any = _any;
  exports._unknown = _unknown;
  exports._never = _never;
  exports._void = _void;
  exports._date = _date;
  exports._coercedDate = _coercedDate;
  exports._nan = _nan;
  exports._lt = _lt;
  exports._lte = _lte;
  exports._max = _lte;
  exports._lte = _lte;
  exports._max = _lte;
  exports._gt = _gt;
  exports._gte = _gte;
  exports._min = _gte;
  exports._gte = _gte;
  exports._min = _gte;
  exports._positive = _positive;
  exports._negative = _negative;
  exports._nonpositive = _nonpositive;
  exports._nonnegative = _nonnegative;
  exports._multipleOf = _multipleOf;
  exports._maxSize = _maxSize;
  exports._minSize = _minSize;
  exports._size = _size;
  exports._maxLength = _maxLength;
  exports._minLength = _minLength;
  exports._length = _length;
  exports._regex = _regex;
  exports._lowercase = _lowercase;
  exports._uppercase = _uppercase;
  exports._includes = _includes;
  exports._startsWith = _startsWith;
  exports._endsWith = _endsWith;
  exports._property = _property;
  exports._mime = _mime;
  exports._overwrite = _overwrite;
  exports._normalize = _normalize;
  exports._trim = _trim;
  exports._toLowerCase = _toLowerCase;
  exports._toUpperCase = _toUpperCase;
  exports._array = _array;
  exports._union = _union;
  exports._discriminatedUnion = _discriminatedUnion;
  exports._intersection = _intersection;
  exports._tuple = _tuple;
  exports._record = _record;
  exports._map = _map;
  exports._set = _set;
  exports._enum = _enum;
  exports._nativeEnum = _nativeEnum;
  exports._literal = _literal;
  exports._file = _file;
  exports._transform = _transform;
  exports._optional = _optional;
  exports._nullable = _nullable;
  exports._default = _default;
  exports._nonoptional = _nonoptional;
  exports._success = _success;
  exports._catch = _catch;
  exports._pipe = _pipe;
  exports._readonly = _readonly;
  exports._templateLiteral = _templateLiteral;
  exports._lazy = _lazy;
  exports._promise = _promise;
  exports._custom = _custom;
  exports._refine = _refine;
  exports._stringbool = _stringbool;
  exports._stringFormat = _stringFormat;
  var checks = __importStar(require_checks());
  var schemas = __importStar(require_schemas());
  var util = __importStar(require_util());
  function _string(Class, params) {
    return new Class({
      type: "string",
      ...util.normalizeParams(params)
    });
  }
  function _coercedString(Class, params) {
    return new Class({
      type: "string",
      coerce: true,
      ...util.normalizeParams(params)
    });
  }
  function _email(Class, params) {
    return new Class({
      type: "string",
      format: "email",
      check: "string_format",
      abort: false,
      ...util.normalizeParams(params)
    });
  }
  function _guid(Class, params) {
    return new Class({
      type: "string",
      format: "guid",
      check: "string_format",
      abort: false,
      ...util.normalizeParams(params)
    });
  }
  function _uuid(Class, params) {
    return new Class({
      type: "string",
      format: "uuid",
      check: "string_format",
      abort: false,
      ...util.normalizeParams(params)
    });
  }
  function _uuidv4(Class, params) {
    return new Class({
      type: "string",
      format: "uuid",
      check: "string_format",
      abort: false,
      version: "v4",
      ...util.normalizeParams(params)
    });
  }
  function _uuidv6(Class, params) {
    return new Class({
      type: "string",
      format: "uuid",
      check: "string_format",
      abort: false,
      version: "v6",
      ...util.normalizeParams(params)
    });
  }
  function _uuidv7(Class, params) {
    return new Class({
      type: "string",
      format: "uuid",
      check: "string_format",
      abort: false,
      version: "v7",
      ...util.normalizeParams(params)
    });
  }
  function _url(Class, params) {
    return new Class({
      type: "string",
      format: "url",
      check: "string_format",
      abort: false,
      ...util.normalizeParams(params)
    });
  }
  function _emoji(Class, params) {
    return new Class({
      type: "string",
      format: "emoji",
      check: "string_format",
      abort: false,
      ...util.normalizeParams(params)
    });
  }
  function _nanoid(Class, params) {
    return new Class({
      type: "string",
      format: "nanoid",
      check: "string_format",
      abort: false,
      ...util.normalizeParams(params)
    });
  }
  function _cuid(Class, params) {
    return new Class({
      type: "string",
      format: "cuid",
      check: "string_format",
      abort: false,
      ...util.normalizeParams(params)
    });
  }
  function _cuid2(Class, params) {
    return new Class({
      type: "string",
      format: "cuid2",
      check: "string_format",
      abort: false,
      ...util.normalizeParams(params)
    });
  }
  function _ulid(Class, params) {
    return new Class({
      type: "string",
      format: "ulid",
      check: "string_format",
      abort: false,
      ...util.normalizeParams(params)
    });
  }
  function _xid(Class, params) {
    return new Class({
      type: "string",
      format: "xid",
      check: "string_format",
      abort: false,
      ...util.normalizeParams(params)
    });
  }
  function _ksuid(Class, params) {
    return new Class({
      type: "string",
      format: "ksuid",
      check: "string_format",
      abort: false,
      ...util.normalizeParams(params)
    });
  }
  function _ipv4(Class, params) {
    return new Class({
      type: "string",
      format: "ipv4",
      check: "string_format",
      abort: false,
      ...util.normalizeParams(params)
    });
  }
  function _ipv6(Class, params) {
    return new Class({
      type: "string",
      format: "ipv6",
      check: "string_format",
      abort: false,
      ...util.normalizeParams(params)
    });
  }
  function _cidrv4(Class, params) {
    return new Class({
      type: "string",
      format: "cidrv4",
      check: "string_format",
      abort: false,
      ...util.normalizeParams(params)
    });
  }
  function _cidrv6(Class, params) {
    return new Class({
      type: "string",
      format: "cidrv6",
      check: "string_format",
      abort: false,
      ...util.normalizeParams(params)
    });
  }
  function _base64(Class, params) {
    return new Class({
      type: "string",
      format: "base64",
      check: "string_format",
      abort: false,
      ...util.normalizeParams(params)
    });
  }
  function _base64url(Class, params) {
    return new Class({
      type: "string",
      format: "base64url",
      check: "string_format",
      abort: false,
      ...util.normalizeParams(params)
    });
  }
  function _e164(Class, params) {
    return new Class({
      type: "string",
      format: "e164",
      check: "string_format",
      abort: false,
      ...util.normalizeParams(params)
    });
  }
  function _jwt(Class, params) {
    return new Class({
      type: "string",
      format: "jwt",
      check: "string_format",
      abort: false,
      ...util.normalizeParams(params)
    });
  }
  exports.TimePrecision = {
    Any: null,
    Minute: -1,
    Second: 0,
    Millisecond: 3,
    Microsecond: 6
  };
  function _isoDateTime(Class, params) {
    return new Class({
      type: "string",
      format: "datetime",
      check: "string_format",
      offset: false,
      local: false,
      precision: null,
      ...util.normalizeParams(params)
    });
  }
  function _isoDate(Class, params) {
    return new Class({
      type: "string",
      format: "date",
      check: "string_format",
      ...util.normalizeParams(params)
    });
  }
  function _isoTime(Class, params) {
    return new Class({
      type: "string",
      format: "time",
      check: "string_format",
      precision: null,
      ...util.normalizeParams(params)
    });
  }
  function _isoDuration(Class, params) {
    return new Class({
      type: "string",
      format: "duration",
      check: "string_format",
      ...util.normalizeParams(params)
    });
  }
  function _number(Class, params) {
    return new Class({
      type: "number",
      checks: [],
      ...util.normalizeParams(params)
    });
  }
  function _coercedNumber(Class, params) {
    return new Class({
      type: "number",
      coerce: true,
      checks: [],
      ...util.normalizeParams(params)
    });
  }
  function _int(Class, params) {
    return new Class({
      type: "number",
      check: "number_format",
      abort: false,
      format: "safeint",
      ...util.normalizeParams(params)
    });
  }
  function _float32(Class, params) {
    return new Class({
      type: "number",
      check: "number_format",
      abort: false,
      format: "float32",
      ...util.normalizeParams(params)
    });
  }
  function _float64(Class, params) {
    return new Class({
      type: "number",
      check: "number_format",
      abort: false,
      format: "float64",
      ...util.normalizeParams(params)
    });
  }
  function _int32(Class, params) {
    return new Class({
      type: "number",
      check: "number_format",
      abort: false,
      format: "int32",
      ...util.normalizeParams(params)
    });
  }
  function _uint32(Class, params) {
    return new Class({
      type: "number",
      check: "number_format",
      abort: false,
      format: "uint32",
      ...util.normalizeParams(params)
    });
  }
  function _boolean(Class, params) {
    return new Class({
      type: "boolean",
      ...util.normalizeParams(params)
    });
  }
  function _coercedBoolean(Class, params) {
    return new Class({
      type: "boolean",
      coerce: true,
      ...util.normalizeParams(params)
    });
  }
  function _bigint(Class, params) {
    return new Class({
      type: "bigint",
      ...util.normalizeParams(params)
    });
  }
  function _coercedBigint(Class, params) {
    return new Class({
      type: "bigint",
      coerce: true,
      ...util.normalizeParams(params)
    });
  }
  function _int64(Class, params) {
    return new Class({
      type: "bigint",
      check: "bigint_format",
      abort: false,
      format: "int64",
      ...util.normalizeParams(params)
    });
  }
  function _uint64(Class, params) {
    return new Class({
      type: "bigint",
      check: "bigint_format",
      abort: false,
      format: "uint64",
      ...util.normalizeParams(params)
    });
  }
  function _symbol(Class, params) {
    return new Class({
      type: "symbol",
      ...util.normalizeParams(params)
    });
  }
  function _undefined(Class, params) {
    return new Class({
      type: "undefined",
      ...util.normalizeParams(params)
    });
  }
  function _null(Class, params) {
    return new Class({
      type: "null",
      ...util.normalizeParams(params)
    });
  }
  function _any(Class) {
    return new Class({
      type: "any"
    });
  }
  function _unknown(Class) {
    return new Class({
      type: "unknown"
    });
  }
  function _never(Class, params) {
    return new Class({
      type: "never",
      ...util.normalizeParams(params)
    });
  }
  function _void(Class, params) {
    return new Class({
      type: "void",
      ...util.normalizeParams(params)
    });
  }
  function _date(Class, params) {
    return new Class({
      type: "date",
      ...util.normalizeParams(params)
    });
  }
  function _coercedDate(Class, params) {
    return new Class({
      type: "date",
      coerce: true,
      ...util.normalizeParams(params)
    });
  }
  function _nan(Class, params) {
    return new Class({
      type: "nan",
      ...util.normalizeParams(params)
    });
  }
  function _lt(value, params) {
    return new checks.$ZodCheckLessThan({
      check: "less_than",
      ...util.normalizeParams(params),
      value,
      inclusive: false
    });
  }
  function _lte(value, params) {
    return new checks.$ZodCheckLessThan({
      check: "less_than",
      ...util.normalizeParams(params),
      value,
      inclusive: true
    });
  }
  function _gt(value, params) {
    return new checks.$ZodCheckGreaterThan({
      check: "greater_than",
      ...util.normalizeParams(params),
      value,
      inclusive: false
    });
  }
  function _gte(value, params) {
    return new checks.$ZodCheckGreaterThan({
      check: "greater_than",
      ...util.normalizeParams(params),
      value,
      inclusive: true
    });
  }
  function _positive(params) {
    return _gt(0, params);
  }
  function _negative(params) {
    return _lt(0, params);
  }
  function _nonpositive(params) {
    return _lte(0, params);
  }
  function _nonnegative(params) {
    return _gte(0, params);
  }
  function _multipleOf(value, params) {
    return new checks.$ZodCheckMultipleOf({
      check: "multiple_of",
      ...util.normalizeParams(params),
      value
    });
  }
  function _maxSize(maximum, params) {
    return new checks.$ZodCheckMaxSize({
      check: "max_size",
      ...util.normalizeParams(params),
      maximum
    });
  }
  function _minSize(minimum, params) {
    return new checks.$ZodCheckMinSize({
      check: "min_size",
      ...util.normalizeParams(params),
      minimum
    });
  }
  function _size(size, params) {
    return new checks.$ZodCheckSizeEquals({
      check: "size_equals",
      ...util.normalizeParams(params),
      size
    });
  }
  function _maxLength(maximum, params) {
    const ch = new checks.$ZodCheckMaxLength({
      check: "max_length",
      ...util.normalizeParams(params),
      maximum
    });
    return ch;
  }
  function _minLength(minimum, params) {
    return new checks.$ZodCheckMinLength({
      check: "min_length",
      ...util.normalizeParams(params),
      minimum
    });
  }
  function _length(length, params) {
    return new checks.$ZodCheckLengthEquals({
      check: "length_equals",
      ...util.normalizeParams(params),
      length
    });
  }
  function _regex(pattern, params) {
    return new checks.$ZodCheckRegex({
      check: "string_format",
      format: "regex",
      ...util.normalizeParams(params),
      pattern
    });
  }
  function _lowercase(params) {
    return new checks.$ZodCheckLowerCase({
      check: "string_format",
      format: "lowercase",
      ...util.normalizeParams(params)
    });
  }
  function _uppercase(params) {
    return new checks.$ZodCheckUpperCase({
      check: "string_format",
      format: "uppercase",
      ...util.normalizeParams(params)
    });
  }
  function _includes(includes, params) {
    return new checks.$ZodCheckIncludes({
      check: "string_format",
      format: "includes",
      ...util.normalizeParams(params),
      includes
    });
  }
  function _startsWith(prefix, params) {
    return new checks.$ZodCheckStartsWith({
      check: "string_format",
      format: "starts_with",
      ...util.normalizeParams(params),
      prefix
    });
  }
  function _endsWith(suffix, params) {
    return new checks.$ZodCheckEndsWith({
      check: "string_format",
      format: "ends_with",
      ...util.normalizeParams(params),
      suffix
    });
  }
  function _property(property, schema, params) {
    return new checks.$ZodCheckProperty({
      check: "property",
      property,
      schema,
      ...util.normalizeParams(params)
    });
  }
  function _mime(types, params) {
    return new checks.$ZodCheckMimeType({
      check: "mime_type",
      mime: types,
      ...util.normalizeParams(params)
    });
  }
  function _overwrite(tx) {
    return new checks.$ZodCheckOverwrite({
      check: "overwrite",
      tx
    });
  }
  function _normalize(form) {
    return _overwrite((input) => input.normalize(form));
  }
  function _trim() {
    return _overwrite((input) => input.trim());
  }
  function _toLowerCase() {
    return _overwrite((input) => input.toLowerCase());
  }
  function _toUpperCase() {
    return _overwrite((input) => input.toUpperCase());
  }
  function _array(Class, element, params) {
    return new Class({
      type: "array",
      element,
      ...util.normalizeParams(params)
    });
  }
  function _union(Class, options, params) {
    return new Class({
      type: "union",
      options,
      ...util.normalizeParams(params)
    });
  }
  function _discriminatedUnion(Class, discriminator, options, params) {
    return new Class({
      type: "union",
      options,
      discriminator,
      ...util.normalizeParams(params)
    });
  }
  function _intersection(Class, left, right) {
    return new Class({
      type: "intersection",
      left,
      right
    });
  }
  function _tuple(Class, items, _paramsOrRest, _params) {
    const hasRest = _paramsOrRest instanceof schemas.$ZodType;
    const params = hasRest ? _params : _paramsOrRest;
    const rest = hasRest ? _paramsOrRest : null;
    return new Class({
      type: "tuple",
      items,
      rest,
      ...util.normalizeParams(params)
    });
  }
  function _record(Class, keyType, valueType, params) {
    return new Class({
      type: "record",
      keyType,
      valueType,
      ...util.normalizeParams(params)
    });
  }
  function _map(Class, keyType, valueType, params) {
    return new Class({
      type: "map",
      keyType,
      valueType,
      ...util.normalizeParams(params)
    });
  }
  function _set(Class, valueType, params) {
    return new Class({
      type: "set",
      valueType,
      ...util.normalizeParams(params)
    });
  }
  function _enum(Class, values, params) {
    const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
    return new Class({
      type: "enum",
      entries,
      ...util.normalizeParams(params)
    });
  }
  function _nativeEnum(Class, entries, params) {
    return new Class({
      type: "enum",
      entries,
      ...util.normalizeParams(params)
    });
  }
  function _literal(Class, value, params) {
    return new Class({
      type: "literal",
      values: Array.isArray(value) ? value : [value],
      ...util.normalizeParams(params)
    });
  }
  function _file(Class, params) {
    return new Class({
      type: "file",
      ...util.normalizeParams(params)
    });
  }
  function _transform(Class, fn) {
    return new Class({
      type: "transform",
      transform: fn
    });
  }
  function _optional(Class, innerType) {
    return new Class({
      type: "optional",
      innerType
    });
  }
  function _nullable(Class, innerType) {
    return new Class({
      type: "nullable",
      innerType
    });
  }
  function _default(Class, innerType, defaultValue) {
    return new Class({
      type: "default",
      innerType,
      get defaultValue() {
        return typeof defaultValue === "function" ? defaultValue() : defaultValue;
      }
    });
  }
  function _nonoptional(Class, innerType, params) {
    return new Class({
      type: "nonoptional",
      innerType,
      ...util.normalizeParams(params)
    });
  }
  function _success(Class, innerType) {
    return new Class({
      type: "success",
      innerType
    });
  }
  function _catch(Class, innerType, catchValue) {
    return new Class({
      type: "catch",
      innerType,
      catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
    });
  }
  function _pipe(Class, in_, out) {
    return new Class({
      type: "pipe",
      in: in_,
      out
    });
  }
  function _readonly(Class, innerType) {
    return new Class({
      type: "readonly",
      innerType
    });
  }
  function _templateLiteral(Class, parts, params) {
    return new Class({
      type: "template_literal",
      parts,
      ...util.normalizeParams(params)
    });
  }
  function _lazy(Class, getter) {
    return new Class({
      type: "lazy",
      getter
    });
  }
  function _promise(Class, innerType) {
    return new Class({
      type: "promise",
      innerType
    });
  }
  function _custom(Class, fn, _params) {
    const norm = util.normalizeParams(_params);
    norm.abort ?? (norm.abort = true);
    const schema = new Class({
      type: "custom",
      check: "custom",
      fn,
      ...norm
    });
    return schema;
  }
  function _refine(Class, fn, _params) {
    const schema = new Class({
      type: "custom",
      check: "custom",
      fn,
      ...util.normalizeParams(_params)
    });
    return schema;
  }
  function _stringbool(Classes, _params) {
    const params = util.normalizeParams(_params);
    let truthyArray = params.truthy ?? ["true", "1", "yes", "on", "y", "enabled"];
    let falsyArray = params.falsy ?? ["false", "0", "no", "off", "n", "disabled"];
    if (params.case !== "sensitive") {
      truthyArray = truthyArray.map((v) => typeof v === "string" ? v.toLowerCase() : v);
      falsyArray = falsyArray.map((v) => typeof v === "string" ? v.toLowerCase() : v);
    }
    const truthySet = new Set(truthyArray);
    const falsySet = new Set(falsyArray);
    const _Pipe = Classes.Pipe ?? schemas.$ZodPipe;
    const _Boolean = Classes.Boolean ?? schemas.$ZodBoolean;
    const _String = Classes.String ?? schemas.$ZodString;
    const _Transform = Classes.Transform ?? schemas.$ZodTransform;
    const tx = new _Transform({
      type: "transform",
      transform: (input, payload) => {
        let data = input;
        if (params.case !== "sensitive")
          data = data.toLowerCase();
        if (truthySet.has(data)) {
          return true;
        } else if (falsySet.has(data)) {
          return false;
        } else {
          payload.issues.push({
            code: "invalid_value",
            expected: "stringbool",
            values: [...truthySet, ...falsySet],
            input: payload.value,
            inst: tx
          });
          return {};
        }
      },
      error: params.error
    });
    const innerPipe = new _Pipe({
      type: "pipe",
      in: new _String({ type: "string", error: params.error }),
      out: tx,
      error: params.error
    });
    const outerPipe = new _Pipe({
      type: "pipe",
      in: innerPipe,
      out: new _Boolean({
        type: "boolean",
        error: params.error
      }),
      error: params.error
    });
    return outerPipe;
  }
  function _stringFormat(Class, format, fnOrRegex, _params = {}) {
    const params = util.normalizeParams(_params);
    const def = {
      ...util.normalizeParams(_params),
      check: "string_format",
      type: "string",
      format,
      fn: typeof fnOrRegex === "function" ? fnOrRegex : (val) => fnOrRegex.test(val),
      ...params
    };
    if (fnOrRegex instanceof RegExp) {
      def.pattern = fnOrRegex;
    }
    const inst = new Class(def);
    return inst;
  }
});

// node_modules/zod/v4/core/function.cjs
var require_function = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.$ZodFunction = undefined;
  exports.function = _function;
  var api_js_1 = require_api();
  var parse_js_1 = require_parse();
  var schemas = __importStar(require_schemas());
  var schemas_js_1 = require_schemas();

  class $ZodFunction {
    constructor(def) {
      this._def = def;
      this.def = def;
    }
    implement(func) {
      if (typeof func !== "function") {
        throw new Error("implement() must be called with a function");
      }
      const impl = (...args) => {
        const parsedArgs = this._def.input ? (0, parse_js_1.parse)(this._def.input, args, undefined, { callee: impl }) : args;
        if (!Array.isArray(parsedArgs)) {
          throw new Error("Invalid arguments schema: not an array or tuple schema.");
        }
        const output = func(...parsedArgs);
        return this._def.output ? (0, parse_js_1.parse)(this._def.output, output, undefined, { callee: impl }) : output;
      };
      return impl;
    }
    implementAsync(func) {
      if (typeof func !== "function") {
        throw new Error("implement() must be called with a function");
      }
      const impl = async (...args) => {
        const parsedArgs = this._def.input ? await (0, parse_js_1.parseAsync)(this._def.input, args, undefined, { callee: impl }) : args;
        if (!Array.isArray(parsedArgs)) {
          throw new Error("Invalid arguments schema: not an array or tuple schema.");
        }
        const output = await func(...parsedArgs);
        return this._def.output ? (0, parse_js_1.parseAsync)(this._def.output, output, undefined, { callee: impl }) : output;
      };
      return impl;
    }
    input(...args) {
      const F = this.constructor;
      if (Array.isArray(args[0])) {
        return new F({
          type: "function",
          input: new schemas_js_1.$ZodTuple({
            type: "tuple",
            items: args[0],
            rest: args[1]
          }),
          output: this._def.output
        });
      }
      return new F({
        type: "function",
        input: args[0],
        output: this._def.output
      });
    }
    output(output) {
      const F = this.constructor;
      return new F({
        type: "function",
        input: this._def.input,
        output
      });
    }
  }
  exports.$ZodFunction = $ZodFunction;
  function _function(params) {
    return new $ZodFunction({
      type: "function",
      input: Array.isArray(params?.input) ? (0, api_js_1._tuple)(schemas.$ZodTuple, params?.input) : params?.input ?? (0, api_js_1._array)(schemas.$ZodArray, (0, api_js_1._unknown)(schemas.$ZodUnknown)),
      output: params?.output ?? (0, api_js_1._unknown)(schemas.$ZodUnknown)
    });
  }
});

// node_modules/zod/v4/core/to-json-schema.cjs
var require_to_json_schema = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.JSONSchemaGenerator = undefined;
  exports.toJSONSchema = toJSONSchema;
  var registries_js_1 = require_registries();
  var util_js_1 = require_util();

  class JSONSchemaGenerator {
    constructor(params) {
      this.counter = 0;
      this.metadataRegistry = params?.metadata ?? registries_js_1.globalRegistry;
      this.target = params?.target ?? "draft-2020-12";
      this.unrepresentable = params?.unrepresentable ?? "throw";
      this.override = params?.override ?? (() => {});
      this.io = params?.io ?? "output";
      this.seen = new Map;
    }
    process(schema, _params = { path: [], schemaPath: [] }) {
      var _a;
      const def = schema._zod.def;
      const formatMap = {
        guid: "uuid",
        url: "uri",
        datetime: "date-time",
        json_string: "json-string",
        regex: ""
      };
      const seen = this.seen.get(schema);
      if (seen) {
        seen.count++;
        const isCycle = _params.schemaPath.includes(schema);
        if (isCycle) {
          seen.cycle = _params.path;
        }
        return seen.schema;
      }
      const result = { schema: {}, count: 1, cycle: undefined, path: _params.path };
      this.seen.set(schema, result);
      const overrideSchema = schema._zod.toJSONSchema?.();
      if (overrideSchema) {
        result.schema = overrideSchema;
      } else {
        const params = {
          ..._params,
          schemaPath: [..._params.schemaPath, schema],
          path: _params.path
        };
        const parent = schema._zod.parent;
        if (parent) {
          result.ref = parent;
          this.process(parent, params);
          this.seen.get(parent).isParent = true;
        } else {
          const _json = result.schema;
          switch (def.type) {
            case "string": {
              const json = _json;
              json.type = "string";
              const { minimum, maximum, format, patterns, contentEncoding } = schema._zod.bag;
              if (typeof minimum === "number")
                json.minLength = minimum;
              if (typeof maximum === "number")
                json.maxLength = maximum;
              if (format) {
                json.format = formatMap[format] ?? format;
                if (json.format === "")
                  delete json.format;
              }
              if (contentEncoding)
                json.contentEncoding = contentEncoding;
              if (patterns && patterns.size > 0) {
                const regexes = [...patterns];
                if (regexes.length === 1)
                  json.pattern = regexes[0].source;
                else if (regexes.length > 1) {
                  result.schema.allOf = [
                    ...regexes.map((regex) => ({
                      ...this.target === "draft-7" ? { type: "string" } : {},
                      pattern: regex.source
                    }))
                  ];
                }
              }
              break;
            }
            case "number": {
              const json = _json;
              const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
              if (typeof format === "string" && format.includes("int"))
                json.type = "integer";
              else
                json.type = "number";
              if (typeof exclusiveMinimum === "number")
                json.exclusiveMinimum = exclusiveMinimum;
              if (typeof minimum === "number") {
                json.minimum = minimum;
                if (typeof exclusiveMinimum === "number") {
                  if (exclusiveMinimum >= minimum)
                    delete json.minimum;
                  else
                    delete json.exclusiveMinimum;
                }
              }
              if (typeof exclusiveMaximum === "number")
                json.exclusiveMaximum = exclusiveMaximum;
              if (typeof maximum === "number") {
                json.maximum = maximum;
                if (typeof exclusiveMaximum === "number") {
                  if (exclusiveMaximum <= maximum)
                    delete json.maximum;
                  else
                    delete json.exclusiveMaximum;
                }
              }
              if (typeof multipleOf === "number")
                json.multipleOf = multipleOf;
              break;
            }
            case "boolean": {
              const json = _json;
              json.type = "boolean";
              break;
            }
            case "bigint": {
              if (this.unrepresentable === "throw") {
                throw new Error("BigInt cannot be represented in JSON Schema");
              }
              break;
            }
            case "symbol": {
              if (this.unrepresentable === "throw") {
                throw new Error("Symbols cannot be represented in JSON Schema");
              }
              break;
            }
            case "null": {
              _json.type = "null";
              break;
            }
            case "any": {
              break;
            }
            case "unknown": {
              break;
            }
            case "undefined": {
              if (this.unrepresentable === "throw") {
                throw new Error("Undefined cannot be represented in JSON Schema");
              }
              break;
            }
            case "void": {
              if (this.unrepresentable === "throw") {
                throw new Error("Void cannot be represented in JSON Schema");
              }
              break;
            }
            case "never": {
              _json.not = {};
              break;
            }
            case "date": {
              if (this.unrepresentable === "throw") {
                throw new Error("Date cannot be represented in JSON Schema");
              }
              break;
            }
            case "array": {
              const json = _json;
              const { minimum, maximum } = schema._zod.bag;
              if (typeof minimum === "number")
                json.minItems = minimum;
              if (typeof maximum === "number")
                json.maxItems = maximum;
              json.type = "array";
              json.items = this.process(def.element, { ...params, path: [...params.path, "items"] });
              break;
            }
            case "object": {
              const json = _json;
              json.type = "object";
              json.properties = {};
              const shape = def.shape;
              for (const key in shape) {
                json.properties[key] = this.process(shape[key], {
                  ...params,
                  path: [...params.path, "properties", key]
                });
              }
              const allKeys = new Set(Object.keys(shape));
              const requiredKeys = new Set([...allKeys].filter((key) => {
                const v = def.shape[key]._zod;
                if (this.io === "input") {
                  return v.optin === undefined;
                } else {
                  return v.optout === undefined;
                }
              }));
              if (requiredKeys.size > 0) {
                json.required = Array.from(requiredKeys);
              }
              if (def.catchall?._zod.def.type === "never") {
                json.additionalProperties = false;
              } else if (!def.catchall) {
                if (this.io === "output")
                  json.additionalProperties = false;
              } else if (def.catchall) {
                json.additionalProperties = this.process(def.catchall, {
                  ...params,
                  path: [...params.path, "additionalProperties"]
                });
              }
              break;
            }
            case "union": {
              const json = _json;
              json.anyOf = def.options.map((x, i) => this.process(x, {
                ...params,
                path: [...params.path, "anyOf", i]
              }));
              break;
            }
            case "intersection": {
              const json = _json;
              const a = this.process(def.left, {
                ...params,
                path: [...params.path, "allOf", 0]
              });
              const b = this.process(def.right, {
                ...params,
                path: [...params.path, "allOf", 1]
              });
              const isSimpleIntersection = (val) => ("allOf" in val) && Object.keys(val).length === 1;
              const allOf = [
                ...isSimpleIntersection(a) ? a.allOf : [a],
                ...isSimpleIntersection(b) ? b.allOf : [b]
              ];
              json.allOf = allOf;
              break;
            }
            case "tuple": {
              const json = _json;
              json.type = "array";
              const prefixItems = def.items.map((x, i) => this.process(x, { ...params, path: [...params.path, "prefixItems", i] }));
              if (this.target === "draft-2020-12") {
                json.prefixItems = prefixItems;
              } else {
                json.items = prefixItems;
              }
              if (def.rest) {
                const rest = this.process(def.rest, {
                  ...params,
                  path: [...params.path, "items"]
                });
                if (this.target === "draft-2020-12") {
                  json.items = rest;
                } else {
                  json.additionalItems = rest;
                }
              }
              if (def.rest) {
                json.items = this.process(def.rest, {
                  ...params,
                  path: [...params.path, "items"]
                });
              }
              const { minimum, maximum } = schema._zod.bag;
              if (typeof minimum === "number")
                json.minItems = minimum;
              if (typeof maximum === "number")
                json.maxItems = maximum;
              break;
            }
            case "record": {
              const json = _json;
              json.type = "object";
              json.propertyNames = this.process(def.keyType, { ...params, path: [...params.path, "propertyNames"] });
              json.additionalProperties = this.process(def.valueType, {
                ...params,
                path: [...params.path, "additionalProperties"]
              });
              break;
            }
            case "map": {
              if (this.unrepresentable === "throw") {
                throw new Error("Map cannot be represented in JSON Schema");
              }
              break;
            }
            case "set": {
              if (this.unrepresentable === "throw") {
                throw new Error("Set cannot be represented in JSON Schema");
              }
              break;
            }
            case "enum": {
              const json = _json;
              const values = (0, util_js_1.getEnumValues)(def.entries);
              if (values.every((v) => typeof v === "number"))
                json.type = "number";
              if (values.every((v) => typeof v === "string"))
                json.type = "string";
              json.enum = values;
              break;
            }
            case "literal": {
              const json = _json;
              const vals = [];
              for (const val of def.values) {
                if (val === undefined) {
                  if (this.unrepresentable === "throw") {
                    throw new Error("Literal `undefined` cannot be represented in JSON Schema");
                  }
                } else if (typeof val === "bigint") {
                  if (this.unrepresentable === "throw") {
                    throw new Error("BigInt literals cannot be represented in JSON Schema");
                  } else {
                    vals.push(Number(val));
                  }
                } else {
                  vals.push(val);
                }
              }
              if (vals.length === 0) {} else if (vals.length === 1) {
                const val = vals[0];
                json.type = val === null ? "null" : typeof val;
                json.const = val;
              } else {
                if (vals.every((v) => typeof v === "number"))
                  json.type = "number";
                if (vals.every((v) => typeof v === "string"))
                  json.type = "string";
                if (vals.every((v) => typeof v === "boolean"))
                  json.type = "string";
                if (vals.every((v) => v === null))
                  json.type = "null";
                json.enum = vals;
              }
              break;
            }
            case "file": {
              const json = _json;
              const file = {
                type: "string",
                format: "binary",
                contentEncoding: "binary"
              };
              const { minimum, maximum, mime } = schema._zod.bag;
              if (minimum !== undefined)
                file.minLength = minimum;
              if (maximum !== undefined)
                file.maxLength = maximum;
              if (mime) {
                if (mime.length === 1) {
                  file.contentMediaType = mime[0];
                  Object.assign(json, file);
                } else {
                  json.anyOf = mime.map((m) => {
                    const mFile = { ...file, contentMediaType: m };
                    return mFile;
                  });
                }
              } else {
                Object.assign(json, file);
              }
              break;
            }
            case "transform": {
              if (this.unrepresentable === "throw") {
                throw new Error("Transforms cannot be represented in JSON Schema");
              }
              break;
            }
            case "nullable": {
              const inner = this.process(def.innerType, params);
              _json.anyOf = [inner, { type: "null" }];
              break;
            }
            case "nonoptional": {
              this.process(def.innerType, params);
              result.ref = def.innerType;
              break;
            }
            case "success": {
              const json = _json;
              json.type = "boolean";
              break;
            }
            case "default": {
              this.process(def.innerType, params);
              result.ref = def.innerType;
              _json.default = JSON.parse(JSON.stringify(def.defaultValue));
              break;
            }
            case "prefault": {
              this.process(def.innerType, params);
              result.ref = def.innerType;
              if (this.io === "input")
                _json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
              break;
            }
            case "catch": {
              this.process(def.innerType, params);
              result.ref = def.innerType;
              let catchValue;
              try {
                catchValue = def.catchValue(undefined);
              } catch {
                throw new Error("Dynamic catch values are not supported in JSON Schema");
              }
              _json.default = catchValue;
              break;
            }
            case "nan": {
              if (this.unrepresentable === "throw") {
                throw new Error("NaN cannot be represented in JSON Schema");
              }
              break;
            }
            case "template_literal": {
              const json = _json;
              const pattern = schema._zod.pattern;
              if (!pattern)
                throw new Error("Pattern not found in template literal");
              json.type = "string";
              json.pattern = pattern.source;
              break;
            }
            case "pipe": {
              const innerType = this.io === "input" ? def.in._zod.def.type === "transform" ? def.out : def.in : def.out;
              this.process(innerType, params);
              result.ref = innerType;
              break;
            }
            case "readonly": {
              this.process(def.innerType, params);
              result.ref = def.innerType;
              _json.readOnly = true;
              break;
            }
            case "promise": {
              this.process(def.innerType, params);
              result.ref = def.innerType;
              break;
            }
            case "optional": {
              this.process(def.innerType, params);
              result.ref = def.innerType;
              break;
            }
            case "lazy": {
              const innerType = schema._zod.innerType;
              this.process(innerType, params);
              result.ref = innerType;
              break;
            }
            case "custom": {
              if (this.unrepresentable === "throw") {
                throw new Error("Custom types cannot be represented in JSON Schema");
              }
              break;
            }
            default: {}
          }
        }
      }
      const meta = this.metadataRegistry.get(schema);
      if (meta)
        Object.assign(result.schema, meta);
      if (this.io === "input" && isTransforming(schema)) {
        delete result.schema.examples;
        delete result.schema.default;
      }
      if (this.io === "input" && result.schema._prefault)
        (_a = result.schema).default ?? (_a.default = result.schema._prefault);
      delete result.schema._prefault;
      const _result = this.seen.get(schema);
      return _result.schema;
    }
    emit(schema, _params) {
      const params = {
        cycles: _params?.cycles ?? "ref",
        reused: _params?.reused ?? "inline",
        external: _params?.external ?? undefined
      };
      const root = this.seen.get(schema);
      if (!root)
        throw new Error("Unprocessed schema. This is a bug in Zod.");
      const makeURI = (entry) => {
        const defsSegment = this.target === "draft-2020-12" ? "$defs" : "definitions";
        if (params.external) {
          const externalId = params.external.registry.get(entry[0])?.id;
          const uriGenerator = params.external.uri ?? ((id2) => id2);
          if (externalId) {
            return { ref: uriGenerator(externalId) };
          }
          const id = entry[1].defId ?? entry[1].schema.id ?? `schema${this.counter++}`;
          entry[1].defId = id;
          return { defId: id, ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}` };
        }
        if (entry[1] === root) {
          return { ref: "#" };
        }
        const uriPrefix = `#`;
        const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
        const defId = entry[1].schema.id ?? `__schema${this.counter++}`;
        return { defId, ref: defUriPrefix + defId };
      };
      const extractToDef = (entry) => {
        if (entry[1].schema.$ref) {
          return;
        }
        const seen = entry[1];
        const { ref, defId } = makeURI(entry);
        seen.def = { ...seen.schema };
        if (defId)
          seen.defId = defId;
        const schema2 = seen.schema;
        for (const key in schema2) {
          delete schema2[key];
        }
        schema2.$ref = ref;
      };
      if (params.cycles === "throw") {
        for (const entry of this.seen.entries()) {
          const seen = entry[1];
          if (seen.cycle) {
            throw new Error("Cycle detected: " + `#/${seen.cycle?.join("/")}/<root>` + '\n\nSet the `cycles` parameter to `"ref"` to resolve cyclical schemas with defs.');
          }
        }
      }
      for (const entry of this.seen.entries()) {
        const seen = entry[1];
        if (schema === entry[0]) {
          extractToDef(entry);
          continue;
        }
        if (params.external) {
          const ext = params.external.registry.get(entry[0])?.id;
          if (schema !== entry[0] && ext) {
            extractToDef(entry);
            continue;
          }
        }
        const id = this.metadataRegistry.get(entry[0])?.id;
        if (id) {
          extractToDef(entry);
          continue;
        }
        if (seen.cycle) {
          extractToDef(entry);
          continue;
        }
        if (seen.count > 1) {
          if (params.reused === "ref") {
            extractToDef(entry);
            continue;
          }
        }
      }
      const flattenRef = (zodSchema, params2) => {
        const seen = this.seen.get(zodSchema);
        const schema2 = seen.def ?? seen.schema;
        const _cached = { ...schema2 };
        if (seen.ref === null) {
          return;
        }
        const ref = seen.ref;
        seen.ref = null;
        if (ref) {
          flattenRef(ref, params2);
          const refSchema = this.seen.get(ref).schema;
          if (refSchema.$ref && params2.target === "draft-7") {
            schema2.allOf = schema2.allOf ?? [];
            schema2.allOf.push(refSchema);
          } else {
            Object.assign(schema2, refSchema);
            Object.assign(schema2, _cached);
          }
        }
        if (!seen.isParent)
          this.override({
            zodSchema,
            jsonSchema: schema2,
            path: seen.path ?? []
          });
      };
      for (const entry of [...this.seen.entries()].reverse()) {
        flattenRef(entry[0], { target: this.target });
      }
      const result = {};
      if (this.target === "draft-2020-12") {
        result.$schema = "https://json-schema.org/draft/2020-12/schema";
      } else if (this.target === "draft-7") {
        result.$schema = "http://json-schema.org/draft-07/schema#";
      } else {
        console.warn(`Invalid target: ${this.target}`);
      }
      if (params.external?.uri) {
        const id = params.external.registry.get(schema)?.id;
        if (!id)
          throw new Error("Schema is missing an `id` property");
        result.$id = params.external.uri(id);
      }
      Object.assign(result, root.def);
      const defs = params.external?.defs ?? {};
      for (const entry of this.seen.entries()) {
        const seen = entry[1];
        if (seen.def && seen.defId) {
          defs[seen.defId] = seen.def;
        }
      }
      if (params.external) {} else {
        if (Object.keys(defs).length > 0) {
          if (this.target === "draft-2020-12") {
            result.$defs = defs;
          } else {
            result.definitions = defs;
          }
        }
      }
      try {
        return JSON.parse(JSON.stringify(result));
      } catch (_err) {
        throw new Error("Error converting schema to JSON.");
      }
    }
  }
  exports.JSONSchemaGenerator = JSONSchemaGenerator;
  function toJSONSchema(input, _params) {
    if (input instanceof registries_js_1.$ZodRegistry) {
      const gen2 = new JSONSchemaGenerator(_params);
      const defs = {};
      for (const entry of input._idmap.entries()) {
        const [_, schema] = entry;
        gen2.process(schema);
      }
      const schemas = {};
      const external = {
        registry: input,
        uri: _params?.uri,
        defs
      };
      for (const entry of input._idmap.entries()) {
        const [key, schema] = entry;
        schemas[key] = gen2.emit(schema, {
          ..._params,
          external
        });
      }
      if (Object.keys(defs).length > 0) {
        const defsSegment = gen2.target === "draft-2020-12" ? "$defs" : "definitions";
        schemas.__shared = {
          [defsSegment]: defs
        };
      }
      return { schemas };
    }
    const gen = new JSONSchemaGenerator(_params);
    gen.process(input);
    return gen.emit(input, _params);
  }
  function isTransforming(_schema, _ctx) {
    const ctx = _ctx ?? { seen: new Set };
    if (ctx.seen.has(_schema))
      return false;
    ctx.seen.add(_schema);
    const schema = _schema;
    const def = schema._zod.def;
    switch (def.type) {
      case "string":
      case "number":
      case "bigint":
      case "boolean":
      case "date":
      case "symbol":
      case "undefined":
      case "null":
      case "any":
      case "unknown":
      case "never":
      case "void":
      case "literal":
      case "enum":
      case "nan":
      case "file":
      case "template_literal":
        return false;
      case "array": {
        return isTransforming(def.element, ctx);
      }
      case "object": {
        for (const key in def.shape) {
          if (isTransforming(def.shape[key], ctx))
            return true;
        }
        return false;
      }
      case "union": {
        for (const option of def.options) {
          if (isTransforming(option, ctx))
            return true;
        }
        return false;
      }
      case "intersection": {
        return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
      }
      case "tuple": {
        for (const item of def.items) {
          if (isTransforming(item, ctx))
            return true;
        }
        if (def.rest && isTransforming(def.rest, ctx))
          return true;
        return false;
      }
      case "record": {
        return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
      }
      case "map": {
        return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
      }
      case "set": {
        return isTransforming(def.valueType, ctx);
      }
      case "promise":
      case "optional":
      case "nonoptional":
      case "nullable":
      case "readonly":
        return isTransforming(def.innerType, ctx);
      case "lazy":
        return isTransforming(def.getter(), ctx);
      case "default": {
        return isTransforming(def.innerType, ctx);
      }
      case "prefault": {
        return isTransforming(def.innerType, ctx);
      }
      case "custom": {
        return false;
      }
      case "transform": {
        return true;
      }
      case "pipe": {
        return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
      }
      case "success": {
        return false;
      }
      case "catch": {
        return false;
      }
      default:
    }
    throw new Error(`Unknown schema type: ${def.type}`);
  }
});

// node_modules/zod/v4/core/json-schema.cjs
var require_json_schema = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
});

// node_modules/zod/v4/core/index.cjs
var require_core2 = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __exportStar = exports && exports.__exportStar || function(m, exports2) {
    for (var p in m)
      if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p))
        __createBinding(exports2, m, p);
  };
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.JSONSchema = exports.locales = exports.regexes = exports.util = undefined;
  __exportStar(require_core(), exports);
  __exportStar(require_parse(), exports);
  __exportStar(require_errors2(), exports);
  __exportStar(require_schemas(), exports);
  __exportStar(require_checks(), exports);
  __exportStar(require_versions(), exports);
  exports.util = __importStar(require_util());
  exports.regexes = __importStar(require_regexes());
  exports.locales = __importStar(require_locales());
  __exportStar(require_registries(), exports);
  __exportStar(require_doc(), exports);
  __exportStar(require_function(), exports);
  __exportStar(require_api(), exports);
  __exportStar(require_to_json_schema(), exports);
  exports.JSONSchema = __importStar(require_json_schema());
});

// node_modules/zod/v4/classic/checks.cjs
var require_checks2 = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.toUpperCase = exports.toLowerCase = exports.trim = exports.normalize = exports.overwrite = exports.mime = exports.property = exports.endsWith = exports.startsWith = exports.includes = exports.uppercase = exports.lowercase = exports.regex = exports.length = exports.minLength = exports.maxLength = exports.size = exports.minSize = exports.maxSize = exports.multipleOf = exports.nonnegative = exports.nonpositive = exports.negative = exports.positive = exports.gte = exports.gt = exports.lte = exports.lt = undefined;
  var index_js_1 = require_core2();
  Object.defineProperty(exports, "lt", { enumerable: true, get: function() {
    return index_js_1._lt;
  } });
  Object.defineProperty(exports, "lte", { enumerable: true, get: function() {
    return index_js_1._lte;
  } });
  Object.defineProperty(exports, "gt", { enumerable: true, get: function() {
    return index_js_1._gt;
  } });
  Object.defineProperty(exports, "gte", { enumerable: true, get: function() {
    return index_js_1._gte;
  } });
  Object.defineProperty(exports, "positive", { enumerable: true, get: function() {
    return index_js_1._positive;
  } });
  Object.defineProperty(exports, "negative", { enumerable: true, get: function() {
    return index_js_1._negative;
  } });
  Object.defineProperty(exports, "nonpositive", { enumerable: true, get: function() {
    return index_js_1._nonpositive;
  } });
  Object.defineProperty(exports, "nonnegative", { enumerable: true, get: function() {
    return index_js_1._nonnegative;
  } });
  Object.defineProperty(exports, "multipleOf", { enumerable: true, get: function() {
    return index_js_1._multipleOf;
  } });
  Object.defineProperty(exports, "maxSize", { enumerable: true, get: function() {
    return index_js_1._maxSize;
  } });
  Object.defineProperty(exports, "minSize", { enumerable: true, get: function() {
    return index_js_1._minSize;
  } });
  Object.defineProperty(exports, "size", { enumerable: true, get: function() {
    return index_js_1._size;
  } });
  Object.defineProperty(exports, "maxLength", { enumerable: true, get: function() {
    return index_js_1._maxLength;
  } });
  Object.defineProperty(exports, "minLength", { enumerable: true, get: function() {
    return index_js_1._minLength;
  } });
  Object.defineProperty(exports, "length", { enumerable: true, get: function() {
    return index_js_1._length;
  } });
  Object.defineProperty(exports, "regex", { enumerable: true, get: function() {
    return index_js_1._regex;
  } });
  Object.defineProperty(exports, "lowercase", { enumerable: true, get: function() {
    return index_js_1._lowercase;
  } });
  Object.defineProperty(exports, "uppercase", { enumerable: true, get: function() {
    return index_js_1._uppercase;
  } });
  Object.defineProperty(exports, "includes", { enumerable: true, get: function() {
    return index_js_1._includes;
  } });
  Object.defineProperty(exports, "startsWith", { enumerable: true, get: function() {
    return index_js_1._startsWith;
  } });
  Object.defineProperty(exports, "endsWith", { enumerable: true, get: function() {
    return index_js_1._endsWith;
  } });
  Object.defineProperty(exports, "property", { enumerable: true, get: function() {
    return index_js_1._property;
  } });
  Object.defineProperty(exports, "mime", { enumerable: true, get: function() {
    return index_js_1._mime;
  } });
  Object.defineProperty(exports, "overwrite", { enumerable: true, get: function() {
    return index_js_1._overwrite;
  } });
  Object.defineProperty(exports, "normalize", { enumerable: true, get: function() {
    return index_js_1._normalize;
  } });
  Object.defineProperty(exports, "trim", { enumerable: true, get: function() {
    return index_js_1._trim;
  } });
  Object.defineProperty(exports, "toLowerCase", { enumerable: true, get: function() {
    return index_js_1._toLowerCase;
  } });
  Object.defineProperty(exports, "toUpperCase", { enumerable: true, get: function() {
    return index_js_1._toUpperCase;
  } });
});

// node_modules/zod/v4/classic/iso.cjs
var require_iso = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.ZodISODuration = exports.ZodISOTime = exports.ZodISODate = exports.ZodISODateTime = undefined;
  exports.datetime = datetime;
  exports.date = date;
  exports.time = time;
  exports.duration = duration;
  var core = __importStar(require_core2());
  var schemas = __importStar(require_schemas2());
  exports.ZodISODateTime = core.$constructor("ZodISODateTime", (inst, def) => {
    core.$ZodISODateTime.init(inst, def);
    schemas.ZodStringFormat.init(inst, def);
  });
  function datetime(params) {
    return core._isoDateTime(exports.ZodISODateTime, params);
  }
  exports.ZodISODate = core.$constructor("ZodISODate", (inst, def) => {
    core.$ZodISODate.init(inst, def);
    schemas.ZodStringFormat.init(inst, def);
  });
  function date(params) {
    return core._isoDate(exports.ZodISODate, params);
  }
  exports.ZodISOTime = core.$constructor("ZodISOTime", (inst, def) => {
    core.$ZodISOTime.init(inst, def);
    schemas.ZodStringFormat.init(inst, def);
  });
  function time(params) {
    return core._isoTime(exports.ZodISOTime, params);
  }
  exports.ZodISODuration = core.$constructor("ZodISODuration", (inst, def) => {
    core.$ZodISODuration.init(inst, def);
    schemas.ZodStringFormat.init(inst, def);
  });
  function duration(params) {
    return core._isoDuration(exports.ZodISODuration, params);
  }
});

// node_modules/zod/v4/classic/errors.cjs
var require_errors3 = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.ZodRealError = exports.ZodError = undefined;
  var core = __importStar(require_core2());
  var index_js_1 = require_core2();
  var initializer = (inst, issues) => {
    index_js_1.$ZodError.init(inst, issues);
    inst.name = "ZodError";
    Object.defineProperties(inst, {
      format: {
        value: (mapper) => core.formatError(inst, mapper)
      },
      flatten: {
        value: (mapper) => core.flattenError(inst, mapper)
      },
      addIssue: {
        value: (issue) => inst.issues.push(issue)
      },
      addIssues: {
        value: (issues2) => inst.issues.push(...issues2)
      },
      isEmpty: {
        get() {
          return inst.issues.length === 0;
        }
      }
    });
  };
  exports.ZodError = core.$constructor("ZodError", initializer);
  exports.ZodRealError = core.$constructor("ZodError", initializer, {
    Parent: Error
  });
});

// node_modules/zod/v4/classic/parse.cjs
var require_parse2 = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.safeParseAsync = exports.safeParse = exports.parseAsync = exports.parse = undefined;
  var core = __importStar(require_core2());
  var errors_js_1 = require_errors3();
  exports.parse = core._parse(errors_js_1.ZodRealError);
  exports.parseAsync = core._parseAsync(errors_js_1.ZodRealError);
  exports.safeParse = core._safeParse(errors_js_1.ZodRealError);
  exports.safeParseAsync = core._safeParseAsync(errors_js_1.ZodRealError);
});

// node_modules/zod/v4/classic/schemas.cjs
var require_schemas2 = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.ZodTransform = exports.ZodFile = exports.ZodLiteral = exports.ZodEnum = exports.ZodSet = exports.ZodMap = exports.ZodRecord = exports.ZodTuple = exports.ZodIntersection = exports.ZodDiscriminatedUnion = exports.ZodUnion = exports.ZodObject = exports.ZodArray = exports.ZodDate = exports.ZodVoid = exports.ZodNever = exports.ZodUnknown = exports.ZodAny = exports.ZodNull = exports.ZodUndefined = exports.ZodSymbol = exports.ZodBigIntFormat = exports.ZodBigInt = exports.ZodBoolean = exports.ZodNumberFormat = exports.ZodNumber = exports.ZodCustomStringFormat = exports.ZodJWT = exports.ZodE164 = exports.ZodBase64URL = exports.ZodBase64 = exports.ZodCIDRv6 = exports.ZodCIDRv4 = exports.ZodIPv6 = exports.ZodIPv4 = exports.ZodKSUID = exports.ZodXID = exports.ZodULID = exports.ZodCUID2 = exports.ZodCUID = exports.ZodNanoID = exports.ZodEmoji = exports.ZodURL = exports.ZodUUID = exports.ZodGUID = exports.ZodEmail = exports.ZodStringFormat = exports.ZodString = exports._ZodString = exports.ZodType = undefined;
  exports.stringbool = exports.ZodCustom = exports.ZodPromise = exports.ZodLazy = exports.ZodTemplateLiteral = exports.ZodReadonly = exports.ZodPipe = exports.ZodNaN = exports.ZodCatch = exports.ZodSuccess = exports.ZodNonOptional = exports.ZodPrefault = exports.ZodDefault = exports.ZodNullable = exports.ZodOptional = undefined;
  exports.string = string;
  exports.email = email;
  exports.guid = guid;
  exports.uuid = uuid;
  exports.uuidv4 = uuidv4;
  exports.uuidv6 = uuidv6;
  exports.uuidv7 = uuidv7;
  exports.url = url;
  exports.emoji = emoji;
  exports.nanoid = nanoid;
  exports.cuid = cuid;
  exports.cuid2 = cuid2;
  exports.ulid = ulid;
  exports.xid = xid;
  exports.ksuid = ksuid;
  exports.ipv4 = ipv4;
  exports.ipv6 = ipv6;
  exports.cidrv4 = cidrv4;
  exports.cidrv6 = cidrv6;
  exports.base64 = base64;
  exports.base64url = base64url;
  exports.e164 = e164;
  exports.jwt = jwt;
  exports.stringFormat = stringFormat;
  exports.number = number;
  exports.int = int;
  exports.float32 = float32;
  exports.float64 = float64;
  exports.int32 = int32;
  exports.uint32 = uint32;
  exports.boolean = boolean;
  exports.bigint = bigint;
  exports.int64 = int64;
  exports.uint64 = uint64;
  exports.symbol = symbol;
  exports.undefined = _undefined;
  exports.null = _null;
  exports.any = any;
  exports.unknown = unknown;
  exports.never = never;
  exports.void = _void;
  exports.date = date;
  exports.array = array;
  exports.keyof = keyof;
  exports.object = object;
  exports.strictObject = strictObject;
  exports.looseObject = looseObject;
  exports.union = union;
  exports.discriminatedUnion = discriminatedUnion;
  exports.intersection = intersection;
  exports.tuple = tuple;
  exports.record = record;
  exports.partialRecord = partialRecord;
  exports.map = map;
  exports.set = set;
  exports.enum = _enum;
  exports.nativeEnum = nativeEnum;
  exports.literal = literal;
  exports.file = file;
  exports.transform = transform;
  exports.optional = optional;
  exports.nullable = nullable;
  exports.nullish = nullish;
  exports._default = _default;
  exports.prefault = prefault;
  exports.nonoptional = nonoptional;
  exports.success = success;
  exports.catch = _catch;
  exports.nan = nan;
  exports.pipe = pipe;
  exports.readonly = readonly;
  exports.templateLiteral = templateLiteral;
  exports.lazy = lazy;
  exports.promise = promise;
  exports.check = check;
  exports.custom = custom;
  exports.refine = refine;
  exports.superRefine = superRefine;
  exports.instanceof = _instanceof;
  exports.json = json;
  exports.preprocess = preprocess;
  var core = __importStar(require_core2());
  var index_js_1 = require_core2();
  var checks = __importStar(require_checks2());
  var iso = __importStar(require_iso());
  var parse = __importStar(require_parse2());
  exports.ZodType = core.$constructor("ZodType", (inst, def) => {
    core.$ZodType.init(inst, def);
    inst.def = def;
    Object.defineProperty(inst, "_def", { value: def });
    inst.check = (...checks2) => {
      return inst.clone({
        ...def,
        checks: [
          ...def.checks ?? [],
          ...checks2.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
        ]
      });
    };
    inst.clone = (def2, params) => core.clone(inst, def2, params);
    inst.brand = () => inst;
    inst.register = (reg, meta) => {
      reg.add(inst, meta);
      return inst;
    };
    inst.parse = (data, params) => parse.parse(inst, data, params, { callee: inst.parse });
    inst.safeParse = (data, params) => parse.safeParse(inst, data, params);
    inst.parseAsync = async (data, params) => parse.parseAsync(inst, data, params, { callee: inst.parseAsync });
    inst.safeParseAsync = async (data, params) => parse.safeParseAsync(inst, data, params);
    inst.spa = inst.safeParseAsync;
    inst.refine = (check2, params) => inst.check(refine(check2, params));
    inst.superRefine = (refinement) => inst.check(superRefine(refinement));
    inst.overwrite = (fn) => inst.check(checks.overwrite(fn));
    inst.optional = () => optional(inst);
    inst.nullable = () => nullable(inst);
    inst.nullish = () => optional(nullable(inst));
    inst.nonoptional = (params) => nonoptional(inst, params);
    inst.array = () => array(inst);
    inst.or = (arg) => union([inst, arg]);
    inst.and = (arg) => intersection(inst, arg);
    inst.transform = (tx) => pipe(inst, transform(tx));
    inst.default = (def2) => _default(inst, def2);
    inst.prefault = (def2) => prefault(inst, def2);
    inst.catch = (params) => _catch(inst, params);
    inst.pipe = (target) => pipe(inst, target);
    inst.readonly = () => readonly(inst);
    inst.describe = (description) => {
      const cl = inst.clone();
      core.globalRegistry.add(cl, { description });
      return cl;
    };
    Object.defineProperty(inst, "description", {
      get() {
        return core.globalRegistry.get(inst)?.description;
      },
      configurable: true
    });
    inst.meta = (...args) => {
      if (args.length === 0) {
        return core.globalRegistry.get(inst);
      }
      const cl = inst.clone();
      core.globalRegistry.add(cl, args[0]);
      return cl;
    };
    inst.isOptional = () => inst.safeParse(undefined).success;
    inst.isNullable = () => inst.safeParse(null).success;
    return inst;
  });
  exports._ZodString = core.$constructor("_ZodString", (inst, def) => {
    core.$ZodString.init(inst, def);
    exports.ZodType.init(inst, def);
    const bag = inst._zod.bag;
    inst.format = bag.format ?? null;
    inst.minLength = bag.minimum ?? null;
    inst.maxLength = bag.maximum ?? null;
    inst.regex = (...args) => inst.check(checks.regex(...args));
    inst.includes = (...args) => inst.check(checks.includes(...args));
    inst.startsWith = (...args) => inst.check(checks.startsWith(...args));
    inst.endsWith = (...args) => inst.check(checks.endsWith(...args));
    inst.min = (...args) => inst.check(checks.minLength(...args));
    inst.max = (...args) => inst.check(checks.maxLength(...args));
    inst.length = (...args) => inst.check(checks.length(...args));
    inst.nonempty = (...args) => inst.check(checks.minLength(1, ...args));
    inst.lowercase = (params) => inst.check(checks.lowercase(params));
    inst.uppercase = (params) => inst.check(checks.uppercase(params));
    inst.trim = () => inst.check(checks.trim());
    inst.normalize = (...args) => inst.check(checks.normalize(...args));
    inst.toLowerCase = () => inst.check(checks.toLowerCase());
    inst.toUpperCase = () => inst.check(checks.toUpperCase());
  });
  exports.ZodString = core.$constructor("ZodString", (inst, def) => {
    core.$ZodString.init(inst, def);
    exports._ZodString.init(inst, def);
    inst.email = (params) => inst.check(core._email(exports.ZodEmail, params));
    inst.url = (params) => inst.check(core._url(exports.ZodURL, params));
    inst.jwt = (params) => inst.check(core._jwt(exports.ZodJWT, params));
    inst.emoji = (params) => inst.check(core._emoji(exports.ZodEmoji, params));
    inst.guid = (params) => inst.check(core._guid(exports.ZodGUID, params));
    inst.uuid = (params) => inst.check(core._uuid(exports.ZodUUID, params));
    inst.uuidv4 = (params) => inst.check(core._uuidv4(exports.ZodUUID, params));
    inst.uuidv6 = (params) => inst.check(core._uuidv6(exports.ZodUUID, params));
    inst.uuidv7 = (params) => inst.check(core._uuidv7(exports.ZodUUID, params));
    inst.nanoid = (params) => inst.check(core._nanoid(exports.ZodNanoID, params));
    inst.guid = (params) => inst.check(core._guid(exports.ZodGUID, params));
    inst.cuid = (params) => inst.check(core._cuid(exports.ZodCUID, params));
    inst.cuid2 = (params) => inst.check(core._cuid2(exports.ZodCUID2, params));
    inst.ulid = (params) => inst.check(core._ulid(exports.ZodULID, params));
    inst.base64 = (params) => inst.check(core._base64(exports.ZodBase64, params));
    inst.base64url = (params) => inst.check(core._base64url(exports.ZodBase64URL, params));
    inst.xid = (params) => inst.check(core._xid(exports.ZodXID, params));
    inst.ksuid = (params) => inst.check(core._ksuid(exports.ZodKSUID, params));
    inst.ipv4 = (params) => inst.check(core._ipv4(exports.ZodIPv4, params));
    inst.ipv6 = (params) => inst.check(core._ipv6(exports.ZodIPv6, params));
    inst.cidrv4 = (params) => inst.check(core._cidrv4(exports.ZodCIDRv4, params));
    inst.cidrv6 = (params) => inst.check(core._cidrv6(exports.ZodCIDRv6, params));
    inst.e164 = (params) => inst.check(core._e164(exports.ZodE164, params));
    inst.datetime = (params) => inst.check(iso.datetime(params));
    inst.date = (params) => inst.check(iso.date(params));
    inst.time = (params) => inst.check(iso.time(params));
    inst.duration = (params) => inst.check(iso.duration(params));
  });
  function string(params) {
    return core._string(exports.ZodString, params);
  }
  exports.ZodStringFormat = core.$constructor("ZodStringFormat", (inst, def) => {
    core.$ZodStringFormat.init(inst, def);
    exports._ZodString.init(inst, def);
  });
  exports.ZodEmail = core.$constructor("ZodEmail", (inst, def) => {
    core.$ZodEmail.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function email(params) {
    return core._email(exports.ZodEmail, params);
  }
  exports.ZodGUID = core.$constructor("ZodGUID", (inst, def) => {
    core.$ZodGUID.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function guid(params) {
    return core._guid(exports.ZodGUID, params);
  }
  exports.ZodUUID = core.$constructor("ZodUUID", (inst, def) => {
    core.$ZodUUID.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function uuid(params) {
    return core._uuid(exports.ZodUUID, params);
  }
  function uuidv4(params) {
    return core._uuidv4(exports.ZodUUID, params);
  }
  function uuidv6(params) {
    return core._uuidv6(exports.ZodUUID, params);
  }
  function uuidv7(params) {
    return core._uuidv7(exports.ZodUUID, params);
  }
  exports.ZodURL = core.$constructor("ZodURL", (inst, def) => {
    core.$ZodURL.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function url(params) {
    return core._url(exports.ZodURL, params);
  }
  exports.ZodEmoji = core.$constructor("ZodEmoji", (inst, def) => {
    core.$ZodEmoji.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function emoji(params) {
    return core._emoji(exports.ZodEmoji, params);
  }
  exports.ZodNanoID = core.$constructor("ZodNanoID", (inst, def) => {
    core.$ZodNanoID.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function nanoid(params) {
    return core._nanoid(exports.ZodNanoID, params);
  }
  exports.ZodCUID = core.$constructor("ZodCUID", (inst, def) => {
    core.$ZodCUID.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function cuid(params) {
    return core._cuid(exports.ZodCUID, params);
  }
  exports.ZodCUID2 = core.$constructor("ZodCUID2", (inst, def) => {
    core.$ZodCUID2.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function cuid2(params) {
    return core._cuid2(exports.ZodCUID2, params);
  }
  exports.ZodULID = core.$constructor("ZodULID", (inst, def) => {
    core.$ZodULID.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function ulid(params) {
    return core._ulid(exports.ZodULID, params);
  }
  exports.ZodXID = core.$constructor("ZodXID", (inst, def) => {
    core.$ZodXID.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function xid(params) {
    return core._xid(exports.ZodXID, params);
  }
  exports.ZodKSUID = core.$constructor("ZodKSUID", (inst, def) => {
    core.$ZodKSUID.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function ksuid(params) {
    return core._ksuid(exports.ZodKSUID, params);
  }
  exports.ZodIPv4 = core.$constructor("ZodIPv4", (inst, def) => {
    core.$ZodIPv4.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function ipv4(params) {
    return core._ipv4(exports.ZodIPv4, params);
  }
  exports.ZodIPv6 = core.$constructor("ZodIPv6", (inst, def) => {
    core.$ZodIPv6.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function ipv6(params) {
    return core._ipv6(exports.ZodIPv6, params);
  }
  exports.ZodCIDRv4 = core.$constructor("ZodCIDRv4", (inst, def) => {
    core.$ZodCIDRv4.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function cidrv4(params) {
    return core._cidrv4(exports.ZodCIDRv4, params);
  }
  exports.ZodCIDRv6 = core.$constructor("ZodCIDRv6", (inst, def) => {
    core.$ZodCIDRv6.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function cidrv6(params) {
    return core._cidrv6(exports.ZodCIDRv6, params);
  }
  exports.ZodBase64 = core.$constructor("ZodBase64", (inst, def) => {
    core.$ZodBase64.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function base64(params) {
    return core._base64(exports.ZodBase64, params);
  }
  exports.ZodBase64URL = core.$constructor("ZodBase64URL", (inst, def) => {
    core.$ZodBase64URL.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function base64url(params) {
    return core._base64url(exports.ZodBase64URL, params);
  }
  exports.ZodE164 = core.$constructor("ZodE164", (inst, def) => {
    core.$ZodE164.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function e164(params) {
    return core._e164(exports.ZodE164, params);
  }
  exports.ZodJWT = core.$constructor("ZodJWT", (inst, def) => {
    core.$ZodJWT.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function jwt(params) {
    return core._jwt(exports.ZodJWT, params);
  }
  exports.ZodCustomStringFormat = core.$constructor("ZodCustomStringFormat", (inst, def) => {
    core.$ZodCustomStringFormat.init(inst, def);
    exports.ZodStringFormat.init(inst, def);
  });
  function stringFormat(format, fnOrRegex, _params = {}) {
    return core._stringFormat(exports.ZodCustomStringFormat, format, fnOrRegex, _params);
  }
  exports.ZodNumber = core.$constructor("ZodNumber", (inst, def) => {
    core.$ZodNumber.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.gt = (value, params) => inst.check(checks.gt(value, params));
    inst.gte = (value, params) => inst.check(checks.gte(value, params));
    inst.min = (value, params) => inst.check(checks.gte(value, params));
    inst.lt = (value, params) => inst.check(checks.lt(value, params));
    inst.lte = (value, params) => inst.check(checks.lte(value, params));
    inst.max = (value, params) => inst.check(checks.lte(value, params));
    inst.int = (params) => inst.check(int(params));
    inst.safe = (params) => inst.check(int(params));
    inst.positive = (params) => inst.check(checks.gt(0, params));
    inst.nonnegative = (params) => inst.check(checks.gte(0, params));
    inst.negative = (params) => inst.check(checks.lt(0, params));
    inst.nonpositive = (params) => inst.check(checks.lte(0, params));
    inst.multipleOf = (value, params) => inst.check(checks.multipleOf(value, params));
    inst.step = (value, params) => inst.check(checks.multipleOf(value, params));
    inst.finite = () => inst;
    const bag = inst._zod.bag;
    inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
    inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
    inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? 0.5);
    inst.isFinite = true;
    inst.format = bag.format ?? null;
  });
  function number(params) {
    return core._number(exports.ZodNumber, params);
  }
  exports.ZodNumberFormat = core.$constructor("ZodNumberFormat", (inst, def) => {
    core.$ZodNumberFormat.init(inst, def);
    exports.ZodNumber.init(inst, def);
  });
  function int(params) {
    return core._int(exports.ZodNumberFormat, params);
  }
  function float32(params) {
    return core._float32(exports.ZodNumberFormat, params);
  }
  function float64(params) {
    return core._float64(exports.ZodNumberFormat, params);
  }
  function int32(params) {
    return core._int32(exports.ZodNumberFormat, params);
  }
  function uint32(params) {
    return core._uint32(exports.ZodNumberFormat, params);
  }
  exports.ZodBoolean = core.$constructor("ZodBoolean", (inst, def) => {
    core.$ZodBoolean.init(inst, def);
    exports.ZodType.init(inst, def);
  });
  function boolean(params) {
    return core._boolean(exports.ZodBoolean, params);
  }
  exports.ZodBigInt = core.$constructor("ZodBigInt", (inst, def) => {
    core.$ZodBigInt.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.gte = (value, params) => inst.check(checks.gte(value, params));
    inst.min = (value, params) => inst.check(checks.gte(value, params));
    inst.gt = (value, params) => inst.check(checks.gt(value, params));
    inst.gte = (value, params) => inst.check(checks.gte(value, params));
    inst.min = (value, params) => inst.check(checks.gte(value, params));
    inst.lt = (value, params) => inst.check(checks.lt(value, params));
    inst.lte = (value, params) => inst.check(checks.lte(value, params));
    inst.max = (value, params) => inst.check(checks.lte(value, params));
    inst.positive = (params) => inst.check(checks.gt(BigInt(0), params));
    inst.negative = (params) => inst.check(checks.lt(BigInt(0), params));
    inst.nonpositive = (params) => inst.check(checks.lte(BigInt(0), params));
    inst.nonnegative = (params) => inst.check(checks.gte(BigInt(0), params));
    inst.multipleOf = (value, params) => inst.check(checks.multipleOf(value, params));
    const bag = inst._zod.bag;
    inst.minValue = bag.minimum ?? null;
    inst.maxValue = bag.maximum ?? null;
    inst.format = bag.format ?? null;
  });
  function bigint(params) {
    return core._bigint(exports.ZodBigInt, params);
  }
  exports.ZodBigIntFormat = core.$constructor("ZodBigIntFormat", (inst, def) => {
    core.$ZodBigIntFormat.init(inst, def);
    exports.ZodBigInt.init(inst, def);
  });
  function int64(params) {
    return core._int64(exports.ZodBigIntFormat, params);
  }
  function uint64(params) {
    return core._uint64(exports.ZodBigIntFormat, params);
  }
  exports.ZodSymbol = core.$constructor("ZodSymbol", (inst, def) => {
    core.$ZodSymbol.init(inst, def);
    exports.ZodType.init(inst, def);
  });
  function symbol(params) {
    return core._symbol(exports.ZodSymbol, params);
  }
  exports.ZodUndefined = core.$constructor("ZodUndefined", (inst, def) => {
    core.$ZodUndefined.init(inst, def);
    exports.ZodType.init(inst, def);
  });
  function _undefined(params) {
    return core._undefined(exports.ZodUndefined, params);
  }
  exports.ZodNull = core.$constructor("ZodNull", (inst, def) => {
    core.$ZodNull.init(inst, def);
    exports.ZodType.init(inst, def);
  });
  function _null(params) {
    return core._null(exports.ZodNull, params);
  }
  exports.ZodAny = core.$constructor("ZodAny", (inst, def) => {
    core.$ZodAny.init(inst, def);
    exports.ZodType.init(inst, def);
  });
  function any() {
    return core._any(exports.ZodAny);
  }
  exports.ZodUnknown = core.$constructor("ZodUnknown", (inst, def) => {
    core.$ZodUnknown.init(inst, def);
    exports.ZodType.init(inst, def);
  });
  function unknown() {
    return core._unknown(exports.ZodUnknown);
  }
  exports.ZodNever = core.$constructor("ZodNever", (inst, def) => {
    core.$ZodNever.init(inst, def);
    exports.ZodType.init(inst, def);
  });
  function never(params) {
    return core._never(exports.ZodNever, params);
  }
  exports.ZodVoid = core.$constructor("ZodVoid", (inst, def) => {
    core.$ZodVoid.init(inst, def);
    exports.ZodType.init(inst, def);
  });
  function _void(params) {
    return core._void(exports.ZodVoid, params);
  }
  exports.ZodDate = core.$constructor("ZodDate", (inst, def) => {
    core.$ZodDate.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.min = (value, params) => inst.check(checks.gte(value, params));
    inst.max = (value, params) => inst.check(checks.lte(value, params));
    const c = inst._zod.bag;
    inst.minDate = c.minimum ? new Date(c.minimum) : null;
    inst.maxDate = c.maximum ? new Date(c.maximum) : null;
  });
  function date(params) {
    return core._date(exports.ZodDate, params);
  }
  exports.ZodArray = core.$constructor("ZodArray", (inst, def) => {
    core.$ZodArray.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.element = def.element;
    inst.min = (minLength, params) => inst.check(checks.minLength(minLength, params));
    inst.nonempty = (params) => inst.check(checks.minLength(1, params));
    inst.max = (maxLength, params) => inst.check(checks.maxLength(maxLength, params));
    inst.length = (len, params) => inst.check(checks.length(len, params));
    inst.unwrap = () => inst.element;
  });
  function array(element, params) {
    return core._array(exports.ZodArray, element, params);
  }
  function keyof(schema) {
    const shape = schema._zod.def.shape;
    return literal(Object.keys(shape));
  }
  exports.ZodObject = core.$constructor("ZodObject", (inst, def) => {
    core.$ZodObject.init(inst, def);
    exports.ZodType.init(inst, def);
    index_js_1.util.defineLazy(inst, "shape", () => def.shape);
    inst.keyof = () => _enum(Object.keys(inst._zod.def.shape));
    inst.catchall = (catchall) => inst.clone({ ...inst._zod.def, catchall });
    inst.passthrough = () => inst.clone({ ...inst._zod.def, catchall: unknown() });
    inst.loose = () => inst.clone({ ...inst._zod.def, catchall: unknown() });
    inst.strict = () => inst.clone({ ...inst._zod.def, catchall: never() });
    inst.strip = () => inst.clone({ ...inst._zod.def, catchall: undefined });
    inst.extend = (incoming) => {
      return index_js_1.util.extend(inst, incoming);
    };
    inst.merge = (other) => index_js_1.util.merge(inst, other);
    inst.pick = (mask) => index_js_1.util.pick(inst, mask);
    inst.omit = (mask) => index_js_1.util.omit(inst, mask);
    inst.partial = (...args) => index_js_1.util.partial(exports.ZodOptional, inst, args[0]);
    inst.required = (...args) => index_js_1.util.required(exports.ZodNonOptional, inst, args[0]);
  });
  function object(shape, params) {
    const def = {
      type: "object",
      get shape() {
        index_js_1.util.assignProp(this, "shape", { ...shape });
        return this.shape;
      },
      ...index_js_1.util.normalizeParams(params)
    };
    return new exports.ZodObject(def);
  }
  function strictObject(shape, params) {
    return new exports.ZodObject({
      type: "object",
      get shape() {
        index_js_1.util.assignProp(this, "shape", { ...shape });
        return this.shape;
      },
      catchall: never(),
      ...index_js_1.util.normalizeParams(params)
    });
  }
  function looseObject(shape, params) {
    return new exports.ZodObject({
      type: "object",
      get shape() {
        index_js_1.util.assignProp(this, "shape", { ...shape });
        return this.shape;
      },
      catchall: unknown(),
      ...index_js_1.util.normalizeParams(params)
    });
  }
  exports.ZodUnion = core.$constructor("ZodUnion", (inst, def) => {
    core.$ZodUnion.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.options = def.options;
  });
  function union(options, params) {
    return new exports.ZodUnion({
      type: "union",
      options,
      ...index_js_1.util.normalizeParams(params)
    });
  }
  exports.ZodDiscriminatedUnion = core.$constructor("ZodDiscriminatedUnion", (inst, def) => {
    exports.ZodUnion.init(inst, def);
    core.$ZodDiscriminatedUnion.init(inst, def);
  });
  function discriminatedUnion(discriminator, options, params) {
    return new exports.ZodDiscriminatedUnion({
      type: "union",
      options,
      discriminator,
      ...index_js_1.util.normalizeParams(params)
    });
  }
  exports.ZodIntersection = core.$constructor("ZodIntersection", (inst, def) => {
    core.$ZodIntersection.init(inst, def);
    exports.ZodType.init(inst, def);
  });
  function intersection(left, right) {
    return new exports.ZodIntersection({
      type: "intersection",
      left,
      right
    });
  }
  exports.ZodTuple = core.$constructor("ZodTuple", (inst, def) => {
    core.$ZodTuple.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.rest = (rest) => inst.clone({
      ...inst._zod.def,
      rest
    });
  });
  function tuple(items, _paramsOrRest, _params) {
    const hasRest = _paramsOrRest instanceof core.$ZodType;
    const params = hasRest ? _params : _paramsOrRest;
    const rest = hasRest ? _paramsOrRest : null;
    return new exports.ZodTuple({
      type: "tuple",
      items,
      rest,
      ...index_js_1.util.normalizeParams(params)
    });
  }
  exports.ZodRecord = core.$constructor("ZodRecord", (inst, def) => {
    core.$ZodRecord.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.keyType = def.keyType;
    inst.valueType = def.valueType;
  });
  function record(keyType, valueType, params) {
    return new exports.ZodRecord({
      type: "record",
      keyType,
      valueType,
      ...index_js_1.util.normalizeParams(params)
    });
  }
  function partialRecord(keyType, valueType, params) {
    return new exports.ZodRecord({
      type: "record",
      keyType: union([keyType, never()]),
      valueType,
      ...index_js_1.util.normalizeParams(params)
    });
  }
  exports.ZodMap = core.$constructor("ZodMap", (inst, def) => {
    core.$ZodMap.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.keyType = def.keyType;
    inst.valueType = def.valueType;
  });
  function map(keyType, valueType, params) {
    return new exports.ZodMap({
      type: "map",
      keyType,
      valueType,
      ...index_js_1.util.normalizeParams(params)
    });
  }
  exports.ZodSet = core.$constructor("ZodSet", (inst, def) => {
    core.$ZodSet.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.min = (...args) => inst.check(core._minSize(...args));
    inst.nonempty = (params) => inst.check(core._minSize(1, params));
    inst.max = (...args) => inst.check(core._maxSize(...args));
    inst.size = (...args) => inst.check(core._size(...args));
  });
  function set(valueType, params) {
    return new exports.ZodSet({
      type: "set",
      valueType,
      ...index_js_1.util.normalizeParams(params)
    });
  }
  exports.ZodEnum = core.$constructor("ZodEnum", (inst, def) => {
    core.$ZodEnum.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.enum = def.entries;
    inst.options = Object.values(def.entries);
    const keys = new Set(Object.keys(def.entries));
    inst.extract = (values, params) => {
      const newEntries = {};
      for (const value of values) {
        if (keys.has(value)) {
          newEntries[value] = def.entries[value];
        } else
          throw new Error(`Key ${value} not found in enum`);
      }
      return new exports.ZodEnum({
        ...def,
        checks: [],
        ...index_js_1.util.normalizeParams(params),
        entries: newEntries
      });
    };
    inst.exclude = (values, params) => {
      const newEntries = { ...def.entries };
      for (const value of values) {
        if (keys.has(value)) {
          delete newEntries[value];
        } else
          throw new Error(`Key ${value} not found in enum`);
      }
      return new exports.ZodEnum({
        ...def,
        checks: [],
        ...index_js_1.util.normalizeParams(params),
        entries: newEntries
      });
    };
  });
  function _enum(values, params) {
    const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
    return new exports.ZodEnum({
      type: "enum",
      entries,
      ...index_js_1.util.normalizeParams(params)
    });
  }
  function nativeEnum(entries, params) {
    return new exports.ZodEnum({
      type: "enum",
      entries,
      ...index_js_1.util.normalizeParams(params)
    });
  }
  exports.ZodLiteral = core.$constructor("ZodLiteral", (inst, def) => {
    core.$ZodLiteral.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.values = new Set(def.values);
    Object.defineProperty(inst, "value", {
      get() {
        if (def.values.length > 1) {
          throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
        }
        return def.values[0];
      }
    });
  });
  function literal(value, params) {
    return new exports.ZodLiteral({
      type: "literal",
      values: Array.isArray(value) ? value : [value],
      ...index_js_1.util.normalizeParams(params)
    });
  }
  exports.ZodFile = core.$constructor("ZodFile", (inst, def) => {
    core.$ZodFile.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.min = (size, params) => inst.check(core._minSize(size, params));
    inst.max = (size, params) => inst.check(core._maxSize(size, params));
    inst.mime = (types, params) => inst.check(core._mime(Array.isArray(types) ? types : [types], params));
  });
  function file(params) {
    return core._file(exports.ZodFile, params);
  }
  exports.ZodTransform = core.$constructor("ZodTransform", (inst, def) => {
    core.$ZodTransform.init(inst, def);
    exports.ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
      payload.addIssue = (issue) => {
        if (typeof issue === "string") {
          payload.issues.push(index_js_1.util.issue(issue, payload.value, def));
        } else {
          const _issue = issue;
          if (_issue.fatal)
            _issue.continue = false;
          _issue.code ?? (_issue.code = "custom");
          _issue.input ?? (_issue.input = payload.value);
          _issue.inst ?? (_issue.inst = inst);
          _issue.continue ?? (_issue.continue = true);
          payload.issues.push(index_js_1.util.issue(_issue));
        }
      };
      const output = def.transform(payload.value, payload);
      if (output instanceof Promise) {
        return output.then((output2) => {
          payload.value = output2;
          return payload;
        });
      }
      payload.value = output;
      return payload;
    };
  });
  function transform(fn) {
    return new exports.ZodTransform({
      type: "transform",
      transform: fn
    });
  }
  exports.ZodOptional = core.$constructor("ZodOptional", (inst, def) => {
    core.$ZodOptional.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  function optional(innerType) {
    return new exports.ZodOptional({
      type: "optional",
      innerType
    });
  }
  exports.ZodNullable = core.$constructor("ZodNullable", (inst, def) => {
    core.$ZodNullable.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  function nullable(innerType) {
    return new exports.ZodNullable({
      type: "nullable",
      innerType
    });
  }
  function nullish(innerType) {
    return optional(nullable(innerType));
  }
  exports.ZodDefault = core.$constructor("ZodDefault", (inst, def) => {
    core.$ZodDefault.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.unwrap = () => inst._zod.def.innerType;
    inst.removeDefault = inst.unwrap;
  });
  function _default(innerType, defaultValue) {
    return new exports.ZodDefault({
      type: "default",
      innerType,
      get defaultValue() {
        return typeof defaultValue === "function" ? defaultValue() : defaultValue;
      }
    });
  }
  exports.ZodPrefault = core.$constructor("ZodPrefault", (inst, def) => {
    core.$ZodPrefault.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  function prefault(innerType, defaultValue) {
    return new exports.ZodPrefault({
      type: "prefault",
      innerType,
      get defaultValue() {
        return typeof defaultValue === "function" ? defaultValue() : defaultValue;
      }
    });
  }
  exports.ZodNonOptional = core.$constructor("ZodNonOptional", (inst, def) => {
    core.$ZodNonOptional.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  function nonoptional(innerType, params) {
    return new exports.ZodNonOptional({
      type: "nonoptional",
      innerType,
      ...index_js_1.util.normalizeParams(params)
    });
  }
  exports.ZodSuccess = core.$constructor("ZodSuccess", (inst, def) => {
    core.$ZodSuccess.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  function success(innerType) {
    return new exports.ZodSuccess({
      type: "success",
      innerType
    });
  }
  exports.ZodCatch = core.$constructor("ZodCatch", (inst, def) => {
    core.$ZodCatch.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.unwrap = () => inst._zod.def.innerType;
    inst.removeCatch = inst.unwrap;
  });
  function _catch(innerType, catchValue) {
    return new exports.ZodCatch({
      type: "catch",
      innerType,
      catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
    });
  }
  exports.ZodNaN = core.$constructor("ZodNaN", (inst, def) => {
    core.$ZodNaN.init(inst, def);
    exports.ZodType.init(inst, def);
  });
  function nan(params) {
    return core._nan(exports.ZodNaN, params);
  }
  exports.ZodPipe = core.$constructor("ZodPipe", (inst, def) => {
    core.$ZodPipe.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.in = def.in;
    inst.out = def.out;
  });
  function pipe(in_, out) {
    return new exports.ZodPipe({
      type: "pipe",
      in: in_,
      out
    });
  }
  exports.ZodReadonly = core.$constructor("ZodReadonly", (inst, def) => {
    core.$ZodReadonly.init(inst, def);
    exports.ZodType.init(inst, def);
  });
  function readonly(innerType) {
    return new exports.ZodReadonly({
      type: "readonly",
      innerType
    });
  }
  exports.ZodTemplateLiteral = core.$constructor("ZodTemplateLiteral", (inst, def) => {
    core.$ZodTemplateLiteral.init(inst, def);
    exports.ZodType.init(inst, def);
  });
  function templateLiteral(parts, params) {
    return new exports.ZodTemplateLiteral({
      type: "template_literal",
      parts,
      ...index_js_1.util.normalizeParams(params)
    });
  }
  exports.ZodLazy = core.$constructor("ZodLazy", (inst, def) => {
    core.$ZodLazy.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.unwrap = () => inst._zod.def.getter();
  });
  function lazy(getter) {
    return new exports.ZodLazy({
      type: "lazy",
      getter
    });
  }
  exports.ZodPromise = core.$constructor("ZodPromise", (inst, def) => {
    core.$ZodPromise.init(inst, def);
    exports.ZodType.init(inst, def);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  function promise(innerType) {
    return new exports.ZodPromise({
      type: "promise",
      innerType
    });
  }
  exports.ZodCustom = core.$constructor("ZodCustom", (inst, def) => {
    core.$ZodCustom.init(inst, def);
    exports.ZodType.init(inst, def);
  });
  function check(fn) {
    const ch = new core.$ZodCheck({
      check: "custom"
    });
    ch._zod.check = fn;
    return ch;
  }
  function custom(fn, _params) {
    return core._custom(exports.ZodCustom, fn ?? (() => true), _params);
  }
  function refine(fn, _params = {}) {
    return core._refine(exports.ZodCustom, fn, _params);
  }
  function superRefine(fn) {
    const ch = check((payload) => {
      payload.addIssue = (issue) => {
        if (typeof issue === "string") {
          payload.issues.push(index_js_1.util.issue(issue, payload.value, ch._zod.def));
        } else {
          const _issue = issue;
          if (_issue.fatal)
            _issue.continue = false;
          _issue.code ?? (_issue.code = "custom");
          _issue.input ?? (_issue.input = payload.value);
          _issue.inst ?? (_issue.inst = ch);
          _issue.continue ?? (_issue.continue = !ch._zod.def.abort);
          payload.issues.push(index_js_1.util.issue(_issue));
        }
      };
      return fn(payload.value, payload);
    });
    return ch;
  }
  function _instanceof(cls, params = {
    error: `Input not instance of ${cls.name}`
  }) {
    const inst = new exports.ZodCustom({
      type: "custom",
      check: "custom",
      fn: (data) => data instanceof cls,
      abort: true,
      ...index_js_1.util.normalizeParams(params)
    });
    inst._zod.bag.Class = cls;
    return inst;
  }
  var stringbool = (...args) => core._stringbool({
    Pipe: exports.ZodPipe,
    Boolean: exports.ZodBoolean,
    String: exports.ZodString,
    Transform: exports.ZodTransform
  }, ...args);
  exports.stringbool = stringbool;
  function json(params) {
    const jsonSchema = lazy(() => {
      return union([string(params), number(), boolean(), _null(), array(jsonSchema), record(string(), jsonSchema)]);
    });
    return jsonSchema;
  }
  function preprocess(fn, schema) {
    return pipe(transform(fn), schema);
  }
});

// node_modules/zod/v4/classic/compat.cjs
var require_compat = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.config = exports.$brand = exports.ZodIssueCode = undefined;
  exports.setErrorMap = setErrorMap;
  exports.getErrorMap = getErrorMap;
  var core = __importStar(require_core2());
  exports.ZodIssueCode = {
    invalid_type: "invalid_type",
    too_big: "too_big",
    too_small: "too_small",
    invalid_format: "invalid_format",
    not_multiple_of: "not_multiple_of",
    unrecognized_keys: "unrecognized_keys",
    invalid_union: "invalid_union",
    invalid_key: "invalid_key",
    invalid_element: "invalid_element",
    invalid_value: "invalid_value",
    custom: "custom"
  };
  var index_js_1 = require_core2();
  Object.defineProperty(exports, "$brand", { enumerable: true, get: function() {
    return index_js_1.$brand;
  } });
  Object.defineProperty(exports, "config", { enumerable: true, get: function() {
    return index_js_1.config;
  } });
  function setErrorMap(map) {
    core.config({
      customError: map
    });
  }
  function getErrorMap() {
    return core.config().customError;
  }
});

// node_modules/zod/v4/classic/coerce.cjs
var require_coerce = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.string = string;
  exports.number = number;
  exports.boolean = boolean;
  exports.bigint = bigint;
  exports.date = date;
  var core = __importStar(require_core2());
  var schemas = __importStar(require_schemas2());
  function string(params) {
    return core._coercedString(schemas.ZodString, params);
  }
  function number(params) {
    return core._coercedNumber(schemas.ZodNumber, params);
  }
  function boolean(params) {
    return core._coercedBoolean(schemas.ZodBoolean, params);
  }
  function bigint(params) {
    return core._coercedBigint(schemas.ZodBigInt, params);
  }
  function date(params) {
    return core._coercedDate(schemas.ZodDate, params);
  }
});

// node_modules/zod/v4/classic/external.cjs
var require_external = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  var __exportStar = exports && exports.__exportStar || function(m, exports2) {
    for (var p in m)
      if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p))
        __createBinding(exports2, m, p);
  };
  var __importDefault = exports && exports.__importDefault || function(mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.coerce = exports.iso = exports.ZodISODuration = exports.ZodISOTime = exports.ZodISODate = exports.ZodISODateTime = exports.locales = exports.NEVER = exports.TimePrecision = exports.toJSONSchema = exports.flattenError = exports.formatError = exports.prettifyError = exports.treeifyError = exports.regexes = exports.clone = exports.$brand = exports.$input = exports.$output = exports.function = exports.config = exports.registry = exports.globalRegistry = exports.core = undefined;
  exports.core = __importStar(require_core2());
  __exportStar(require_schemas2(), exports);
  __exportStar(require_checks2(), exports);
  __exportStar(require_errors3(), exports);
  __exportStar(require_parse2(), exports);
  __exportStar(require_compat(), exports);
  var index_js_1 = require_core2();
  var en_js_1 = __importDefault(require_en());
  (0, index_js_1.config)((0, en_js_1.default)());
  var index_js_2 = require_core2();
  Object.defineProperty(exports, "globalRegistry", { enumerable: true, get: function() {
    return index_js_2.globalRegistry;
  } });
  Object.defineProperty(exports, "registry", { enumerable: true, get: function() {
    return index_js_2.registry;
  } });
  Object.defineProperty(exports, "config", { enumerable: true, get: function() {
    return index_js_2.config;
  } });
  Object.defineProperty(exports, "function", { enumerable: true, get: function() {
    return index_js_2.function;
  } });
  Object.defineProperty(exports, "$output", { enumerable: true, get: function() {
    return index_js_2.$output;
  } });
  Object.defineProperty(exports, "$input", { enumerable: true, get: function() {
    return index_js_2.$input;
  } });
  Object.defineProperty(exports, "$brand", { enumerable: true, get: function() {
    return index_js_2.$brand;
  } });
  Object.defineProperty(exports, "clone", { enumerable: true, get: function() {
    return index_js_2.clone;
  } });
  Object.defineProperty(exports, "regexes", { enumerable: true, get: function() {
    return index_js_2.regexes;
  } });
  Object.defineProperty(exports, "treeifyError", { enumerable: true, get: function() {
    return index_js_2.treeifyError;
  } });
  Object.defineProperty(exports, "prettifyError", { enumerable: true, get: function() {
    return index_js_2.prettifyError;
  } });
  Object.defineProperty(exports, "formatError", { enumerable: true, get: function() {
    return index_js_2.formatError;
  } });
  Object.defineProperty(exports, "flattenError", { enumerable: true, get: function() {
    return index_js_2.flattenError;
  } });
  Object.defineProperty(exports, "toJSONSchema", { enumerable: true, get: function() {
    return index_js_2.toJSONSchema;
  } });
  Object.defineProperty(exports, "TimePrecision", { enumerable: true, get: function() {
    return index_js_2.TimePrecision;
  } });
  Object.defineProperty(exports, "NEVER", { enumerable: true, get: function() {
    return index_js_2.NEVER;
  } });
  exports.locales = __importStar(require_locales());
  var iso_js_1 = require_iso();
  Object.defineProperty(exports, "ZodISODateTime", { enumerable: true, get: function() {
    return iso_js_1.ZodISODateTime;
  } });
  Object.defineProperty(exports, "ZodISODate", { enumerable: true, get: function() {
    return iso_js_1.ZodISODate;
  } });
  Object.defineProperty(exports, "ZodISOTime", { enumerable: true, get: function() {
    return iso_js_1.ZodISOTime;
  } });
  Object.defineProperty(exports, "ZodISODuration", { enumerable: true, get: function() {
    return iso_js_1.ZodISODuration;
  } });
  exports.iso = __importStar(require_iso());
  exports.coerce = __importStar(require_coerce());
});

// node_modules/zod/index.cjs
var require_zod = __commonJS((exports) => {
  var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() {
        return m[k];
      } };
    }
    Object.defineProperty(o, k2, desc);
  } : function(o, m, k, k2) {
    if (k2 === undefined)
      k2 = k;
    o[k2] = m[k];
  });
  var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  } : function(o, v) {
    o["default"] = v;
  });
  var __importStar = exports && exports.__importStar || function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  var __exportStar = exports && exports.__exportStar || function(m, exports2) {
    for (var p in m)
      if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p))
        __createBinding(exports2, m, p);
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.z = undefined;
  var z = __importStar(require_external());
  exports.z = z;
  __exportStar(require_external(), exports);
  exports.default = z;
});

// node_modules/@honcho-ai/sdk/dist/validation.js
var require_validation = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.ConclusionQueryParamsSchema = exports.LimitSchema = exports.WorkspaceConfigSchema = exports.WorkspaceMetadataSchema = exports.MessageAdditionToApiSchema = exports.MessageAdditionSchema = exports.PeerRemovalSchema = exports.PeerAdditionToApiSchema = exports.PeerAdditionSchema = exports.PeerCardContentSchema = exports.CardTargetSchema = exports.PeerGetRepresentationParamsSchema = exports.GetRepresentationParamsSchema = exports.FileUploadSchema = exports.QueueStatusOptionsSchema = exports.ContextParamsSchema = exports.RepresentationOptionsSchema = exports.ChatQuerySchema = exports.FilterSchema = exports.SearchQueryLikeSchema = exports.SearchQueryObjectSchema = exports.SearchQuerySchema = exports.MessageInputSchema = exports.MessageConfigurationSchema = exports.MessageMetadataSchema = exports.MessageContentSchema = exports.SessionPeerConfigSchema = exports.SessionIdSchema = exports.SessionConfigSchema = exports.DreamConfigSchema = exports.SummaryConfigSchema = exports.PeerCardConfigSchema = exports.ReasoningConfigSchema = exports.SessionMetadataSchema = exports.PeerIdSchema = exports.PeerConfigSchema = exports.PeerMetadataSchema = exports.HonchoConfigSchema = exports.WorkspaceIdSchema = undefined;
  exports.normalizeSearchQuery = normalizeSearchQuery;
  exports.normalizeListOptions = normalizeListOptions;
  exports.peerConfigToApi = peerConfigToApi;
  exports.peerConfigFromApi = peerConfigFromApi;
  exports.workspaceConfigToApi = workspaceConfigToApi;
  exports.workspaceConfigFromApi = workspaceConfigFromApi;
  exports.sessionConfigToApi = sessionConfigToApi;
  exports.sessionConfigFromApi = sessionConfigFromApi;
  exports.messageConfigToApi = messageConfigToApi;
  exports.messageConfigFromApi = messageConfigFromApi;
  var zod_1 = require_zod();
  exports.WorkspaceIdSchema = zod_1.z.string().min(1, "Workspace ID must be a non-empty string").regex(/^[a-zA-Z0-9_-]+$/, "Workspace ID may only contain letters, numbers, underscores, and hyphens").max(100, "Workspace ID can be at most 100 characters");
  exports.HonchoConfigSchema = zod_1.z.object({
    apiKey: zod_1.z.string().optional(),
    environment: zod_1.z.enum(["local", "production"]).optional(),
    baseURL: zod_1.z.url("Base URL must be a valid URL").optional(),
    workspaceId: exports.WorkspaceIdSchema.optional(),
    timeout: zod_1.z.number().positive("Timeout must be a positive number").optional(),
    maxRetries: zod_1.z.number().int().min(0, "Max retries must be a non-negative integer").max(3, "Max retries must be at most 3").optional(),
    defaultHeaders: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional(),
    defaultQuery: zod_1.z.record(zod_1.z.string(), zod_1.z.union([zod_1.z.string(), zod_1.z.number(), zod_1.z.boolean()])).optional()
  }).strict();
  exports.PeerMetadataSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown());
  exports.PeerConfigSchema = zod_1.z.object({
    observeMe: zod_1.z.boolean().nullable().optional()
  }).strict();
  exports.PeerIdSchema = zod_1.z.string().min(1, "Peer ID must be a non-empty string").regex(/^[a-zA-Z0-9_-]+$/, "Peer ID may only contain letters, numbers, underscores, and hyphens").max(100, "Peer ID can be at most 100 characters");
  var PeerIdObjectSchema = zod_1.z.object({ id: exports.PeerIdSchema });
  exports.SessionMetadataSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown());
  exports.ReasoningConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().nullable().optional(),
    customInstructions: zod_1.z.string().nullable().optional()
  }).strict();
  exports.PeerCardConfigSchema = zod_1.z.object({
    use: zod_1.z.boolean().nullable().optional(),
    create: zod_1.z.boolean().nullable().optional()
  }).strict();
  exports.SummaryConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().nullable().optional(),
    messagesPerShortSummary: zod_1.z.number().int().min(10).nullable().optional(),
    messagesPerLongSummary: zod_1.z.number().int().min(20).nullable().optional()
  }).strict();
  exports.DreamConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().nullable().optional()
  }).strict();
  exports.SessionConfigSchema = zod_1.z.object({
    reasoning: exports.ReasoningConfigSchema.nullable().optional(),
    peerCard: exports.PeerCardConfigSchema.nullable().optional(),
    summary: exports.SummaryConfigSchema.nullable().optional(),
    dream: exports.DreamConfigSchema.nullable().optional()
  }).strict();
  exports.SessionIdSchema = zod_1.z.string().min(1, "Session ID must be a non-empty string").regex(/^[a-zA-Z0-9_-]+$/, "Session ID may only contain letters, numbers, underscores, and hyphens").max(100, "Session ID can be at most 100 characters");
  var SessionIdObjectSchema = zod_1.z.object({ id: exports.SessionIdSchema });
  exports.SessionPeerConfigSchema = zod_1.z.object({
    observeMe: zod_1.z.boolean().nullable().optional(),
    observeOthers: zod_1.z.boolean().nullable().optional()
  }).strict();
  exports.MessageContentSchema = zod_1.z.string().refine((content) => content === "" || content.trim().length > 0, "Message content cannot be only whitespace");
  exports.MessageMetadataSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional();
  exports.MessageConfigurationSchema = zod_1.z.object({
    reasoning: exports.ReasoningConfigSchema.nullable().optional()
  }).strict().nullable().optional();
  exports.MessageInputSchema = zod_1.z.object({
    peerId: exports.PeerIdSchema,
    content: exports.MessageContentSchema,
    metadata: exports.MessageMetadataSchema,
    configuration: exports.MessageConfigurationSchema,
    createdAt: zod_1.z.string().nullable().optional()
  }).strict();
  exports.SearchQuerySchema = zod_1.z.string().min(1, "Search query must be a non-empty string").refine((query) => query.trim().length > 0, "Search query cannot be only whitespace");
  exports.SearchQueryObjectSchema = zod_1.z.object({
    content: exports.SearchQuerySchema
  }).passthrough();
  exports.SearchQueryLikeSchema = zod_1.z.union([
    exports.SearchQuerySchema,
    exports.SearchQueryObjectSchema
  ]);
  function normalizeSearchQuery(searchQuery) {
    if (searchQuery === undefined) {
      return;
    }
    const validatedSearchQuery = exports.SearchQueryLikeSchema.parse(searchQuery);
    return typeof validatedSearchQuery === "string" ? validatedSearchQuery : validatedSearchQuery.content;
  }
  exports.FilterSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional();
  function normalizeListOptions(input, optionKeys) {
    if (input === undefined) {
      return {};
    }
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return { filters: input };
    }
    const paginationKeys = optionKeys.filter((k) => k !== "filters");
    const hasFiltersKey = "filters" in input;
    const hasPaginationKey = paginationKeys.some((key) => (key in input));
    if (hasFiltersKey || hasPaginationKey) {
      return input;
    }
    return { filters: input };
  }
  exports.ChatQuerySchema = zod_1.z.object({
    query: exports.SearchQuerySchema,
    target: zod_1.z.union([exports.PeerIdSchema, PeerIdObjectSchema]).optional().transform((val) => val ? typeof val === "string" ? val : val.id : undefined),
    session: zod_1.z.union([exports.SessionIdSchema, SessionIdObjectSchema]).optional().transform((val) => val ? typeof val === "string" ? val : val.id : undefined),
    reasoningLevel: zod_1.z.enum(["minimal", "low", "medium", "high", "max"]).optional()
  }).strict();
  exports.RepresentationOptionsSchema = zod_1.z.object({
    searchQuery: exports.SearchQueryLikeSchema.optional(),
    searchTopK: zod_1.z.number().int().min(1, "searchTopK must be at least 1").max(100, "searchTopK must be at most 100").optional(),
    searchMaxDistance: zod_1.z.number().min(0, "searchMaxDistance must be at least 0.0").max(1, "searchMaxDistance must be at most 1.0").optional(),
    includeMostFrequent: zod_1.z.boolean().optional(),
    maxConclusions: zod_1.z.number().int().min(1, "maxConclusions must be at least 1").max(100, "maxConclusions must be at most 100").optional()
  }).strict();
  exports.ContextParamsSchema = zod_1.z.object({
    summary: zod_1.z.boolean().optional(),
    tokens: zod_1.z.int("Token limit must be an integer").optional(),
    peerTarget: exports.PeerIdSchema.optional(),
    peerPerspective: exports.PeerIdSchema.optional(),
    limitToSession: zod_1.z.boolean().optional(),
    representationOptions: exports.RepresentationOptionsSchema.optional()
  }).strict().superRefine((data, ctx) => {
    if (data.representationOptions?.searchQuery && !data.peerTarget) {
      ctx.addIssue({
        code: zod_1.z.ZodIssueCode.custom,
        message: "peerTarget is required when searchQuery is provided",
        path: ["representationOptions", "searchQuery"]
      });
    }
    if (data.peerPerspective && !data.peerTarget) {
      ctx.addIssue({
        code: zod_1.z.ZodIssueCode.custom,
        message: "peerTarget is required when peerPerspective is provided",
        path: ["peerPerspective"]
      });
    }
  });
  exports.QueueStatusOptionsSchema = zod_1.z.object({
    observer: zod_1.z.union([exports.PeerIdSchema, PeerIdObjectSchema]).optional(),
    sender: zod_1.z.union([exports.PeerIdSchema, PeerIdObjectSchema]).optional(),
    session: zod_1.z.union([exports.SessionIdSchema, SessionIdObjectSchema]).optional(),
    timeout: zod_1.z.number().positive("Timeout must be a positive number").optional()
  }).strict();
  exports.FileUploadSchema = zod_1.z.object({
    file: zod_1.z.union([
      zod_1.z.instanceof(Blob),
      zod_1.z.object({
        filename: zod_1.z.string().min(1, "Filename must be a non-empty string"),
        content: zod_1.z.instanceof(Uint8Array),
        content_type: zod_1.z.string().min(1, "Content type must be a non-empty string")
      }).strict()
    ]),
    peer: zod_1.z.union([exports.PeerIdSchema, PeerIdObjectSchema]),
    metadata: exports.MessageMetadataSchema,
    configuration: exports.MessageConfigurationSchema,
    createdAt: zod_1.z.string().nullable().optional()
  }).strict();
  exports.GetRepresentationParamsSchema = zod_1.z.object({
    peer: zod_1.z.union([exports.PeerIdSchema, PeerIdObjectSchema]),
    target: zod_1.z.union([exports.PeerIdSchema, PeerIdObjectSchema]).optional(),
    options: exports.RepresentationOptionsSchema.optional()
  }).strict();
  exports.PeerGetRepresentationParamsSchema = zod_1.z.object({
    session: zod_1.z.union([exports.SessionIdSchema, SessionIdObjectSchema]).optional(),
    target: zod_1.z.union([exports.PeerIdSchema, PeerIdObjectSchema]).optional(),
    options: exports.RepresentationOptionsSchema.optional()
  }).strict();
  exports.CardTargetSchema = zod_1.z.union([exports.PeerIdSchema, PeerIdObjectSchema]).optional().transform((val) => val ? typeof val === "string" ? val : val.id : undefined);
  exports.PeerCardContentSchema = zod_1.z.array(zod_1.z.string());
  exports.PeerAdditionSchema = zod_1.z.union([
    exports.PeerIdSchema,
    PeerIdObjectSchema,
    zod_1.z.array(zod_1.z.union([
      exports.PeerIdSchema,
      PeerIdObjectSchema,
      zod_1.z.tuple([
        zod_1.z.union([exports.PeerIdSchema, PeerIdObjectSchema]),
        exports.SessionPeerConfigSchema
      ])
    ])),
    zod_1.z.tuple([
      zod_1.z.union([exports.PeerIdSchema, PeerIdObjectSchema]),
      exports.SessionPeerConfigSchema
    ])
  ]);
  function peerConfigToApi(config) {
    if (!config)
      return;
    return {
      observe_me: config.observeMe
    };
  }
  function peerConfigFromApi(config) {
    if (!config)
      return;
    const apiConfig = config;
    return {
      observeMe: apiConfig.observe_me
    };
  }
  function reasoningConfigToApi(config) {
    if (config === null)
      return null;
    if (config === undefined)
      return;
    return {
      enabled: config.enabled,
      custom_instructions: config.customInstructions
    };
  }
  function reasoningConfigFromApi(config) {
    if (config === null)
      return null;
    if (config === undefined)
      return;
    return {
      enabled: config.enabled,
      customInstructions: config.custom_instructions
    };
  }
  function peerCardConfigToApi(config) {
    if (config === null)
      return null;
    if (config === undefined)
      return;
    return {
      use: config.use,
      create: config.create
    };
  }
  function peerCardConfigFromApi(config) {
    if (config === null)
      return null;
    if (config === undefined)
      return;
    return {
      use: config.use,
      create: config.create
    };
  }
  function summaryConfigToApi(config) {
    if (config === null)
      return null;
    if (config === undefined)
      return;
    return {
      enabled: config.enabled,
      messages_per_short_summary: config.messagesPerShortSummary,
      messages_per_long_summary: config.messagesPerLongSummary
    };
  }
  function summaryConfigFromApi(config) {
    if (config === null)
      return null;
    if (config === undefined)
      return;
    return {
      enabled: config.enabled,
      messagesPerShortSummary: config.messages_per_short_summary,
      messagesPerLongSummary: config.messages_per_long_summary
    };
  }
  function dreamConfigToApi(config) {
    if (config === null)
      return null;
    if (config === undefined)
      return;
    return {
      enabled: config.enabled
    };
  }
  function dreamConfigFromApi(config) {
    if (config === null)
      return null;
    if (config === undefined)
      return;
    return {
      enabled: config.enabled
    };
  }
  function workspaceConfigToApi(config) {
    if (!config)
      return;
    return {
      reasoning: reasoningConfigToApi(config.reasoning),
      peer_card: peerCardConfigToApi(config.peerCard),
      summary: summaryConfigToApi(config.summary),
      dream: dreamConfigToApi(config.dream)
    };
  }
  function workspaceConfigFromApi(config) {
    if (!config)
      return;
    const apiConfig = config;
    return {
      reasoning: reasoningConfigFromApi(apiConfig.reasoning),
      peerCard: peerCardConfigFromApi(apiConfig.peer_card),
      summary: summaryConfigFromApi(apiConfig.summary),
      dream: dreamConfigFromApi(apiConfig.dream)
    };
  }
  function sessionConfigToApi(config) {
    if (!config)
      return;
    return {
      reasoning: reasoningConfigToApi(config.reasoning),
      peer_card: peerCardConfigToApi(config.peerCard),
      summary: summaryConfigToApi(config.summary),
      dream: dreamConfigToApi(config.dream)
    };
  }
  function sessionConfigFromApi(config) {
    if (!config)
      return;
    const apiConfig = config;
    return {
      reasoning: reasoningConfigFromApi(apiConfig.reasoning),
      peerCard: peerCardConfigFromApi(apiConfig.peer_card),
      summary: summaryConfigFromApi(apiConfig.summary),
      dream: dreamConfigFromApi(apiConfig.dream)
    };
  }
  function messageConfigToApi(config) {
    if (!config)
      return;
    return {
      reasoning: reasoningConfigToApi(config.reasoning)
    };
  }
  function messageConfigFromApi(config) {
    if (!config)
      return;
    const apiConfig = config;
    return {
      reasoning: reasoningConfigFromApi(apiConfig.reasoning)
    };
  }
  function isSessionPeerConfig(val) {
    return typeof val === "object" && val !== null && !("id" in val) && (("observeMe" in val) || ("observeOthers" in val));
  }
  function isTuple(input) {
    return Array.isArray(input) && input.length === 2 && isSessionPeerConfig(input[1]);
  }
  exports.PeerAdditionToApiSchema = exports.PeerAdditionSchema.transform((input) => {
    const result = {};
    const processEntry = (entry) => {
      if (typeof entry === "string") {
        result[entry] = {};
      } else if (isTuple(entry)) {
        const [peer, config] = entry;
        const id = typeof peer === "string" ? peer : peer.id;
        result[id] = {
          observe_me: config.observeMe,
          observe_others: config.observeOthers
        };
      } else if (typeof entry === "object" && entry !== null && "id" in entry) {
        result[entry.id] = {};
      }
    };
    if (isTuple(input)) {
      processEntry(input);
    } else if (Array.isArray(input)) {
      for (const item of input) {
        processEntry(item);
      }
    } else {
      processEntry(input);
    }
    return result;
  });
  exports.PeerRemovalSchema = zod_1.z.union([
    exports.PeerIdSchema,
    PeerIdObjectSchema,
    zod_1.z.array(zod_1.z.union([exports.PeerIdSchema, PeerIdObjectSchema]))
  ]);
  exports.MessageAdditionSchema = zod_1.z.union([
    exports.MessageInputSchema,
    zod_1.z.array(exports.MessageInputSchema)
  ]);
  exports.MessageAdditionToApiSchema = exports.MessageAdditionSchema.transform((input) => {
    const messages = Array.isArray(input) ? input : [input];
    return messages.map((msg) => ({
      peer_id: msg.peerId,
      content: msg.content,
      metadata: msg.metadata,
      configuration: messageConfigToApi(msg.configuration ?? undefined),
      created_at: msg.createdAt
    }));
  });
  exports.WorkspaceMetadataSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown());
  exports.WorkspaceConfigSchema = zod_1.z.object({
    reasoning: exports.ReasoningConfigSchema.nullable().optional(),
    peerCard: exports.PeerCardConfigSchema.nullable().optional(),
    summary: exports.SummaryConfigSchema.nullable().optional(),
    dream: exports.DreamConfigSchema.nullable().optional()
  }).strict();
  exports.LimitSchema = zod_1.z.number().int().min(1, "Limit must be a positive integer").max(100, "Limit must be less than or equal to 100");
  exports.ConclusionQueryParamsSchema = zod_1.z.object({
    query: exports.SearchQuerySchema,
    top_k: zod_1.z.number().int().min(1, "top_k must be at least 1").max(100, "top_k must be at most 100").optional(),
    distance: zod_1.z.number().min(0, "distance must be at least 0.0").max(1, "distance must be at most 1.0").optional(),
    filters: exports.FilterSchema
  }).strict();
});

// node_modules/@honcho-ai/sdk/dist/conclusions.js
var require_conclusions = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.ConclusionScope = exports.Conclusion = undefined;
  var api_version_1 = require_api_version();
  var pagination_1 = require_pagination();
  var validation_1 = require_validation();

  class Conclusion {
    constructor(id, content, observerId, observedId, sessionId, createdAt) {
      this.id = id;
      this.content = content;
      this.observerId = observerId;
      this.observedId = observedId;
      this.sessionId = sessionId;
      this.createdAt = createdAt;
    }
    static fromApiResponse(data) {
      return new Conclusion(data.id, data.content, data.observer_id, data.observed_id, data.session_id, data.created_at);
    }
    toString() {
      const truncatedContent = this.content.length > 50 ? `${this.content.slice(0, 50)}...` : this.content;
      return `Conclusion(id='${this.id}', content='${truncatedContent}')`;
    }
  }
  exports.Conclusion = Conclusion;

  class ConclusionScope {
    constructor(http, workspaceId, observer, observed, ensureWorkspace = async () => {
      return;
    }) {
      this._http = http;
      this.workspaceId = workspaceId;
      this.observer = observer;
      this.observed = observed;
      this._ensureWorkspace = ensureWorkspace;
    }
    async _list(params) {
      await this._ensureWorkspace();
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/conclusions/list`, {
        body: { filters: params.filters },
        query: {
          page: params.page,
          size: params.size,
          reverse: params.reverse ? "true" : undefined
        }
      });
    }
    async _query(params) {
      await this._ensureWorkspace();
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/conclusions/query`, { body: params });
    }
    async _create(params) {
      await this._ensureWorkspace();
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/conclusions`, { body: params });
    }
    async _delete(conclusionId) {
      await this._ensureWorkspace();
      await this._http.delete(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/conclusions/${conclusionId}`);
    }
    async _getRepresentation(peerId, params) {
      await this._ensureWorkspace();
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/peers/${peerId}/representation`, { body: params });
    }
    async list(options) {
      const resolvedSessionId = options?.session ? typeof options.session === "string" ? options.session : options.session.id : undefined;
      const filters = {
        observer_id: this.observer,
        observed_id: this.observed
      };
      if (resolvedSessionId) {
        filters.session_id = resolvedSessionId;
      }
      const reverse = options?.reverse;
      const response = await this._list({
        filters,
        page: options?.page ?? 1,
        size: options?.size ?? 50,
        reverse
      });
      const fetchNextPage = async (page, size) => {
        return this._list({ filters, page, size, reverse });
      };
      return new pagination_1.Page(response, (item) => Conclusion.fromApiResponse(item), fetchNextPage);
    }
    async query(query, topK = 10, distance) {
      const filters = {
        observer_id: this.observer,
        observed_id: this.observed
      };
      const response = await this._query({
        query,
        top_k: topK,
        distance,
        filters
      });
      return (response ?? []).map((item) => Conclusion.fromApiResponse(item));
    }
    async delete(conclusionId) {
      await this._delete(conclusionId);
    }
    async create(conclusions) {
      const conclusionArray = Array.isArray(conclusions) ? conclusions : [conclusions];
      const requestConclusions = conclusionArray.map((obs) => ({
        content: obs.content,
        session_id: obs.sessionId === undefined ? null : typeof obs.sessionId === "string" ? obs.sessionId : obs.sessionId.id,
        observer_id: this.observer,
        observed_id: this.observed
      }));
      const response = await this._create({ conclusions: requestConclusions });
      return (response ?? []).map((item) => Conclusion.fromApiResponse(item));
    }
    async representation(options) {
      const searchQuery = (0, validation_1.normalizeSearchQuery)(options?.searchQuery);
      const validatedOptions = validation_1.RepresentationOptionsSchema.parse({
        searchQuery,
        searchTopK: options?.searchTopK,
        searchMaxDistance: options?.searchMaxDistance,
        includeMostFrequent: options?.includeMostFrequent,
        maxConclusions: options?.maxConclusions
      });
      const response = await this._getRepresentation(this.observer, {
        target: this.observed,
        search_query: searchQuery,
        search_top_k: validatedOptions.searchTopK,
        search_max_distance: validatedOptions.searchMaxDistance,
        include_most_frequent: validatedOptions.includeMostFrequent,
        max_conclusions: validatedOptions.maxConclusions
      });
      return response.representation;
    }
    toString() {
      return `ConclusionScope(workspaceId='${this.workspaceId}', observer='${this.observer}', observed='${this.observed}')`;
    }
  }
  exports.ConclusionScope = ConclusionScope;
});

// node_modules/@honcho-ai/sdk/dist/http/streaming.js
var require_streaming = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.DialecticStreamResponse = undefined;
  exports.parseSSE = parseSSE;
  exports.createDialecticStream = createDialecticStream;
  async function* parseSSE(response) {
    if (!response.body) {
      throw new Error("Response body is null");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder;
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done)
          break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(`
`);
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            if (jsonStr.trim() === "[DONE]") {
              return;
            }
            try {
              const data = JSON.parse(jsonStr);
              yield data;
            } catch {}
          }
        }
      }
      if (buffer.startsWith("data: ")) {
        const jsonStr = buffer.slice(6);
        if (jsonStr.trim() !== "[DONE]") {
          try {
            const data = JSON.parse(jsonStr);
            yield data;
          } catch {}
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  class DialecticStreamResponse {
    constructor(generator) {
      this.chunks = [];
      this.consumed = false;
      this.generator = generator;
    }
    async* [Symbol.asyncIterator]() {
      if (this.consumed) {
        for (const chunk of this.chunks) {
          yield chunk;
        }
        return;
      }
      for await (const chunk of this.generator) {
        this.chunks.push(chunk);
        yield chunk;
      }
      this.consumed = true;
    }
    async getFinalResponse() {
      if (!this.consumed) {
        for await (const _ of this) {}
      }
      return this.chunks.join("");
    }
    async toArray() {
      if (!this.consumed) {
        for await (const _ of this) {}
      }
      return [...this.chunks];
    }
  }
  exports.DialecticStreamResponse = DialecticStreamResponse;
  function createDialecticStream(response) {
    async function* streamContent() {
      for await (const chunk of parseSSE(response)) {
        if (chunk.done) {
          return;
        }
        const content = chunk.delta?.content;
        if (content) {
          yield content;
        }
      }
    }
    return new DialecticStreamResponse(streamContent());
  }
});

// node_modules/@honcho-ai/sdk/dist/session_context.js
var require_session_context = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.SessionContext = exports.SessionSummaries = exports.Summary = undefined;
  var message_1 = require_message();

  class Summary {
    constructor(data) {
      this.content = data.content;
      this.messageId = data.messageId;
      this.summaryType = data.summaryType;
      this.createdAt = data.createdAt;
      this.tokenCount = data.tokenCount;
    }
    static fromApiResponse(data) {
      return new Summary({
        content: data.content,
        messageId: data.message_id,
        summaryType: data.summary_type,
        createdAt: data.created_at,
        tokenCount: data.token_count
      });
    }
  }
  exports.Summary = Summary;

  class SessionSummaries {
    get sessionId() {
      return this.id;
    }
    constructor(id, shortSummary, longSummary) {
      this.id = id;
      this.shortSummary = shortSummary;
      this.longSummary = longSummary;
    }
    static fromApiResponse(data) {
      return new SessionSummaries(data.id, data.short_summary ? Summary.fromApiResponse(data.short_summary) : null, data.long_summary ? Summary.fromApiResponse(data.long_summary) : null);
    }
  }
  exports.SessionSummaries = SessionSummaries;

  class SessionContext {
    constructor(sessionId, messages, summary = null, peerRepresentation = null, peerCard = null) {
      this.sessionId = sessionId;
      this.messages = messages;
      this.summary = summary;
      this.peerRepresentation = peerRepresentation;
      this.peerCard = peerCard;
    }
    toOpenAI(assistant) {
      const assistantId = typeof assistant === "string" ? assistant : assistant.id;
      const messages = this.messages.map((message) => ({
        role: message.peerId === assistantId ? "assistant" : "user",
        name: message.peerId,
        content: message.content
      }));
      const systemMessages = [];
      if (this.peerRepresentation) {
        systemMessages.push({
          role: "system",
          content: `<peer_representation>${this.peerRepresentation}</peer_representation>`
        });
      }
      if (this.peerCard) {
        systemMessages.push({
          role: "system",
          content: `<peer_card>${this.peerCard}</peer_card>`
        });
      }
      if (this.summary) {
        systemMessages.push({
          role: "system",
          content: `<summary>${this.summary.content}</summary>`
        });
      }
      return [...systemMessages, ...messages];
    }
    toAnthropic(assistant) {
      const assistantId = typeof assistant === "string" ? assistant : assistant.id;
      const messages = this.messages.map((message) => message.peerId === assistantId ? {
        role: "assistant",
        content: message.content
      } : {
        role: "user",
        content: `${message.peerId}: ${message.content}`
      });
      const systemMessages = [];
      if (this.peerRepresentation) {
        systemMessages.push({
          role: "user",
          content: `<peer_representation>${this.peerRepresentation}</peer_representation>`
        });
      }
      if (this.peerCard) {
        systemMessages.push({
          role: "user",
          content: `<peer_card>${this.peerCard}</peer_card>`
        });
      }
      if (this.summary) {
        systemMessages.push({
          role: "user",
          content: `<summary>${this.summary.content}</summary>`
        });
      }
      return [...systemMessages, ...messages];
    }
    get length() {
      return this.messages.length + (this.summary ? 1 : 0);
    }
    static fromApiResponse(sessionId, data) {
      return new SessionContext(sessionId, data.messages.map(message_1.Message.fromApiResponse), data.summary ? Summary.fromApiResponse(data.summary) : null, data.peer_representation ?? null, data.peer_card ?? null);
    }
    toString() {
      return `SessionContext(messages=${this.messages.length}, summary=${this.summary ? "present" : "none"})`;
    }
  }
  exports.SessionContext = SessionContext;
});

// node_modules/@honcho-ai/sdk/dist/peer.js
var require_peer = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.Peer = exports.PeerContext = undefined;
  var api_version_1 = require_api_version();
  var conclusions_1 = require_conclusions();
  var streaming_1 = require_streaming();
  var message_1 = require_message();
  var pagination_1 = require_pagination();
  var session_1 = require_session();
  var validation_1 = require_validation();

  class PeerContext {
    constructor(peerId, targetId, representation, peerCard) {
      this.peerId = peerId;
      this.targetId = targetId;
      this.representation = representation;
      this.peerCard = peerCard;
    }
    static fromApiResponse(response) {
      return new PeerContext(response.peer_id, response.target_id, response.representation, response.peer_card);
    }
    toString() {
      return `PeerContext(peerId='${this.peerId}', targetId='${this.targetId}')`;
    }
  }
  exports.PeerContext = PeerContext;

  class Peer {
    get metadata() {
      return this._metadata;
    }
    get configuration() {
      return this._configuration;
    }
    get createdAt() {
      return this._createdAt;
    }
    constructor(id, workspaceId, http, metadata, configuration, ensureWorkspace = async () => {
      return;
    }, createdAt) {
      this.id = id;
      this.workspaceId = workspaceId;
      this._http = http;
      this._metadata = metadata;
      this._configuration = configuration;
      this._ensureWorkspace = ensureWorkspace;
      this._createdAt = createdAt;
    }
    async _getOrCreate(params) {
      await this._ensureWorkspace();
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/peers`, { body: params });
    }
    async _update(params) {
      await this._ensureWorkspace();
      return this._http.put(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/peers/${this.id}`, { body: params });
    }
    async _listSessions(params) {
      await this._ensureWorkspace();
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/peers/${this.id}/sessions`, {
        body: { filters: params?.filters },
        query: {
          page: params?.page,
          size: params?.size,
          reverse: params?.reverse ? "true" : undefined
        }
      });
    }
    async _chat(params) {
      await this._ensureWorkspace();
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/peers/${this.id}/chat`, { body: params });
    }
    async _chatStream(params) {
      await this._ensureWorkspace();
      return this._http.stream("POST", `/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/peers/${this.id}/chat`, {
        body: {
          ...params,
          stream: true
        }
      });
    }
    async _search(params) {
      await this._ensureWorkspace();
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/peers/${this.id}/search`, { body: params });
    }
    async _getRepresentation(params) {
      await this._ensureWorkspace();
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/peers/${this.id}/representation`, { body: params });
    }
    async _getContext(params) {
      await this._ensureWorkspace();
      return this._http.get(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/peers/${this.id}/context`, { query: params });
    }
    async _getCard(params) {
      await this._ensureWorkspace();
      return this._http.get(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/peers/${this.id}/card`, { query: params });
    }
    async _setCard(params) {
      await this._ensureWorkspace();
      const { peer_card, ...query } = params;
      return this._http.put(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/peers/${this.id}/card`, { body: { peer_card }, query });
    }
    async chat(query, options) {
      const targetId = options?.target ? typeof options.target === "string" ? options.target : options.target.id : undefined;
      const resolvedSessionId = options?.session ? typeof options.session === "string" ? options.session : options.session.id : undefined;
      const chatParams = validation_1.ChatQuerySchema.parse({
        query,
        target: targetId,
        session: resolvedSessionId,
        reasoningLevel: options?.reasoningLevel
      });
      const response = await this._chat({
        query: chatParams.query,
        stream: false,
        target: chatParams.target,
        session_id: chatParams.session,
        reasoning_level: chatParams.reasoningLevel
      });
      if (!response.content) {
        return null;
      }
      return response.content;
    }
    async chatStream(query, options) {
      const targetId = options?.target ? typeof options.target === "string" ? options.target : options.target.id : undefined;
      const resolvedSessionId = options?.session ? typeof options.session === "string" ? options.session : options.session.id : undefined;
      const chatParams = validation_1.ChatQuerySchema.parse({
        query,
        target: targetId,
        session: resolvedSessionId,
        reasoningLevel: options?.reasoningLevel
      });
      const response = await this._chatStream({
        query: chatParams.query,
        target: chatParams.target,
        session_id: chatParams.session,
        reasoning_level: chatParams.reasoningLevel
      });
      return (0, streaming_1.createDialecticStream)(response);
    }
    async sessions(options) {
      const normalizedOptions = (0, validation_1.normalizeListOptions)(options, [
        "filters",
        "page",
        "size",
        "reverse"
      ]);
      const validatedFilter = normalizedOptions.filters ? validation_1.FilterSchema.parse(normalizedOptions.filters) : undefined;
      const reverse = normalizedOptions.reverse;
      const sessionsPage = await this._listSessions({
        filters: validatedFilter,
        page: normalizedOptions.page,
        size: normalizedOptions.size,
        reverse
      });
      const fetchNextPage = async (page, size) => {
        return this._listSessions({
          filters: validatedFilter,
          page,
          size,
          reverse
        });
      };
      return new pagination_1.Page(sessionsPage, (session) => new session_1.Session(session.id, this.workspaceId, this._http, session.metadata ?? undefined, (0, validation_1.sessionConfigFromApi)(session.configuration) ?? undefined, () => this._ensureWorkspace(), session.created_at, session.is_active), fetchNextPage);
    }
    message(content, options) {
      const validatedContent = validation_1.MessageContentSchema.parse(content);
      const validatedMetadata = options?.metadata ? validation_1.MessageMetadataSchema.parse(options.metadata) : undefined;
      const validatedConfiguration = options?.configuration ? validation_1.MessageConfigurationSchema.parse(options.configuration) : undefined;
      const createdAt = options?.createdAt instanceof Date ? options.createdAt.toISOString() : options?.createdAt;
      return {
        peerId: this.id,
        content: validatedContent,
        metadata: validatedMetadata,
        configuration: validatedConfiguration,
        createdAt
      };
    }
    async getMetadata() {
      const peer = await this._getOrCreate({ id: this.id });
      this._metadata = peer.metadata || {};
      this._createdAt = peer.created_at;
      return this._metadata;
    }
    async setMetadata(metadata) {
      const validatedMetadata = validation_1.PeerMetadataSchema.parse(metadata);
      await this._update({ metadata: validatedMetadata });
      this._metadata = validatedMetadata;
    }
    async getConfiguration() {
      const peer = await this._getOrCreate({ id: this.id });
      this._configuration = (0, validation_1.peerConfigFromApi)(peer.configuration) || {};
      this._createdAt = peer.created_at;
      return this._configuration;
    }
    async setConfiguration(configuration) {
      const validatedConfig = validation_1.PeerConfigSchema.parse(configuration);
      await this._update({ configuration: (0, validation_1.peerConfigToApi)(validatedConfig) });
      this._configuration = validatedConfig;
    }
    async refresh() {
      const peer = await this._getOrCreate({ id: this.id });
      this._metadata = peer.metadata || {};
      this._configuration = (0, validation_1.peerConfigFromApi)(peer.configuration) || {};
      this._createdAt = peer.created_at;
    }
    async search(query, options) {
      const validatedQuery = validation_1.SearchQuerySchema.parse(query);
      const validatedFilters = options?.filters ? validation_1.FilterSchema.parse(options.filters) : undefined;
      const validatedLimit = options?.limit ? validation_1.LimitSchema.parse(options.limit) : undefined;
      const response = await this._search({
        query: validatedQuery,
        filters: validatedFilters,
        limit: validatedLimit
      });
      return response.map(message_1.Message.fromApiResponse);
    }
    async getCard(target) {
      const validatedTarget = validation_1.CardTargetSchema.parse(target);
      const response = await this._getCard({
        target: validatedTarget
      });
      return response.peer_card;
    }
    async card(target) {
      return this.getCard(target);
    }
    async setCard(peerCard, target) {
      const validatedPeerCard = validation_1.PeerCardContentSchema.parse(peerCard);
      const validatedTarget = validation_1.CardTargetSchema.parse(target);
      const response = await this._setCard({
        peer_card: validatedPeerCard,
        target: validatedTarget
      });
      return response.peer_card;
    }
    async representation(options) {
      const searchQuery = (0, validation_1.normalizeSearchQuery)(options?.searchQuery);
      const getRepresentationParams = validation_1.PeerGetRepresentationParamsSchema.parse({
        session: options?.session,
        target: options?.target,
        options: {
          searchQuery,
          searchTopK: options?.searchTopK,
          searchMaxDistance: options?.searchMaxDistance,
          includeMostFrequent: options?.includeMostFrequent,
          maxConclusions: options?.maxConclusions
        }
      });
      const sessionId = getRepresentationParams.session ? typeof getRepresentationParams.session === "string" ? getRepresentationParams.session : getRepresentationParams.session.id : undefined;
      const targetId = getRepresentationParams.target ? typeof getRepresentationParams.target === "string" ? getRepresentationParams.target : getRepresentationParams.target.id : undefined;
      const response = await this._getRepresentation({
        session_id: sessionId,
        target: targetId,
        search_query: searchQuery,
        search_top_k: getRepresentationParams.options?.searchTopK,
        search_max_distance: getRepresentationParams.options?.searchMaxDistance,
        include_most_frequent: getRepresentationParams.options?.includeMostFrequent,
        max_conclusions: getRepresentationParams.options?.maxConclusions
      });
      return response.representation;
    }
    async context(options) {
      const targetId = options?.target ? typeof options.target === "string" ? options.target : options.target.id : undefined;
      const searchQuery = options?.searchQuery === undefined ? undefined : validation_1.SearchQuerySchema.parse(options.searchQuery);
      const validatedOptions = validation_1.RepresentationOptionsSchema.parse({
        searchQuery,
        searchTopK: options?.searchTopK,
        searchMaxDistance: options?.searchMaxDistance,
        includeMostFrequent: options?.includeMostFrequent,
        maxConclusions: options?.maxConclusions
      });
      const response = await this._getContext({
        target: targetId,
        search_query: searchQuery,
        search_top_k: validatedOptions.searchTopK,
        search_max_distance: validatedOptions.searchMaxDistance,
        include_most_frequent: validatedOptions.includeMostFrequent,
        max_conclusions: validatedOptions.maxConclusions
      });
      return PeerContext.fromApiResponse(response);
    }
    get conclusions() {
      return new conclusions_1.ConclusionScope(this._http, this.workspaceId, this.id, this.id, () => this._ensureWorkspace());
    }
    conclusionsOf(target) {
      const targetId = typeof target === "string" ? target : target.id;
      return new conclusions_1.ConclusionScope(this._http, this.workspaceId, this.id, targetId, () => this._ensureWorkspace());
    }
    toString() {
      return `Peer(id='${this.id}')`;
    }
  }
  exports.Peer = Peer;
});

// node_modules/@honcho-ai/sdk/dist/utils.js
var require_utils = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.resolveId = resolveId;
  exports.transformQueueStatus = transformQueueStatus;
  function resolveId(obj) {
    return typeof obj === "string" ? obj : obj.id;
  }
  function transformSessionQueueStatus(status) {
    return {
      sessionId: status.session_id,
      totalWorkUnits: status.total_work_units,
      completedWorkUnits: status.completed_work_units,
      inProgressWorkUnits: status.in_progress_work_units,
      pendingWorkUnits: status.pending_work_units
    };
  }
  function transformQueueStatus(status) {
    const sessions = status.sessions ? Object.fromEntries(Object.entries(status.sessions).map(([key, value]) => [
      key,
      transformSessionQueueStatus(value)
    ])) : undefined;
    return {
      totalWorkUnits: status.total_work_units,
      completedWorkUnits: status.completed_work_units,
      inProgressWorkUnits: status.in_progress_work_units,
      pendingWorkUnits: status.pending_work_units,
      sessions
    };
  }
});

// node_modules/@honcho-ai/sdk/dist/session.js
var require_session = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.Session = undefined;
  var api_version_1 = require_api_version();
  var message_1 = require_message();
  var pagination_1 = require_pagination();
  var peer_1 = require_peer();
  var session_context_1 = require_session_context();
  var utils_1 = require_utils();
  var validation_1 = require_validation();

  class Session {
    get metadata() {
      return this._metadata;
    }
    get configuration() {
      return this._configuration;
    }
    get createdAt() {
      return this._createdAt;
    }
    get isActive() {
      return this._isActive;
    }
    constructor(id, workspaceId, http, metadata, configuration, ensureWorkspace = async () => {
      return;
    }, createdAt, isActive) {
      this.id = id;
      this.workspaceId = workspaceId;
      this._http = http;
      this._metadata = metadata;
      this._configuration = configuration;
      this._ensureWorkspace = ensureWorkspace;
      this._createdAt = createdAt;
      this._isActive = isActive;
    }
    _applySessionResponse(session) {
      this._metadata = session.metadata || {};
      this._configuration = (0, validation_1.sessionConfigFromApi)(session.configuration) || {};
      this._createdAt = session.created_at;
      this._isActive = session.is_active;
    }
    async _getOrCreate(params) {
      await this._ensureWorkspace();
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/sessions`, {
        body: {
          id: params.id,
          metadata: params.metadata,
          configuration: (0, validation_1.sessionConfigToApi)(params.configuration)
        }
      });
    }
    async _update(params) {
      await this._ensureWorkspace();
      return this._http.put(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/sessions/${this.id}`, {
        body: {
          metadata: params.metadata,
          configuration: (0, validation_1.sessionConfigToApi)(params.configuration)
        }
      });
    }
    async _delete() {
      await this._ensureWorkspace();
      return this._http.delete(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/sessions/${this.id}`);
    }
    async _clone(params) {
      await this._ensureWorkspace();
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/sessions/${this.id}/clone`, { query: params });
    }
    async _getContext(params) {
      await this._ensureWorkspace();
      return this._http.get(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/sessions/${this.id}/context`, { query: params });
    }
    async _getSummaries() {
      await this._ensureWorkspace();
      return this._http.get(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/sessions/${this.id}/summaries`);
    }
    async _search(params) {
      await this._ensureWorkspace();
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/sessions/${this.id}/search`, { body: params });
    }
    async _addPeers(peers) {
      await this._ensureWorkspace();
      await this._http.post(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/sessions/${this.id}/peers`, { body: peers });
    }
    async _setPeers(peers) {
      await this._ensureWorkspace();
      await this._http.put(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/sessions/${this.id}/peers`, { body: peers });
    }
    async _removePeers(peerIds) {
      await this._ensureWorkspace();
      await this._http.delete(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/sessions/${this.id}/peers`, { body: peerIds });
    }
    async _listPeers() {
      await this._ensureWorkspace();
      return this._http.get(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/sessions/${this.id}/peers`);
    }
    async _getPeerConfiguration(peerId) {
      await this._ensureWorkspace();
      return this._http.get(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/sessions/${this.id}/peers/${peerId}/config`);
    }
    async _setPeerConfiguration(peerId, config) {
      await this._ensureWorkspace();
      await this._http.put(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/sessions/${this.id}/peers/${peerId}/config`, { body: config });
    }
    async _createMessages(params) {
      await this._ensureWorkspace();
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/sessions/${this.id}/messages`, { body: params });
    }
    async _listMessages(params) {
      await this._ensureWorkspace();
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/sessions/${this.id}/messages/list`, {
        body: { filters: params?.filters },
        query: {
          page: params?.page,
          size: params?.size,
          reverse: params?.reverse ? "true" : undefined
        }
      });
    }
    async _uploadFile(formData) {
      await this._ensureWorkspace();
      return this._http.upload(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/sessions/${this.id}/messages/upload`, formData);
    }
    async _getQueueStatus(params) {
      await this._ensureWorkspace();
      const query = {};
      if (params?.observer_id)
        query.observer_id = params.observer_id;
      if (params?.sender_id)
        query.sender_id = params.sender_id;
      if (params?.session_id)
        query.session_id = params.session_id;
      return this._http.get(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/queue/status`, { query });
    }
    async _getRepresentation(peerId, params) {
      await this._ensureWorkspace();
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/peers/${peerId}/representation`, { body: params });
    }
    async _getMessage(messageId) {
      await this._ensureWorkspace();
      return this._http.get(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/sessions/${this.id}/messages/${messageId}`);
    }
    async _updateMessage(messageId, params) {
      await this._ensureWorkspace();
      return this._http.put(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/sessions/${this.id}/messages/${messageId}`, { body: params });
    }
    async addPeers(peers) {
      const peerDict = validation_1.PeerAdditionToApiSchema.parse(peers);
      await this._addPeers(peerDict);
    }
    async setPeers(peers) {
      const peerDict = validation_1.PeerAdditionToApiSchema.parse(peers);
      await this._setPeers(peerDict);
    }
    async removePeers(peers) {
      const validatedPeers = validation_1.PeerRemovalSchema.parse(peers);
      const peerIds = Array.isArray(validatedPeers) ? validatedPeers.map((p) => typeof p === "string" ? p : p.id) : [
        typeof validatedPeers === "string" ? validatedPeers : validatedPeers.id
      ];
      await this._removePeers(peerIds);
    }
    async peers() {
      const peersPage = await this._listPeers();
      return peersPage.items.map((peer) => new peer_1.Peer(peer.id, this.workspaceId, this._http, peer.metadata ?? undefined, (0, validation_1.peerConfigFromApi)(peer.configuration) ?? undefined, () => this._ensureWorkspace(), peer.created_at));
    }
    async getPeerConfiguration(peer) {
      const peerId = typeof peer === "string" ? peer : peer.id;
      const response = await this._getPeerConfiguration(peerId);
      return {
        observeMe: response.observe_me,
        observeOthers: response.observe_others
      };
    }
    async setPeerConfiguration(peer, configuration) {
      const peerId = typeof peer === "string" ? peer : peer.id;
      const validatedConfig = validation_1.SessionPeerConfigSchema.parse(configuration);
      await this._setPeerConfiguration(peerId, {
        observe_others: validatedConfig.observeOthers,
        observe_me: validatedConfig.observeMe
      });
    }
    async addMessages(messages) {
      const transformedMessages = validation_1.MessageAdditionToApiSchema.parse(messages);
      const apiMessages = transformedMessages.map((msg) => ({
        peer_id: msg.peer_id,
        content: msg.content,
        metadata: msg.metadata,
        configuration: msg.configuration ?? undefined,
        created_at: msg.created_at ?? undefined
      }));
      const response = await this._createMessages({ messages: apiMessages });
      return response.map(message_1.Message.fromApiResponse);
    }
    async messages(options) {
      const normalizedOptions = (0, validation_1.normalizeListOptions)(options, [
        "filters",
        "page",
        "size",
        "reverse"
      ]);
      const validatedFilter = normalizedOptions.filters ? validation_1.FilterSchema.parse(normalizedOptions.filters) : undefined;
      const reverse = normalizedOptions.reverse;
      const messagesPage = await this._listMessages({
        filters: validatedFilter,
        page: normalizedOptions.page,
        size: normalizedOptions.size,
        reverse
      });
      const fetchNextPage = async (page, size) => {
        return this._listMessages({
          filters: validatedFilter,
          page,
          size,
          reverse
        });
      };
      return new pagination_1.Page(messagesPage, message_1.Message.fromApiResponse, fetchNextPage);
    }
    async getMetadata() {
      const session = await this._getOrCreate({ id: this.id });
      this._applySessionResponse(session);
      return this._metadata ?? {};
    }
    async setMetadata(metadata) {
      const validatedMetadata = validation_1.SessionMetadataSchema.parse(metadata);
      await this._update({ metadata: validatedMetadata });
      this._metadata = validatedMetadata;
    }
    async getConfiguration() {
      const session = await this._getOrCreate({ id: this.id });
      this._applySessionResponse(session);
      return this._configuration ?? {};
    }
    async setConfiguration(configuration) {
      const validatedConfig = validation_1.SessionConfigSchema.parse(configuration);
      await this._update({ configuration: validatedConfig });
      this._configuration = validatedConfig;
    }
    async refresh() {
      const session = await this._getOrCreate({ id: this.id });
      this._applySessionResponse(session);
    }
    async delete() {
      await this._delete();
    }
    async clone(messageId) {
      const clonedSessionData = await this._clone(messageId ? { message_id: messageId } : undefined);
      return new Session(clonedSessionData.id, this.workspaceId, this._http, clonedSessionData.metadata ?? undefined, (0, validation_1.sessionConfigFromApi)(clonedSessionData.configuration) ?? undefined, () => this._ensureWorkspace(), clonedSessionData.created_at, clonedSessionData.is_active);
    }
    async context(options) {
      const opts = options || {};
      const peerTargetId = typeof opts.peerTarget === "object" ? opts.peerTarget.id : opts.peerTarget;
      const peerPerspectiveId = typeof opts.peerPerspective === "object" ? opts.peerPerspective.id : opts.peerPerspective;
      const searchQuery = (0, validation_1.normalizeSearchQuery)(opts.representationOptions?.searchQuery);
      const contextParams = validation_1.ContextParamsSchema.parse({
        summary: opts.summary,
        tokens: opts.tokens,
        peerTarget: peerTargetId,
        peerPerspective: peerPerspectiveId,
        limitToSession: opts.limitToSession,
        representationOptions: opts.representationOptions ? {
          ...opts.representationOptions,
          searchQuery
        } : undefined
      });
      const context = await this._getContext({
        tokens: contextParams.tokens,
        summary: contextParams.summary,
        search_query: searchQuery,
        peer_target: contextParams.peerTarget,
        peer_perspective: contextParams.peerPerspective,
        limit_to_session: contextParams.limitToSession,
        search_top_k: contextParams.representationOptions?.searchTopK,
        search_max_distance: contextParams.representationOptions?.searchMaxDistance,
        include_most_frequent: contextParams.representationOptions?.includeMostFrequent,
        max_conclusions: contextParams.representationOptions?.maxConclusions
      });
      return session_context_1.SessionContext.fromApiResponse(this.id, context);
    }
    async summaries() {
      const data = await this._getSummaries();
      return session_context_1.SessionSummaries.fromApiResponse(data);
    }
    async search(query, options) {
      const validatedQuery = validation_1.SearchQuerySchema.parse(query);
      const validatedFilters = options?.filters ? validation_1.FilterSchema.parse(options.filters) : undefined;
      const validatedLimit = options?.limit ? validation_1.LimitSchema.parse(options.limit) : undefined;
      const response = await this._search({
        query: validatedQuery,
        filters: validatedFilters,
        limit: validatedLimit
      });
      return response.map(message_1.Message.fromApiResponse);
    }
    async queueStatus(options) {
      const resolvedObserverId = options?.observer ? typeof options.observer === "string" ? options.observer : options.observer.id : undefined;
      const resolvedSenderId = options?.sender ? typeof options.sender === "string" ? options.sender : options.sender.id : undefined;
      const queryParams = { session_id: this.id };
      if (resolvedObserverId)
        queryParams.observer_id = resolvedObserverId;
      if (resolvedSenderId)
        queryParams.sender_id = resolvedSenderId;
      const status = await this._getQueueStatus(queryParams);
      return (0, utils_1.transformQueueStatus)(status);
    }
    async uploadFile(file, peer, options) {
      const createdAt = options?.createdAt instanceof Date ? options.createdAt.toISOString() : options?.createdAt;
      const resolvedPeerId = typeof peer === "string" ? peer : peer.id;
      const uploadParams = validation_1.FileUploadSchema.parse({
        file,
        peer: resolvedPeerId,
        metadata: options?.metadata,
        configuration: options?.configuration,
        createdAt
      });
      const formData = new FormData;
      const uploadFile = uploadParams.file;
      if (uploadFile instanceof Blob) {
        formData.append("file", uploadFile);
      } else {
        const content = new Uint8Array(uploadFile.content);
        const blob = new Blob([content], { type: uploadFile.content_type });
        formData.append("file", blob, uploadFile.filename);
      }
      formData.append("peer_id", resolvedPeerId);
      if (uploadParams.metadata !== undefined && uploadParams.metadata !== null) {
        formData.append("metadata", JSON.stringify(uploadParams.metadata));
      }
      if (uploadParams.configuration !== undefined && uploadParams.configuration !== null) {
        const apiConfiguration = (0, validation_1.messageConfigToApi)(uploadParams.configuration);
        formData.append("configuration", JSON.stringify(apiConfiguration));
      }
      if (uploadParams.createdAt !== undefined && uploadParams.createdAt !== null) {
        formData.append("created_at", uploadParams.createdAt);
      }
      const response = await this._uploadFile(formData);
      return response.map(message_1.Message.fromApiResponse);
    }
    async representation(peer, options) {
      const searchQuery = (0, validation_1.normalizeSearchQuery)(options?.searchQuery);
      const getRepresentationParams = validation_1.GetRepresentationParamsSchema.parse({
        peer,
        target: options?.target,
        options: {
          searchQuery,
          searchTopK: options?.searchTopK,
          searchMaxDistance: options?.searchMaxDistance,
          includeMostFrequent: options?.includeMostFrequent,
          maxConclusions: options?.maxConclusions
        }
      });
      const peerId = typeof getRepresentationParams.peer === "string" ? getRepresentationParams.peer : getRepresentationParams.peer.id;
      const targetId = getRepresentationParams.target ? typeof getRepresentationParams.target === "string" ? getRepresentationParams.target : getRepresentationParams.target.id : undefined;
      const response = await this._getRepresentation(peerId, {
        session_id: this.id,
        target: targetId,
        search_query: searchQuery,
        search_top_k: getRepresentationParams.options?.searchTopK,
        search_max_distance: getRepresentationParams.options?.searchMaxDistance,
        include_most_frequent: getRepresentationParams.options?.includeMostFrequent,
        max_conclusions: getRepresentationParams.options?.maxConclusions
      });
      return response.representation;
    }
    async getMessage(messageId) {
      const response = await this._getMessage(messageId);
      return message_1.Message.fromApiResponse(response);
    }
    async updateMessage(message, metadata) {
      const validatedMetadata = validation_1.MessageMetadataSchema.parse(metadata);
      const messageId = typeof message === "string" ? message : message.id;
      const response = await this._updateMessage(messageId, {
        metadata: validatedMetadata ?? {}
      });
      return message_1.Message.fromApiResponse(response);
    }
    toString() {
      return `Session(id='${this.id}')`;
    }
  }
  exports.Session = Session;
});

// node_modules/@honcho-ai/sdk/dist/http/client.js
var require_client = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.HonchoHTTPClient = undefined;
  var errors_1 = require_errors();
  var DEFAULT_TIMEOUT = 60000;
  var DEFAULT_MAX_RETRIES = 2;
  var RETRY_STATUS_CODES = [429, 500, 502, 503, 504];
  var INITIAL_RETRY_DELAY = 500;

  class HonchoHTTPClient {
    constructor(config) {
      this.baseURL = config.baseURL.replace(/\/$/, "");
      this.apiKey = config.apiKey;
      this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
      this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
      this.defaultHeaders = {
        "Content-Type": "application/json",
        ...config.defaultHeaders
      };
      this.defaultQuery = config.defaultQuery;
    }
    async request(method, path, options = {}) {
      const url = this.buildURL(path, options.query);
      const headers = this.buildHeaders(options.headers);
      const timeout = options.timeout ?? this.timeout;
      let lastError;
      let attempt = 0;
      while (attempt <= this.maxRetries) {
        try {
          const response = await this.fetchWithTimeout(url, {
            method,
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
            signal: options.signal
          }, timeout);
          if (response.ok) {
            const text = await response.text();
            if (!text) {
              return;
            }
            return JSON.parse(text);
          }
          const errorBody = await this.parseErrorBody(response);
          const retryAfter = this.parseRetryAfter(response);
          const error = (0, errors_1.createErrorFromResponse)(response.status, errorBody.message || `HTTP ${response.status}`, errorBody, retryAfter);
          if (RETRY_STATUS_CODES.includes(response.status) && attempt < this.maxRetries) {
            lastError = error;
            await this.sleep(this.getRetryDelay(attempt, retryAfter));
            attempt++;
            continue;
          }
          throw error;
        } catch (error) {
          if (error instanceof errors_1.TimeoutError || error instanceof errors_1.ConnectionError) {
            if (attempt < this.maxRetries) {
              lastError = error;
              await this.sleep(this.getRetryDelay(attempt));
              attempt++;
              continue;
            }
          }
          if (error instanceof errors_1.RateLimitError || error instanceof errors_1.ServerError || error instanceof errors_1.TimeoutError || error instanceof errors_1.ConnectionError) {
            throw error;
          }
          if (error instanceof TypeError && error.message.includes("fetch")) {
            const connError = new errors_1.ConnectionError(error.message);
            if (attempt < this.maxRetries) {
              lastError = connError;
              await this.sleep(this.getRetryDelay(attempt));
              attempt++;
              continue;
            }
            throw connError;
          }
          throw error;
        }
      }
      throw lastError || new Error("Request failed after retries");
    }
    async get(path, options) {
      return this.request("GET", path, options);
    }
    async post(path, options) {
      return this.request("POST", path, options);
    }
    async put(path, options) {
      return this.request("PUT", path, options);
    }
    async patch(path, options) {
      return this.request("PATCH", path, options);
    }
    async delete(path, options) {
      return this.request("DELETE", path, options);
    }
    async stream(method, path, options = {}) {
      const url = this.buildURL(path, options.query);
      const headers = {
        ...this.buildHeaders(options.headers),
        Accept: "text/event-stream"
      };
      const timeout = options.timeout ?? this.timeout;
      const response = await this.fetchWithTimeout(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: options.signal
      }, timeout);
      if (!response.ok) {
        const errorBody = await this.parseErrorBody(response);
        throw (0, errors_1.createErrorFromResponse)(response.status, errorBody.message || `HTTP ${response.status}`, errorBody);
      }
      return response;
    }
    async upload(path, formData, options = {}) {
      const url = this.buildURL(path, options.query);
      const headers = {};
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }
      if (options.headers) {
        Object.assign(headers, options.headers);
      }
      const timeout = options.timeout ?? this.timeout;
      const response = await this.fetchWithTimeout(url, {
        method: "POST",
        headers,
        body: formData,
        signal: options.signal
      }, timeout);
      if (!response.ok) {
        const errorBody = await this.parseErrorBody(response);
        throw (0, errors_1.createErrorFromResponse)(response.status, errorBody.message || `HTTP ${response.status}`, errorBody);
      }
      const text = await response.text();
      if (!text) {
        return;
      }
      return JSON.parse(text);
    }
    buildURL(path, query) {
      const url = new URL(path, this.baseURL);
      const mergedQuery = {
        ...this.defaultQuery ?? {},
        ...query ?? {}
      };
      for (const [key, value] of Object.entries(mergedQuery)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
      return url.toString();
    }
    buildHeaders(extra) {
      const headers = { ...this.defaultHeaders };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }
      if (extra) {
        Object.assign(headers, extra);
      }
      return headers;
    }
    async fetchWithTimeout(url, init, timeout) {
      const controller = new AbortController;
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      if (init.signal) {
        init.signal.addEventListener("abort", () => controller.abort());
      }
      try {
        const response = await fetch(url, {
          ...init,
          signal: controller.signal
        });
        return response;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new errors_1.TimeoutError(`Request timed out after ${timeout}ms`);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }
    async parseErrorBody(response) {
      try {
        const body = await response.json();
        return {
          message: body.detail || body.message || body.error,
          ...body
        };
      } catch {
        return { message: `HTTP ${response.status}` };
      }
    }
    parseRetryAfter(response) {
      const header = response.headers.get("Retry-After");
      if (!header)
        return;
      const seconds = Number.parseInt(header, 10);
      if (!Number.isNaN(seconds)) {
        return seconds * 1000;
      }
      const date = Date.parse(header);
      if (!Number.isNaN(date)) {
        return Math.max(0, date - Date.now());
      }
      return;
    }
    getRetryDelay(attempt, retryAfter) {
      if (retryAfter) {
        return retryAfter;
      }
      return INITIAL_RETRY_DELAY * 2 ** attempt;
    }
    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
  }
  exports.HonchoHTTPClient = HonchoHTTPClient;
});

// node_modules/@honcho-ai/sdk/dist/client.js
var require_client2 = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.Honcho = undefined;
  var api_version_1 = require_api_version();
  var client_1 = require_client();
  var message_1 = require_message();
  var pagination_1 = require_pagination();
  var peer_1 = require_peer();
  var session_1 = require_session();
  var utils_1 = require_utils();
  var validation_1 = require_validation();
  var DEFAULT_BASE_URL = "https://api.honcho.dev";

  class Honcho {
    get metadata() {
      return this._metadata;
    }
    get configuration() {
      return this._configuration;
    }
    get http() {
      return this._http;
    }
    get baseURL() {
      return this._http.baseURL;
    }
    constructor(options = {}) {
      const validatedOptions = validation_1.HonchoConfigSchema.parse(options);
      this.workspaceId = validatedOptions.workspaceId || process.env.HONCHO_WORKSPACE_ID || "default";
      let baseURL = validatedOptions.baseURL || process.env.HONCHO_URL;
      if (validatedOptions.environment === "local") {
        baseURL = "http://localhost:8000";
      } else if (!baseURL) {
        baseURL = DEFAULT_BASE_URL;
      }
      this._http = new client_1.HonchoHTTPClient({
        baseURL,
        apiKey: validatedOptions.apiKey || process.env.HONCHO_API_KEY,
        timeout: validatedOptions.timeout,
        maxRetries: validatedOptions.maxRetries,
        defaultHeaders: validatedOptions.defaultHeaders,
        defaultQuery: validatedOptions.defaultQuery
      });
    }
    async _getOrCreateWorkspace(id, params) {
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces`, {
        body: {
          id,
          metadata: params?.metadata,
          configuration: (0, validation_1.workspaceConfigToApi)(params?.configuration)
        }
      });
    }
    async _ensureWorkspace() {
      if (!this._workspaceReady) {
        this._workspaceReady = this._getOrCreateWorkspace(this.workspaceId).then(() => {
          return;
        });
      }
      await this._workspaceReady;
    }
    async _updateWorkspace(workspaceId, params) {
      return this._http.put(`/${api_version_1.API_VERSION}/workspaces/${workspaceId}`, {
        body: {
          metadata: params.metadata,
          configuration: (0, validation_1.workspaceConfigToApi)(params.configuration)
        }
      });
    }
    async _deleteWorkspace(workspaceId) {
      await this._http.delete(`/${api_version_1.API_VERSION}/workspaces/${workspaceId}`);
    }
    async _listWorkspaces(params) {
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/list`, {
        body: {
          filters: params?.filters
        },
        query: {
          page: params?.page,
          size: params?.size
        }
      });
    }
    async _searchWorkspace(workspaceId, params) {
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${workspaceId}/search`, { body: params });
    }
    async _getQueueStatus(workspaceId, params) {
      const query = {};
      if (params?.observer_id)
        query.observer_id = params.observer_id;
      if (params?.sender_id)
        query.sender_id = params.sender_id;
      if (params?.session_id)
        query.session_id = params.session_id;
      return this._http.get(`/${api_version_1.API_VERSION}/workspaces/${workspaceId}/queue/status`, { query });
    }
    async _listPeers(workspaceId, params) {
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${workspaceId}/peers/list`, {
        body: { filters: params?.filters },
        query: {
          page: params?.page,
          size: params?.size,
          reverse: params?.reverse ? "true" : undefined
        }
      });
    }
    async _getOrCreatePeer(workspaceId, params) {
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${workspaceId}/peers`, { body: params });
    }
    async _listSessions(workspaceId, params) {
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${workspaceId}/sessions/list`, {
        body: { filters: params?.filters },
        query: {
          page: params?.page,
          size: params?.size,
          reverse: params?.reverse ? "true" : undefined
        }
      });
    }
    async _getOrCreateSession(workspaceId, params) {
      return this._http.post(`/${api_version_1.API_VERSION}/workspaces/${workspaceId}/sessions`, {
        body: {
          id: params.id,
          metadata: params.metadata,
          configuration: (0, validation_1.sessionConfigToApi)(params.configuration)
        }
      });
    }
    async peer(id, options) {
      await this._ensureWorkspace();
      const validatedId = validation_1.PeerIdSchema.parse(id);
      const validatedMetadata = options?.metadata ? validation_1.PeerMetadataSchema.parse(options.metadata) : undefined;
      const validatedConfiguration = options?.configuration ? validation_1.PeerConfigSchema.parse(options.configuration) : undefined;
      const peerData = await this._getOrCreatePeer(this.workspaceId, {
        id: validatedId,
        configuration: (0, validation_1.peerConfigToApi)(validatedConfiguration),
        metadata: validatedMetadata
      });
      return new peer_1.Peer(validatedId, this.workspaceId, this._http, peerData.metadata ?? undefined, (0, validation_1.peerConfigFromApi)(peerData.configuration) ?? undefined, () => this._ensureWorkspace(), peerData.created_at);
    }
    async peers(options) {
      await this._ensureWorkspace();
      const normalizedOptions = (0, validation_1.normalizeListOptions)(options, [
        "filters",
        "page",
        "size",
        "reverse"
      ]);
      const validatedFilter = normalizedOptions.filters ? validation_1.FilterSchema.parse(normalizedOptions.filters) : undefined;
      const reverse = normalizedOptions.reverse;
      const peersPage = await this._listPeers(this.workspaceId, {
        filters: validatedFilter,
        page: normalizedOptions.page,
        size: normalizedOptions.size,
        reverse
      });
      const fetchNextPage = async (page, size) => {
        return this._listPeers(this.workspaceId, {
          filters: validatedFilter,
          page,
          size,
          reverse
        });
      };
      return new pagination_1.Page(peersPage, (peer) => new peer_1.Peer(peer.id, this.workspaceId, this._http, peer.metadata ?? undefined, (0, validation_1.peerConfigFromApi)(peer.configuration) ?? undefined, () => this._ensureWorkspace(), peer.created_at), fetchNextPage);
    }
    async session(id, options) {
      await this._ensureWorkspace();
      const validatedId = validation_1.SessionIdSchema.parse(id);
      const validatedMetadata = options?.metadata ? validation_1.SessionMetadataSchema.parse(options.metadata) : undefined;
      const validatedConfiguration = options?.configuration ? validation_1.SessionConfigSchema.parse(options.configuration) : undefined;
      const sessionData = await this._getOrCreateSession(this.workspaceId, {
        id: validatedId,
        configuration: validatedConfiguration,
        metadata: validatedMetadata
      });
      return new session_1.Session(validatedId, this.workspaceId, this._http, sessionData.metadata ?? undefined, (0, validation_1.sessionConfigFromApi)(sessionData.configuration) ?? undefined, () => this._ensureWorkspace(), sessionData.created_at, sessionData.is_active);
    }
    async sessions(options) {
      await this._ensureWorkspace();
      const normalizedOptions = (0, validation_1.normalizeListOptions)(options, [
        "filters",
        "page",
        "size",
        "reverse"
      ]);
      const validatedFilter = normalizedOptions.filters ? validation_1.FilterSchema.parse(normalizedOptions.filters) : undefined;
      const reverse = normalizedOptions.reverse;
      const sessionsPage = await this._listSessions(this.workspaceId, {
        filters: validatedFilter,
        page: normalizedOptions.page,
        size: normalizedOptions.size,
        reverse
      });
      const fetchNextPage = async (page, size) => {
        return this._listSessions(this.workspaceId, {
          filters: validatedFilter,
          page,
          size,
          reverse
        });
      };
      return new pagination_1.Page(sessionsPage, (session) => new session_1.Session(session.id, this.workspaceId, this._http, session.metadata ?? undefined, (0, validation_1.sessionConfigFromApi)(session.configuration) ?? undefined, () => this._ensureWorkspace(), session.created_at, session.is_active), fetchNextPage);
    }
    async getMetadata() {
      await this._ensureWorkspace();
      const workspace = await this._getOrCreateWorkspace(this.workspaceId);
      this._metadata = workspace.metadata || {};
      return this._metadata;
    }
    async setMetadata(metadata) {
      await this._ensureWorkspace();
      const validatedMetadata = validation_1.WorkspaceMetadataSchema.parse(metadata);
      await this._updateWorkspace(this.workspaceId, {
        metadata: validatedMetadata
      });
      this._metadata = validatedMetadata;
    }
    async getConfiguration() {
      await this._ensureWorkspace();
      const workspace = await this._getOrCreateWorkspace(this.workspaceId);
      this._configuration = (0, validation_1.workspaceConfigFromApi)(workspace.configuration) || {};
      return this._configuration;
    }
    async setConfiguration(configuration) {
      await this._ensureWorkspace();
      const validatedConfig = validation_1.WorkspaceConfigSchema.parse(configuration);
      await this._updateWorkspace(this.workspaceId, {
        configuration: validatedConfig
      });
      this._configuration = validatedConfig;
    }
    async refresh() {
      await this._ensureWorkspace();
      const workspace = await this._getOrCreateWorkspace(this.workspaceId);
      this._metadata = workspace.metadata || {};
      this._configuration = (0, validation_1.workspaceConfigFromApi)(workspace.configuration) || {};
    }
    async workspaces(options) {
      const normalizedOptions = (0, validation_1.normalizeListOptions)(options, [
        "filters",
        "page",
        "size"
      ]);
      const validatedFilter = normalizedOptions.filters ? validation_1.FilterSchema.parse(normalizedOptions.filters) : undefined;
      const workspacesPage = await this._listWorkspaces({
        filters: validatedFilter,
        page: normalizedOptions.page,
        size: normalizedOptions.size
      });
      const fetchNextPage = async (page, size) => {
        return this._listWorkspaces({
          filters: validatedFilter,
          page,
          size
        });
      };
      return new pagination_1.Page(workspacesPage, (workspace) => workspace.id, fetchNextPage);
    }
    async deleteWorkspace(workspaceId) {
      await this._deleteWorkspace(workspaceId);
    }
    async search(query, options) {
      await this._ensureWorkspace();
      const validatedQuery = validation_1.SearchQuerySchema.parse(query);
      const validatedFilters = options?.filters ? validation_1.FilterSchema.parse(options.filters) : undefined;
      const validatedLimit = options?.limit ? validation_1.LimitSchema.parse(options.limit) : undefined;
      const response = await this._searchWorkspace(this.workspaceId, {
        query: validatedQuery,
        filters: validatedFilters,
        limit: validatedLimit
      });
      return response.map(message_1.Message.fromApiResponse);
    }
    async queueStatus(options) {
      await this._ensureWorkspace();
      const observerId = options?.observer ? (0, utils_1.resolveId)(options.observer) : undefined;
      const senderId = options?.sender ? (0, utils_1.resolveId)(options.sender) : undefined;
      const sessionId = options?.session ? (0, utils_1.resolveId)(options.session) : undefined;
      const queryParams = {};
      if (observerId)
        queryParams.observer_id = observerId;
      if (senderId)
        queryParams.sender_id = senderId;
      if (sessionId)
        queryParams.session_id = sessionId;
      const status = await this._getQueueStatus(this.workspaceId, queryParams);
      return (0, utils_1.transformQueueStatus)(status);
    }
    async scheduleDream(options) {
      await this._ensureWorkspace();
      const observerId = (0, utils_1.resolveId)(options.observer);
      const sessionId = options.session ? (0, utils_1.resolveId)(options.session) : undefined;
      const observedId = options.observed ? (0, utils_1.resolveId)(options.observed) : observerId;
      await this._http.post(`/${api_version_1.API_VERSION}/workspaces/${this.workspaceId}/schedule_dream`, {
        body: {
          observer: observerId,
          observed: observedId,
          session_id: sessionId,
          dream_type: "omni"
        }
      });
    }
    toString() {
      return `Honcho(workspaceId='${this.workspaceId}', baseURL='${this._http.baseURL}')`;
    }
  }
  exports.Honcho = Honcho;
});

export { require_errors, require_message, require_pagination, require_conclusions, require_streaming, require_session_context, require_session, require_peer, require_client2 as require_client };

//# debugId=567E6885C838D4C364756E2164756E21
//# sourceMappingURL=chunk-xdntcesh.js.map
