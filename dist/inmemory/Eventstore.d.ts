/// <reference types="node" />
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { AggregateId, Event as EventType, Options, ReplayOptions, Snapshot } from 'common/types';
export declare class Eventstore extends EventEmitter {
    private database;
    initialize(): Promise<void>;
    getStoredEvents(): EventType[];
    getStoredSnapshots(): Snapshot[];
    storeEventAtDatabase(event: EventType): void;
    storeSnapshotAtDatabase(snapshot: Snapshot): void;
    updateEventInDatabaseAtIndex(index: number, newEventData: EventType): void;
    getLastEvent(aggregateId: AggregateId): Promise<any>;
    getEventStream(aggregateId: AggregateId, options?: Options): Promise<PassThrough>;
    getUnpublishedEventStream(): Promise<PassThrough>;
    saveEvents({ events }: {
        events: EventType[];
    }): Promise<EventType[]>;
    markEventsAsPublished({ aggregateId, fromRevision, toRevision }: any): Promise<void>;
    getSnapshot(aggregateId: AggregateId): Promise<{
        revision: number;
        state: {};
    } | undefined>;
    saveSnapshot({ aggregateId, revision, state }: Snapshot): Promise<void>;
    getReplay(options?: ReplayOptions): Promise<PassThrough>;
    destroy(): Promise<void>;
}
