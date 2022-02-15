'use strict';

const { env } = require('process');
const { Event } = require('commands-events');
const { Eventstore } = require(`../../../dist/${env.TYPE}/Eventstore`);
const { v4 } = require('uuid');

const batchCount = env.BATCH_COUNT;
const batchSize = env.BATCH_SIZE;
const namespace = env.NAMESPACE;
const type = env.TYPE;
const url = env.URL;

const eventstore = new Eventstore();
const saveEventBatch = async function (remaining) {
  if (remaining <= 0) {
    process.exit(0);
  }

  const events = [];

  for (let i = 0; i < batchSize; i++) {
    const event = new Event({
      context: { name: 'planning' },
      aggregate: { name: 'peerGroup', id: v4() },
      name: 'started',
      data: { initiator: 'Jane Doe', destination: 'Riva' },
      metadata: { correlationId: v4(), causationId: v4() }
    });

    event.metadata.revision = 1;

    events.push(event);
  }

  try {
    await eventstore.saveEvents({ events });
  } catch (ex) {
    console.error('Failed to save events.', { ex });
    process.exit(1);
  }

  await saveEventBatch(remaining - 1);
};

(async () => {
  try {
    await eventstore.initialize({ url, namespace });
  } catch (ex) {
    console.error('Failed to initialize eventstore.', { type, ex });
    process.exit(1);
  }

  await saveEventBatch(batchCount);
})();
