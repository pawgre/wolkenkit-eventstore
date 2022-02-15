/* eslint-disable @typescript-eslint/no-var-requires */
import {
  Pool,
  createPool,
  PoolConnection,
  RowDataPacket,
} from 'mysql2/promise';
import { EventEmitter } from 'events';
import { cloneDeep, flatten } from 'lodash';
import { PassThrough } from 'stream';
import { omitByDeep, limitAlpha } from '../common';
import { Event } from '../index';
import {
  AggregateId,
  Event as EventType,
  Options,
  ReplayOptions,
  Snapshot,
} from 'common/types';

const DsnParser = require('dsn-parser');

export class Eventstore extends EventEmitter {
  private namespace: string;
  private pool: Pool;

  async getDatabase(): Promise<PoolConnection> {
    return this.pool.getConnection();
  }

  async initialize({ url, namespace }: { url: string, namespace: string }) {
    if (!url) {
      throw new Error('Url is missing.');
    }
    if (!namespace) {
      throw new Error('Namespace is missing.');
    }

    this.namespace = `store_${limitAlpha(namespace)}`;

    const { host, port, user, password, database } = new DsnParser(url).getParts();

    this.pool = createPool({
      host,
      port,
      user,
      password,
      database,
      multipleStatements: true,
    });

    this.pool.on('connection', (connection) => {
      connection.on('error', () => {
        this.emit('disconnect');
      });
      connection.on('end', () => {
        this.emit('disconnect');
      });
    });

    const connection = await this.getDatabase();

    const query = `
      CREATE FUNCTION IF NOT EXISTS UuidToBin(_uuid BINARY(36))
        RETURNS BINARY(16)
        RETURN UNHEX(CONCAT(
          SUBSTR(_uuid, 15, 4),
          SUBSTR(_uuid, 10, 4),
          SUBSTR(_uuid, 1, 8),
          SUBSTR(_uuid, 20, 4),
          SUBSTR(_uuid, 25)
        ));

      CREATE FUNCTION IF NOT EXISTS UuidFromBin(_bin BINARY(16))
        RETURNS BINARY(36)
        RETURN LCASE(CONCAT_WS('-',
          HEX(SUBSTR(_bin,  5, 4)),
          HEX(SUBSTR(_bin,  3, 2)),
          HEX(SUBSTR(_bin,  1, 2)),
          HEX(SUBSTR(_bin,  9, 2)),
          HEX(SUBSTR(_bin, 11))
        ));

      CREATE TABLE IF NOT EXISTS ${this.namespace}_events (
        position SERIAL,
        aggregateId BINARY(16) NOT NULL,
        revision INT NOT NULL,
        event JSON NOT NULL,
        hasBeenPublished BOOLEAN NOT NULL,

        PRIMARY KEY(position),
        UNIQUE (aggregateId, revision)
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS ${this.namespace}_snapshots (
        aggregateId BINARY(16) NOT NULL,
        revision INT NOT NULL,
        state JSON NOT NULL,

        PRIMARY KEY(aggregateId, revision)
      ) ENGINE=InnoDB;
    `;

    await connection.query(query);
    return connection.release();
  }

  async getLastEvent(aggregateId: AggregateId) {
    if (!aggregateId) {
      throw new Error('Aggregate id is missing.');
    }

    const connection = await this.getDatabase();

    try {
      const [rows] = await connection.execute<RowDataPacket[]>(`
        SELECT event, position
          FROM ${this.namespace}_events
          WHERE aggregateId = UuidToBin(?)
          ORDER BY revision DESC
          LIMIT 1
        `, [aggregateId]);

      if (rows.length === 0) {
        return;
      }

      const event = Event.wrap(JSON.parse(rows[0].event));

      event.metadata.position = Number(rows[0].position);

      return event;
    } finally {
      connection.release();
    }
  }

  async getEventStream(aggregateId: AggregateId, opts: Options | null = null) {
    if (!aggregateId) {
      throw new Error('Aggregate id is missing.');
    }

    const options: Options = opts || {};
    const fromRevision = options.fromRevision || 1;
    const toRevision = options.toRevision || 2 ** 31 - 1;

    if (fromRevision > toRevision) {
      throw new Error('From revision is greater than to revision.');
    }

    const connection = await this.getDatabase();
    const passThrough = new PassThrough({ objectMode: true });
    const eventStream: EventEmitter = (<any>connection).connection.execute(
      `
      SELECT event, position, hasBeenPublished
        FROM ${this.namespace}_events
        WHERE aggregateId = UuidToBin(?)
          AND revision >= ?
          AND revision <= ?
        ORDER BY revision`,
      [aggregateId, fromRevision, toRevision],
    );

    const unsubscribe = () => {
      connection.release();
      eventStream.removeAllListeners();
    };

    const onEnd = () => {
      unsubscribe();
      passThrough.end();
    };

    const onError = (err: Error) => {
      unsubscribe();
      passThrough.emit('error', err);
      passThrough.end();
    };

    const onResult = (row: RowDataPacket) => {
      const event = Event.wrap(JSON.parse(row.event));

      event.metadata.position = Number(row.position);
      event.metadata.published = Boolean(row.hasBeenPublished);
      passThrough.write(event);
    };

    eventStream.on('end', onEnd);
    eventStream.on('error', onError);
    eventStream.on('result', onResult);

    return passThrough;
  }

  async getUnpublishedEventStream() {
    const connection = await this.getDatabase();

    const passThrough = new PassThrough({ objectMode: true });
    const eventStream: EventEmitter = (<any>connection).connection.execute(`
      SELECT event, position, hasBeenPublished
        FROM ${this.namespace}_events
        WHERE hasBeenPublished = false
        ORDER BY position
    `);

    const unsubscribe = () => {
      connection.release();
      eventStream.removeAllListeners();
    };

    const onEnd = () => {
      unsubscribe();
      passThrough.end();
    };

    const onError = (err: Error) => {
      unsubscribe();
      passThrough.emit('error', err);
      passThrough.end();
    };

    const onResult = (row: RowDataPacket) => {
      const event = Event.wrap(JSON.parse(row.event));

      event.metadata.position = Number(row.position);
      event.metadata.published = Boolean(row.hasBeenPublished);
      passThrough.write(event);
    };

    eventStream.on('end', onEnd);
    eventStream.on('error', onError);
    eventStream.on('result', onResult);

    return passThrough;
  }

  async saveEvents({ events } : { events: EventType[] }) {
    if (!events) {
      throw new Error('Events are missing.');
    }

    events = cloneDeep(flatten([events]));

    const connection = await this.getDatabase();

    const placeholders = [];
    const values = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      placeholders.push('(UuidToBin(?), ?, ?, ?)');
      values.push(event.aggregate.id, event.metadata.revision, JSON.stringify(event), event.metadata.published);
    }

    const text = `
      INSERT INTO ${this.namespace}_events
        (aggregateId, revision, event, hasBeenPublished)
      VALUES
        ${placeholders.join(',')};
    `;

    try {
      await connection.execute(text, values);

      const [rows] = await connection.execute<RowDataPacket[]>('SELECT LAST_INSERT_ID() AS position;');
      // We only get the ID of the first inserted row, but since it's all in a
      // single INSERT statement, the database guarantees that the positions are
      // sequential, so we easily calculate them by ourselves.
      for (let i = 0; i < events.length; i++) {
        events[i].metadata.position = Number(rows[0].position) + i;
      }

      return events;
    } catch (ex: any) {
      if (ex.code === 'ER_DUP_ENTRY' && ex.sqlMessage.endsWith('for key \'aggregateId\'')) {
        throw new Error('Aggregate id and revision already exist.');
      }

      throw ex;
    } finally {
      connection.release();
    }
  }

  async markEventsAsPublished({ aggregateId, fromRevision, toRevision }: any) {
    if (!aggregateId) {
      throw new Error('Aggregate id is missing.');
    }
    if (!fromRevision) {
      throw new Error('From revision is missing.');
    }
    if (!toRevision) {
      throw new Error('To revision is missing.');
    }

    if (fromRevision > toRevision) {
      throw new Error('From revision is greater than to revision.');
    }

    const connection = await this.getDatabase();

    try {
      await connection.execute(`
        UPDATE ${this.namespace}_events
          SET hasBeenPublished = true
          WHERE aggregateId = UuidToBin(?)
            AND revision >= ?
            AND revision <= ?
      `, [aggregateId, fromRevision, toRevision]);
    } finally {
      connection.release();
    }
  }

  async getSnapshot(aggregateId: AggregateId) {
    if (!aggregateId) {
      throw new Error('Aggregate id is missing.');
    }

    const connection = await this.getDatabase();

    try {
      const [rows] = await connection.execute<RowDataPacket[]>(`
        SELECT state, revision
          FROM ${this.namespace}_snapshots
          WHERE aggregateId = UuidToBin(?)
          ORDER BY revision DESC
          LIMIT 1
      `, [aggregateId]);

      if (rows.length === 0) {
        return;
      }

      return {
        revision: rows[0].revision,
        state: JSON.parse(rows[0].state),
      };
    } finally {
      connection.release();
    }
  }

  async saveSnapshot({ aggregateId, revision, state }: Snapshot) {
    if (!aggregateId) {
      throw new Error('Aggregate id is missing.');
    }
    if (!revision) {
      throw new Error('Revision is missing.');
    }
    if (!state) {
      throw new Error('State is missing.');
    }

    state = omitByDeep(state, (value: any) => value === undefined);
    const connection = await this.getDatabase();

    try {
      await connection.execute(`
        INSERT IGNORE INTO ${this.namespace}_snapshots
          (aggregateId, revision, state)
          VALUES (UuidToBin(?), ?, ?);
      `, [aggregateId, revision, JSON.stringify(state)]);
    } finally {
      connection.release();
    }
  }

  async getReplay(options: ReplayOptions = {}) {
    const fromPosition = options.fromPosition || 1;
    const toPosition = options.toPosition || 2 ** 31 - 1;

    if (fromPosition > toPosition) {
      throw new Error('From position is greater than to position.');
    }

    const connection = await this.getDatabase();
    const passThrough = new PassThrough({ objectMode: true });
    const eventStream: EventEmitter = (<any>connection).connection.execute(`
      SELECT event, position
        FROM ${this.namespace}_events
        WHERE position >= ?
          AND position <= ?
        ORDER BY position
      `, [fromPosition, toPosition]);

    const unsubscribe = () => {
      connection.release();
      eventStream.removeAllListeners();
    };

    const onEnd = () => {
      unsubscribe();
      passThrough.end();
    };

    const onError = (err: Error) => {
      unsubscribe();
      passThrough.emit('error', err);
      passThrough.end();
    };

    const onResult = (row: RowDataPacket) => {
      const event = Event.wrap(JSON.parse(row.event));

      event.metadata.position = Number(row.position);
      passThrough.write(event);
    };

    eventStream.on('end', onEnd);
    eventStream.on('error', onError);
    eventStream.on('result', onResult);

    return passThrough;
  }

  async destroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
