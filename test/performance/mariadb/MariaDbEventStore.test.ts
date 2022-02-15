const assert = require('assertthat');
const { Event } = require('commands-events');
import { Eventstore } from '../../../src/mariadb';
import { measureTime } from 'measure-time';
import { v4 as uuid } from 'uuid';
import { env } from 'process';

const getEventsForAggregateId = function ({ aggregateId, batchCount, batchSize }) {
  if (!aggregateId) {
    throw new Error('Aggregate id is missing.');
  }
  if (!batchCount) {
    throw new Error('Batch count is missing.');
  }
  if (!batchSize) {
    throw new Error('Batch size is missing.');
  }

  const batches = [];

  for (let i = 0; i < batchCount; i++) {
    batches[i] = [];

    for (let j = 0; j < batchSize; j++) {
      const event = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: aggregateId },
        name: 'started',
        data: { initiator: 'Jane Doe', destination: 'Riva' },
        metadata: { correlationId: aggregateId, causationId: aggregateId }
      });

      event.metadata.revision = i * batchSize + j + 1;

      batches[i].push(event);
    }
  }

  return batches;
};

describe('MariaDb event store performence tests', () => {
  const url = env.MARIADB_URL;
  const type = 'mariadb';
  let eventstore: Eventstore;
  let namespace: string;

  beforeEach(async () => {
    namespace = uuid();
    eventstore = new Eventstore();
    await eventstore.initialize({ url, namespace });
  });

  afterEach(async () => {
    await eventstore.destroy();
  });

  describe('saveEvents', () => {
    it('1000 events individually.', async () => {
      const expected = {
        mariadb: 30,
        mongodb: 15,
        mysql: 30,
        postgres: 15,
        sqlserver: 15,
        inmemory: 15
      };

      const batches = getEventsForAggregateId({
        aggregateId: uuid(),
        batchCount: 1000,
        batchSize: 1
      });

      const getElapsed = measureTime();

      for (let i = 0; i < batches.length; i++) {
        const events = batches[i];

        await eventstore.saveEvents({ events });
      }

      const elapsed = getElapsed();

      assert.that(elapsed.millisecondsTotal).is.lessThan(expected[type] * 1000);
    });

    it('10000 events individually.', async function () {
      this.timeout(180 * 1000);

      const expected = {
        mariadb: 180,
        mongodb: 90,
        mysql: 180,
        postgres: 90,
        sqlserver: 90,
        inmemory: 90
      };

      const batches = getEventsForAggregateId({
        aggregateId: uuid(),
        batchCount: 10000,
        batchSize: 1
      });

      const getElapsed = measureTime();

      for (let i = 0; i < batches.length; i++) {
        const events = batches[i];

        await eventstore.saveEvents({ events });
      }

      const elapsed = getElapsed();

      assert.that(elapsed.millisecondsTotal).is.lessThan(expected[type] * 1000);
    });

    it('10000 events in batches of 10.', async () => {
      const expected = {
        mariadb: 180,
        mongodb: 90,
        mysql: 180,
        postgres: 90,
        sqlserver: 90,
        inmemory: 90
      };

      const batches = getEventsForAggregateId({
        aggregateId: uuid(),
        batchCount: 1000,
        batchSize: 10
      });

      const getElapsed = measureTime();

      for (let i = 0; i < batches.length; i++) {
        const events = batches[i];

        await eventstore.saveEvents({ events });
      }

      const elapsed = getElapsed();

      assert.that(elapsed.millisecondsTotal).is.lessThan(expected[type] * 1000);
    });
  });

  describe('getEventStream', () => {
    it('1000 events.', async () => {
      const expected = {
        mariadb: 30,
        mongodb: 15,
        mysql: 30,
        postgres: 15,
        sqlserver: 15,
        inmemory: 15
      };

      const aggregateId = uuid();

      const batches = getEventsForAggregateId({
        aggregateId,
        batchCount: 10,
        batchSize: 100
      });

      for (let i = 0; i < batches.length; i++) {
        const events = batches[i];

        await eventstore.saveEvents({ events });
      }

      const getElapsed = measureTime();

      const eventStream = await eventstore.getEventStream(aggregateId);

      await new Promise((resolve, reject) => {
        eventStream.once('end', () => {
          try {
            const elapsed = getElapsed();

            assert.that(elapsed.millisecondsTotal).is.lessThan(expected[type] * 1000);
          } catch (ex) {
            return reject(ex);
          }
          resolve(null);
        });

        eventStream.resume();
      });
    });

    it('10000 events.', async () => {
      const expected = {
        mariadb: 180,
        mongodb: 90,
        mysql: 180,
        postgres: 90,
        sqlserver: 90,
        inmemory: 90
      };

      const aggregateId = uuid();

      const batches = getEventsForAggregateId({
        aggregateId,
        batchCount: 100,
        batchSize: 100
      });

      for (let i = 0; i < batches.length; i++) {
        const events = batches[i];

        await eventstore.saveEvents({ events });
      }

      const getElapsed = measureTime();

      const eventStream = await eventstore.getEventStream(aggregateId);

      await new Promise((resolve, reject) => {
        eventStream.once('end', () => {
          try {
            const elapsed = getElapsed();

            assert.that(elapsed.millisecondsTotal).is.lessThan(expected[type] * 1000);
          } catch (ex) {
            return reject(ex);
          }
          resolve(null);
        });

        eventStream.resume();
      });
    });
  });
});
