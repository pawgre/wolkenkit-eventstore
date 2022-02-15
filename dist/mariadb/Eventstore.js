"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Eventstore = void 0;
/* eslint-disable @typescript-eslint/no-var-requires */
const promise_1 = require("mysql2/promise");
const events_1 = require("events");
const lodash_1 = require("lodash");
const stream_1 = require("stream");
const common_1 = require("../common");
const { Event } = require('commands-events');
const DsnParser = require('dsn-parser');
class Eventstore extends events_1.EventEmitter {
    getDatabase() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.pool.getConnection();
        });
    }
    initialize({ url, namespace }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!url) {
                throw new Error('Url is missing.');
            }
            if (!namespace) {
                throw new Error('Namespace is missing.');
            }
            this.namespace = `store_${(0, common_1.limitAlpha)(namespace)}`;
            const { host, port, user, password, database } = new DsnParser(url).getParts();
            this.pool = (0, promise_1.createPool)({
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
            const connection = yield this.getDatabase();
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
            yield connection.query(query);
            return connection.release();
        });
    }
    getLastEvent(aggregateId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!aggregateId) {
                throw new Error('Aggregate id is missing.');
            }
            const connection = yield this.getDatabase();
            try {
                const [rows] = yield connection.execute(`
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
            }
            finally {
                connection.release();
            }
        });
    }
    getEventStream(aggregateId, opts = null) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!aggregateId) {
                throw new Error('Aggregate id is missing.');
            }
            const options = opts || {};
            const fromRevision = options.fromRevision || 1;
            const toRevision = options.toRevision || Math.pow(2, 31) - 1;
            if (fromRevision > toRevision) {
                throw new Error('From revision is greater than to revision.');
            }
            const connection = yield this.getDatabase();
            const passThrough = new stream_1.PassThrough({ objectMode: true });
            const eventStream = connection.connection.execute(`
      SELECT event, position, hasBeenPublished
        FROM ${this.namespace}_events
        WHERE aggregateId = UuidToBin(?)
          AND revision >= ?
          AND revision <= ?
        ORDER BY revision`, [aggregateId, fromRevision, toRevision]);
            const unsubscribe = () => {
                connection.release();
                eventStream.removeAllListeners();
            };
            const onEnd = () => {
                unsubscribe();
                passThrough.end();
            };
            const onError = (err) => {
                unsubscribe();
                passThrough.emit('error', err);
                passThrough.end();
            };
            const onResult = (row) => {
                const event = Event.wrap(JSON.parse(row.event));
                event.metadata.position = Number(row.position);
                event.metadata.published = Boolean(row.hasBeenPublished);
                passThrough.write(event);
            };
            eventStream.on('end', onEnd);
            eventStream.on('error', onError);
            eventStream.on('result', onResult);
            return passThrough;
        });
    }
    getUnpublishedEventStream() {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = yield this.getDatabase();
            const passThrough = new stream_1.PassThrough({ objectMode: true });
            const eventStream = connection.connection.execute(`
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
            const onError = (err) => {
                unsubscribe();
                passThrough.emit('error', err);
                passThrough.end();
            };
            const onResult = (row) => {
                const event = Event.wrap(JSON.parse(row.event));
                event.metadata.position = Number(row.position);
                event.metadata.published = Boolean(row.hasBeenPublished);
                passThrough.write(event);
            };
            eventStream.on('end', onEnd);
            eventStream.on('error', onError);
            eventStream.on('result', onResult);
            return passThrough;
        });
    }
    saveEvents({ events }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!events) {
                throw new Error('Events are missing.');
            }
            events = (0, lodash_1.cloneDeep)((0, lodash_1.flatten)([events]));
            const connection = yield this.getDatabase();
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
                yield connection.execute(text, values);
                const [rows] = yield connection.execute('SELECT LAST_INSERT_ID() AS position;');
                // We only get the ID of the first inserted row, but since it's all in a
                // single INSERT statement, the database guarantees that the positions are
                // sequential, so we easily calculate them by ourselves.
                for (let i = 0; i < events.length; i++) {
                    events[i].metadata.position = Number(rows[0].position) + i;
                }
                return events;
            }
            catch (ex) {
                if (ex.code === 'ER_DUP_ENTRY' && ex.sqlMessage.endsWith('for key \'aggregateId\'')) {
                    throw new Error('Aggregate id and revision already exist.');
                }
                throw ex;
            }
            finally {
                connection.release();
            }
        });
    }
    markEventsAsPublished({ aggregateId, fromRevision, toRevision }) {
        return __awaiter(this, void 0, void 0, function* () {
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
            const connection = yield this.getDatabase();
            try {
                yield connection.execute(`
        UPDATE ${this.namespace}_events
          SET hasBeenPublished = true
          WHERE aggregateId = UuidToBin(?)
            AND revision >= ?
            AND revision <= ?
      `, [aggregateId, fromRevision, toRevision]);
            }
            finally {
                connection.release();
            }
        });
    }
    getSnapshot(aggregateId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!aggregateId) {
                throw new Error('Aggregate id is missing.');
            }
            const connection = yield this.getDatabase();
            try {
                const [rows] = yield connection.execute(`
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
            }
            finally {
                connection.release();
            }
        });
    }
    saveSnapshot({ aggregateId, revision, state }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!aggregateId) {
                throw new Error('Aggregate id is missing.');
            }
            if (!revision) {
                throw new Error('Revision is missing.');
            }
            if (!state) {
                throw new Error('State is missing.');
            }
            state = (0, common_1.omitByDeep)(state, (value) => value === undefined);
            const connection = yield this.getDatabase();
            try {
                yield connection.execute(`
        INSERT IGNORE INTO ${this.namespace}_snapshots
          (aggregateId, revision, state)
          VALUES (UuidToBin(?), ?, ?);
      `, [aggregateId, revision, JSON.stringify(state)]);
            }
            finally {
                connection.release();
            }
        });
    }
    getReplay(options = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            const fromPosition = options.fromPosition || 1;
            const toPosition = options.toPosition || Math.pow(2, 31) - 1;
            if (fromPosition > toPosition) {
                throw new Error('From position is greater than to position.');
            }
            const connection = yield this.getDatabase();
            const passThrough = new stream_1.PassThrough({ objectMode: true });
            const eventStream = connection.connection.execute(`
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
            const onError = (err) => {
                unsubscribe();
                passThrough.emit('error', err);
                passThrough.end();
            };
            const onResult = (row) => {
                const event = Event.wrap(JSON.parse(row.event));
                event.metadata.position = Number(row.position);
                passThrough.write(event);
            };
            eventStream.on('end', onEnd);
            eventStream.on('error', onError);
            eventStream.on('result', onResult);
            return passThrough;
        });
    }
    destroy() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.pool) {
                yield this.pool.end();
            }
        });
    }
}
exports.Eventstore = Eventstore;
//# sourceMappingURL=Eventstore.js.map