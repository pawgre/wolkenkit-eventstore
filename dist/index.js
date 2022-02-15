"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MariaDbEventstore = exports.InMemoryEventstore = void 0;
var inmemory_1 = require("./inmemory");
Object.defineProperty(exports, "InMemoryEventstore", { enumerable: true, get: function () { return inmemory_1.Eventstore; } });
var mariadb_1 = require("./mariadb");
Object.defineProperty(exports, "MariaDbEventstore", { enumerable: true, get: function () { return mariadb_1.Eventstore; } });
//# sourceMappingURL=index.js.map