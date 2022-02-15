"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.omitByDeep = exports.limitAlpha = void 0;
const lodash_1 = require("lodash");
const _ = require("lodash");
function limitAlpha(string) {
    return string.replace(/[\W_]+/g, '');
}
exports.limitAlpha = limitAlpha;
function omitByDeep(obj, predicate) {
    if (!predicate) {
        throw new Error('Predicate is missing.');
    }
    if (!(0, lodash_1.isObject)(obj) || (0, lodash_1.isArray)(obj)) {
        return obj;
    }
    return _(obj)
        .omitBy(predicate)
        .mapValues((value) => omitByDeep(value, predicate))
        .value();
}
exports.omitByDeep = omitByDeep;
//# sourceMappingURL=utils.js.map