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
const events_1 = require("events");
const lodash_1 = require("lodash");
const stream_1 = require("stream");
const common_1 = require("../common");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Event } = require('commands-events');
class Eventstore extends events_1.EventEmitter {
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            this.database = {
                events: [],
                snapshots: [],
            };
        });
    }
    getStoredEvents() {
        return this.database.events;
    }
    getStoredSnapshots() {
        return this.database.snapshots;
    }
    storeEventAtDatabase(event) {
        this.database.events.push(event);
    }
    storeSnapshotAtDatabase(snapshot) {
        this.database.snapshots.push(snapshot);
    }
    updateEventInDatabaseAtIndex(index, newEventData) {
        this.database.events[index] = newEventData;
    }
    getLastEvent(aggregateId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!aggregateId) {
                throw new Error('Aggregate id is missing.');
            }
            const eventsInDatabase = this.getStoredEvents()
                .filter((event) => event.aggregate.id === aggregateId);
            if (eventsInDatabase.length === 0) {
                return;
            }
            const lastEvent = eventsInDatabase[eventsInDatabase.length - 1];
            return Event.wrap(lastEvent);
        });
    }
    getEventStream(aggregateId, options = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!aggregateId) {
                throw new Error('Aggregate id is missing.');
            }
            const fromRevision = options.fromRevision || 1;
            const toRevision = options.toRevision || Math.pow(2, 31) - 1;
            if (fromRevision > toRevision) {
                throw new Error('From revision is greater than to revision.');
            }
            const passThrough = new stream_1.PassThrough({ objectMode: true });
            const filteredEvents = this.getStoredEvents()
                .filter((event) => event.aggregate.id === aggregateId &&
                event.metadata.revision >= fromRevision &&
                event.metadata.revision <= toRevision);
            filteredEvents.forEach((event) => {
                passThrough.write(Event.wrap(event));
            });
            passThrough.end();
            return passThrough;
        });
    }
    getUnpublishedEventStream() {
        return __awaiter(this, void 0, void 0, function* () {
            const filteredEvents = this.getStoredEvents()
                .filter((event) => event.metadata.published === false);
            const passThrough = new stream_1.PassThrough({ objectMode: true });
            filteredEvents.forEach((event) => {
                passThrough.write(Event.wrap(event));
            });
            passThrough.end();
            return passThrough;
        });
    }
    saveEvents({ events }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!events) {
                throw new Error('Events are missing.');
            }
            events = (0, lodash_1.cloneDeep)((0, lodash_1.flatten)([events]));
            const eventsInDatabase = this.getStoredEvents();
            events.forEach((event) => {
                if (eventsInDatabase.find((eventInDatabase) => event.aggregate.id === eventInDatabase.aggregate.id &&
                    event.metadata.revision === eventInDatabase.metadata.revision)) {
                    throw new Error('Aggregate id and revision already exist.');
                }
                const newPosition = eventsInDatabase.length + 1;
                event.data = (0, common_1.omitByDeep)(event.data, (value) => value === undefined);
                event.metadata.position = newPosition;
                this.storeEventAtDatabase(event);
            });
            return events;
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
            const eventsFromDatabase = this.getStoredEvents();
            const shouldEventBeMarkedAsPublished = (event) => event.aggregate.id === aggregateId &&
                event.metadata.revision >= fromRevision &&
                event.metadata.revision <= toRevision;
            for (let i = 0; i < eventsFromDatabase.length; i++) {
                const event = eventsFromDatabase[i];
                if (shouldEventBeMarkedAsPublished(event)) {
                    const eventToUpdate = (0, lodash_1.cloneDeep)(event);
                    eventToUpdate.metadata.published = true;
                    this.updateEventInDatabaseAtIndex(i, eventToUpdate);
                }
            }
        });
    }
    getSnapshot(aggregateId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!aggregateId) {
                throw new Error('Aggregate id is missing.');
            }
            const matchingSnapshotsForAggregateId = this.getStoredSnapshots()
                .filter((snapshot) => snapshot.aggregateId === aggregateId);
            const newestSnapshotRevision = Math.max(...matchingSnapshotsForAggregateId.map((snapshot) => snapshot.revision));
            const matchingSnapshot = matchingSnapshotsForAggregateId
                .find((snapshot) => snapshot.revision === newestSnapshotRevision);
            if (!matchingSnapshot) {
                return;
            }
            return {
                revision: matchingSnapshot.revision,
                state: matchingSnapshot.state,
            };
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
            this.storeSnapshotAtDatabase({
                aggregateId,
                revision,
                state,
            });
        });
    }
    getReplay(options = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            const fromPosition = options.fromPosition || 1;
            const toPosition = options.toPosition || Math.pow(2, 31) - 1;
            if (fromPosition > toPosition) {
                throw new Error('From position is greater than to position.');
            }
            const passThrough = new stream_1.PassThrough({ objectMode: true });
            const filteredEvents = this.getStoredEvents()
                .filter((event) => event.metadata.position >= fromPosition &&
                event.metadata.position <= toPosition);
            filteredEvents.forEach((event) => {
                passThrough.write(Event.wrap(event));
            });
            passThrough.end();
            return passThrough;
        });
    }
    destroy() {
        return __awaiter(this, void 0, void 0, function* () {
            this.database = {
                events: [],
                snapshots: [],
            };
        });
    }
}
exports.Eventstore = Eventstore;
//# sourceMappingURL=Eventstore.js.map