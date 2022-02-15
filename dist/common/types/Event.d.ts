import { AggregateId } from './AggregateId';
export declare type Event = {
    aggregate: {
        id: AggregateId;
    };
    data: {};
    metadata: {
        revision: number;
        published: boolean;
        position: number;
    };
};
