import { AggregateId } from './AggregateId';
export declare type Snapshot = {
    aggregateId: AggregateId;
    revision: number;
    state: {};
};
