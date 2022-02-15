import { AggregateId } from './AggregateId';

export type Snapshot = {
  aggregateId: AggregateId;
  revision: number;
  state: {};
};
