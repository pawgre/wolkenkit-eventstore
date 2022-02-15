import { omitByDeep } from '../common';
import { assert } from 'assertthat';

describe('omitByDeep', () => {
  
  it('is a function.', async () => {
    assert.that(omitByDeep).is.ofType('function');
  });

  it('throws an error if predicate is missing.', async () => {
    assert.that(() => {
      omitByDeep(23);
    }).is.throwing('Predicate is missing.');
  });

  it('returns the value if it is not an object.', async () => {
    assert.that(omitByDeep(23, value => value)).is.equalTo(23);
  });

  it('returns the value even for falsy values.', async () => {
    assert.that(omitByDeep(0, value => value)).is.equalTo(0);
  });

  it('returns the value even for undefined.', async () => {
    assert.that(omitByDeep(undefined, value => value)).is.undefined();
  });

  it('returns the value if it is an object.', async () => {
    assert.that(omitByDeep({ foo: 'bar' }, value => value === undefined)).is.equalTo({ foo: 'bar' });
  });

  it('omits properties that fulfill the predicate.', async () => {
    assert.that(omitByDeep({ foo: 'bar', bar: 'baz' }, value => value === 'bar')).is.equalTo({ bar: 'baz' });
  });

  it('omits undefined, but not null, if predicate checks for undefined.', async () => {
    assert.that(omitByDeep({ foo: null, bar: undefined }, value => value === undefined)).is.equalTo({ foo: null });
  });

  it('correctly handles empty arrays.', async () => {
    assert.that(omitByDeep({ bar: 'baz', foo: []}, value => value === undefined)).is.equalTo({ bar: 'baz', foo: []});
  });
});
