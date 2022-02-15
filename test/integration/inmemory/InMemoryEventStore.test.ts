import path = require('path')
import { v4 as uuid } from 'uuid';
import { runAppConcurrently } from '../common/setup';

describe('saves concurrently', () => {
  it('2 clients, 5 batches, 1 event each.', async () => {
    const app = path.join(__dirname, '../app/app.js');

    const env = {
      BATCH_COUNT: 5,
      BATCH_SIZE: 1,
      FLASCHENPOST_FORMATTER: 'human',
      NAMESPACE: `store_${uuid()}`,
      TYPE: 'inmemory',
    };

    await runAppConcurrently({
      app,
      count: 2,
      env,
    });
  });

  it('20 clients, 10 batches, 10 events each.', async () => {
    const app = path.join(__dirname, '../app/app.js');

    const env = {
      BATCH_COUNT: 10,
      BATCH_SIZE: 10,
      FLASCHENPOST_FORMATTER: 'human',
      NAMESPACE: `store_${uuid()}`,
      TYPE: 'inmemory',
    };

    await runAppConcurrently({
      app,
      count: 20,
      env,
    });
  });
});
