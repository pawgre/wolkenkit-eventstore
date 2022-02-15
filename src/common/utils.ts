import { isArray, isObject } from 'lodash';
import * as _ from 'lodash';

export function limitAlpha(string: string) {
  return string.replace(/[\W_]+/g, '');
}

export function omitByDeep(obj: {}, predicate?: any): any {
  if (!predicate) {
    throw new Error('Predicate is missing.');
  }

  if (!isObject(obj) || isArray(obj)) {
    return obj;
  }

  return _(obj)
    .omitBy(predicate)
    .mapValues((value) => omitByDeep(value, predicate))
    .value();
}
