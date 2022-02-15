/// <reference types="node" />
import { PoolConnection } from 'mysql2/promise';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { AggregateId, Event as EventType, Options, ReplayOptions, Snapshot } from 'common/types';
export declare class Eventstore extends EventEmitter {
    private namespace;
    private pool;
    getDatabase(): Promise<PoolConnection>;
    initialize({ url, namespace }: {
        url: string;
        namespace: string;
    }): Promise<void>;
    getLastEvent(aggregateId: AggregateId): Promise<any>;
    getEventStream(aggregateId: AggregateId, opts?: Options | null): Promise<PassThrough>;
    getUnpublishedEventStream(): Promise<PassThrough>;
    saveEvents({ events }: {
        events: EventType[];
    }): Promise<EventType[]>;
    markEventsAsPublished({ aggregateId, fromRevision, toRevision }: any): Promise<void>;
    getSnapshot(aggregateId: AggregateId): Promise<{
        revision: any;
        state: any;
    } | undefined>;
    saveSnapshot({ aggregateId, revision, state }: Snapshot): Promise<void>;
    getReplay(options?: ReplayOptions): Promise<PassThrough>;
    destroy(): Promise<void>;
}
